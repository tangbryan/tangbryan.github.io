/* ============================================================
   table.js — the table graphic. A pure render: given the state of a round it
   draws the felt, the three seats and the multiplier chain, and holds nothing
   of its own. app.js calls it on every keystroke of the round form, so the
   table is what you read while entering, not a picture drawn afterwards.

   Everything is SVG, including the labels. SVG text inherits the page's font
   stack, stays selectable and readable to a screen reader, and lives in the
   same coordinate system as the geometry — so the whole thing scales as one
   piece instead of an HTML overlay drifting out of register on resize.

   Three phases:
     idle    no landlord chosen yet — the 底牌 sit unclaimed at the top
     draft   a landlord is set; the stake and everyone's exposure update live
     result  a round was just recorded; deltas fly out and the chain locks in
   ============================================================ */

import { multiplier } from './scoring.js';
import { initials, signed } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

function s(spec, props = {}, children = []) {
    const [tag, ...classes] = String(spec).split('.');
    const node = document.createElementNS(NS, tag);
    if (classes.length) node.setAttribute('class', classes.join(' '));
    Object.entries(props || {}).forEach(([k, v]) => {
        if (v == null || v === false) return;
        node.setAttribute(k, v === true ? '' : String(v));
    });
    (Array.isArray(children) ? children : [children])
        .filter((c) => c != null && c !== false)
        .forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return node;
}

/* Geometry. The felt is an ellipse and the seats sit just outside it, so no
   seat ever overlaps the surface the cards are played on. */
const W = 620, H = 515;
const FELT = { cx: 310, cy: 240, rx: 214, ry: 138 };
const SEATS = [
    { x: 310, y: 418, label: 'bottom' },   // seat 0 — you, nearest the reader
    { x: 64, y: 120, label: 'upper left' },
    { x: 556, y: 120, label: 'upper right' },
];
const SEAT_R = 38;

/* ---------------- defs ---------------- */

function defs() {
    return s('defs', {}, [
        s('radialGradient', { id: 'dd-felt', cx: '50%', cy: '38%', r: '75%' }, [
            s('stop', { offset: '0%', 'stop-color': '#1d4c3a' }),
            s('stop', { offset: '60%', 'stop-color': '#143a2c' }),
            s('stop', { offset: '100%', 'stop-color': '#0e2a20' }),
        ]),
        s('linearGradient', { id: 'dd-rim', x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, [
            s('stop', { offset: '0%', 'stop-color': '#3a3a48' }),
            s('stop', { offset: '100%', 'stop-color': '#1a1a24' }),
        ]),
        s('linearGradient', { id: 'dd-cardback', x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, [
            s('stop', { offset: '0%', 'stop-color': '#3b2f63' }),
            s('stop', { offset: '100%', 'stop-color': '#22203a' }),
        ]),
        s('filter', { id: 'dd-soft', x: '-50%', y: '-50%', width: '200%', height: '200%' }, [
            s('feGaussianBlur', { stdDeviation: '7', result: 'b' }),
            s('feMerge', {}, [s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })]),
        ]),
    ]);
}

/* ---------------- the felt ---------------- */

function felt() {
    return s('g.dd-felt-group', {}, [
        s('ellipse', { cx: FELT.cx, cy: FELT.cy + 6, rx: FELT.rx + 13, ry: FELT.ry + 13, fill: 'url(#dd-rim)' }),
        s('ellipse', { cx: FELT.cx, cy: FELT.cy, rx: FELT.rx, ry: FELT.ry, fill: 'url(#dd-felt)' }),
        s('ellipse', {
            cx: FELT.cx, cy: FELT.cy, rx: FELT.rx - 10, ry: FELT.ry - 10,
            fill: 'none', stroke: 'rgba(255,255,255,.055)', 'stroke-width': 1,
        }),
    ]);
}

/**
 * 底牌 — the three cards the landlord takes. They are the physical token of
 * the role, so they lean toward whoever claimed them and go gold once a
 * landlord is set; unclaimed they sit square and dim at the top of the felt.
 */
function kitty(landlordSeat) {
    const claimed = landlordSeat != null;
    const home = { x: FELT.cx, y: FELT.cy - 86 };
    let lean = 0;
    if (claimed) lean = landlordSeat === 1 ? -13 : landlordSeat === 2 ? 13 : 0;

    const cards = [-1, 0, 1].map((i) => s('g', { transform: `rotate(${i * 12 + lean} ${home.x} ${home.y + 30})` }, [
        s('rect', {
            x: home.x - 17 + i * 23, y: home.y - 25, width: 34, height: 50, rx: 5,
            fill: claimed ? '#f0d089' : 'url(#dd-cardback)',
            stroke: claimed ? '#e8b44a' : '#4a4468', 'stroke-width': 1.25,
        }),
        claimed ? s('text.dd-kitty-mark', {
            x: home.x + i * 23, y: home.y + 6, 'text-anchor': 'middle', fill: '#8a5f14',
        }, ['地', '主', '牌'][i + 1]) : null,
    ]));

    return s('g.dd-kitty', { 'data-claimed': claimed ? 'yes' : 'no' }, cards);
}

/* ---------------- the multiplier chain ---------------- */

/**
 * Chip widths are laid out by hand, so the glyphs have to be measured rather
 * than counted: 炸弹 is two characters but twice the width of two digits, and
 * getting that wrong runs the label into the value.
 */
const textWidth = (str, size) => [...String(str)]
    .reduce((w, ch) => w + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? size : ch === '\u00d7' ? size * 0.72 : size * 0.58), 0);

/**
 * `底分 2 × 炸弹 ×4 × 春天 ×2 = 16`. The factors come back from the engine
 * rather than being rebuilt here, so what the table shows and what the store
 * records can never disagree.
 */
function chain({ call, chainInfo, stake, phase, redeal, compact }) {
    const y = FELT.cy + 2;
    if (redeal) {
        return s('g.dd-chain', {}, [
            s('text.dd-chain-none', { x: FELT.cx, y, 'text-anchor': 'middle' }, '流局'),
            s('text.dd-chain-sub', { x: FELT.cx, y: y + 24, 'text-anchor': 'middle' }, 'nobody called — no score'),
        ]);
    }
    if (!call) {
        return s('g.dd-chain', {}, [
            s('text.dd-chain-sub', { x: FELT.cx, y: y + 4, 'text-anchor': 'middle' }, 'Pick a landlord and a call'),
        ]);
    }

    const chips = [{ label: '底分', value: `${call}`, kind: 'base' },
        ...chainInfo.factors.map((f) => ({
            // The count is a prefix and the product is the value — "2× 炸弹 … ×4"
            // reads as two bombs worth four, where "炸弹×2 ×4" reads as neither.
            label: (f.count > 1 ? `${f.count}× ` : '') + f.cn, value: `×${f.factor}`, kind: f.key,
        }))];

    // On a phone the whole graphic scales down with its container, so the chips
    // are laid out in bigger viewBox units there. Sizes live here rather than in
    // CSS because the widths below are measured from them.
    const FS = compact ? 21 : 13;
    const CHIP_H = compact ? 50 : 34, GAP = compact ? 13 : 9, PAD = compact ? 14 : 10;
    const TOTAL_FS = compact ? 38 : 27;

    const items = chips.map((c) => ({
        kind: 'chip', c,
        w: Math.max(compact ? 84 : 52, PAD * 2 + 8 + textWidth(c.label, FS) + textWidth(c.value, FS)),
    }));
    items.push({ kind: 'total', w: (compact ? 30 : 22) + textWidth(String(stake), TOTAL_FS) });

    /*
     * A long chain (call, two bombs, a rocket and a spring) is wider than the
     * felt, so it wraps instead of spilling over the rim or being shrunk back
     * to the size the bigger type was meant to fix.
     */
    const MAXW = FELT.rx * 2 - 36;
    const rows = [];
    let row = [], rw = 0;
    items.forEach((it) => {
        const add = row.length ? GAP + it.w : it.w;
        if (row.length && rw + add > MAXW) { rows.push({ items: row, w: rw }); row = []; rw = 0; }
        rw += row.length ? GAP + it.w : it.w;
        row.push(it);
    });
    if (row.length) rows.push({ items: row, w: rw });

    const rowH = CHIP_H + (compact ? 14 : 10);
    // A wrapped chain grows upward into the 底牌, so it is anchored a little
    // lower — there is room below it and none above.
    const top = y - ((rows.length - 1) * rowH) / 2 + (rows.length > 1 ? rowH * 0.3 : 0);

    const g = s('g.dd-chain', { 'data-phase': phase });
    let n = 0;
    rows.forEach((r, ri) => {
        const ry = top + ri * rowH;
        let x = FELT.cx - r.w / 2;
        r.items.forEach((it, ci) => {
            if (it.kind === 'total') {
                g.append(s('text.dd-chain-eq', { x, y: ry + 7 }, '='));
                g.append(s('text.dd-chain-total', { x: x + (compact ? 32 : 26), y: ry + 8 }, String(stake)));
                x += it.w + GAP;
                return;
            }
            // The × between chips is dropped at a row start; the wrap itself
            // reads as the continuation.
            if (ci > 0) g.append(s('text.dd-chain-x', { x: x - GAP / 2, y: ry + 6, 'text-anchor': 'middle', 'font-size': FS }, '×'));
            g.append(s('g.dd-chip', { 'data-kind': it.c.kind, style: `--i:${n}` }, [
                s('rect', { x, y: ry - CHIP_H / 2, width: it.w, height: CHIP_H, rx: compact ? 13 : 9 }),
                s('text.dd-chip-label', { x: x + PAD, y: ry + 5, 'font-size': FS }, it.c.label),
                s('text.dd-chip-value', { x: x + it.w - PAD, y: ry + 5, 'text-anchor': 'end', 'font-size': FS }, it.c.value),
            ]));
            x += it.w + GAP;
            n += 1;
        });
    });
    return g;
}

/* ---------------- seats ---------------- */

function seat(player, ctx) {
    const pos = SEATS[player.seat];
    const isLandlord = ctx.landlordId === player.id;
    const won = ctx.winner && (isLandlord ? ctx.winner === 'landlord' : ctx.winner === 'peasants');
    const delta = ctx.deltas ? ctx.deltas[player.id] : null;

    const g = s('g.dd-seat', {
        'data-seat': player.seat,
        'data-role': ctx.landlordId ? (isLandlord ? 'landlord' : 'peasant') : 'none',
        'data-won': ctx.winner ? (won ? 'yes' : 'no') : '',
        'data-phase': ctx.phase,
        style: `--seat-color:${player.color}`,
    });

    // The ring is the player's identity; the gold halo is the role. Keeping
    // them on different rings means colour never has to carry two meanings.
    if (isLandlord) {
        g.append(s('circle.dd-seat-halo', { cx: pos.x, cy: pos.y, r: SEAT_R + 8 }));
    }
    g.append(s('circle.dd-seat-disc', { cx: pos.x, cy: pos.y, r: SEAT_R }));
    g.append(s('circle.dd-seat-ring', { cx: pos.x, cy: pos.y, r: SEAT_R }));
    g.append(s('text.dd-seat-initials', { x: pos.x, y: pos.y + 8, 'text-anchor': 'middle' }, initials(player.name)));

    // 地主 / 农 as a small seal, the way the role is actually marked at a table.
    if (ctx.landlordId) {
        const bx = pos.x + SEAT_R - 6, by = pos.y + SEAT_R - 16;
        g.append(s('g.dd-seal', { 'data-role': isLandlord ? 'landlord' : 'peasant' }, [
            s('rect', { x: bx - 15, y: by - 2, width: 34, height: 22, rx: 5 }),
            s('text', { x: bx + 2, y: by + 14, 'text-anchor': 'middle' }, isLandlord ? '地主' : '农'),
        ]));
    }

    const below = pos.y + SEAT_R + 22;
    g.append(s('text.dd-seat-name', { x: pos.x, y: below, 'text-anchor': 'middle' }, player.name));
    g.append(s('text.dd-seat-score', { x: pos.x, y: below + 21, 'text-anchor': 'middle' }, signed(player.score)));

    if (delta != null && delta !== 0) {
        // Rises out of the seat on a recorded round; shown flat while drafting
        // so you can see what the round is worth before committing to it.
        g.append(s('text.dd-seat-delta', {
            x: pos.x, y: pos.y - SEAT_R - 12, 'text-anchor': 'middle',
            'data-dir': delta > 0 ? 'up' : 'down',
        }, signed(delta)));
    }
    return g;
}

/* ---------------- entry point ---------------- */

/**
 * @param {HTMLElement} container
 * @param {object} state
 *   players  [{id, name, seat, color, score}]
 *   round    the draft or recorded round
 *   rules    the match's rules snapshot
 *   deltas   {id: points} — projected while drafting, actual after recording
 *   phase    'idle' | 'draft' | 'result'
 */
export function renderTable(container, state) {
    const { players = [], round = {}, rules, deltas = null, phase = 'idle' } = state;
    // Below this the graphic is rendered small enough that 13-unit type would
    // land around 6px on screen.
    const compact = (container.clientWidth || 620) < 520;
    const chainInfo = multiplier(round, rules);
    const stake = (Number(round.call) || 0) * chainInfo.value;
    const landlordSeat = players.find((p) => p.id === round.landlordId)?.seat;

    const svg = s('svg.dd-table', {
        viewBox: `0 0 ${W} ${H}`, role: 'img', 'data-phase': phase,
        'aria-label': describe(players, round, stake, chainInfo),
    }, [defs(), felt(), kitty(round.landlordId ? landlordSeat : null)]);

    svg.append(chain({ call: round.call, chainInfo, stake, phase, redeal: round.redeal, compact }));
    if (chainInfo.capped) {
        svg.append(s('text.dd-chain-capped', { x: FELT.cx, y: FELT.cy + 46, 'text-anchor': 'middle' },
            `capped at ×${rules.maxMultiplier}`));
    }
    players.forEach((p) => svg.append(seat(p, { ...round, deltas, phase, landlordId: round.landlordId })));

    container.replaceChildren(svg);
    return svg;
}

/** The alt text carries the same information the picture does. */
function describe(players, round, stake, chainInfo) {
    if (!players.length) return 'An empty doudizhu table.';
    const names = players.map((p) => `${p.name} ${signed(p.score)}`).join(', ');
    if (round.redeal) return `Redeal, no score. Table: ${names}.`;
    const landlord = players.find((p) => p.id === round.landlordId);
    if (!landlord) return `No landlord yet. Table: ${names}.`;
    const factors = chainInfo.factors.map((f) => `${f.label}${f.count > 1 ? ` ×${f.count}` : ''}`).join(', ') || 'no multipliers';
    const outcome = round.winner === 'landlord' ? 'landlord won' : round.winner === 'peasants' ? 'peasants won' : 'in progress';
    return `${landlord.name} is landlord on a call of ${round.call}, ${factors}, stake ${stake}, ${outcome}. Table: ${names}.`;
}

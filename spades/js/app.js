/* ============================================================
   app.js — views and wiring.

   The store is the only source of truth: every mutation goes through it and
   every view re-renders from a store event. The one piece of local state is
   the hand being typed, which deliberately does not live in the store — a
   half-entered hand is not history yet.
   ============================================================ */

import {
    h, qs, mount, signed, pct, dec, signedDec, relTime,
    toast, openModal, closeModal, confirmAction,
} from './dom.js';
import * as store from './store.js';
import { standings, validateHand, clampInt } from './scoring.js';
import { teamMetrics, lifetime, headToHead, playerMetrics, resultOf } from './stats.js';
import { RULE_FIELDS, RULE_TOGGLES, PRESETS, withDefaults } from './rules.js';

let view = 'play';
let draft = null;      // { roundId: string|null, entries: { [playerId]: entry } }
let setupPick = [];    // team ids selected on the new-match panel

const BID_NIL = 'nil';
const BID_BLIND = 'blind';

/* ---------------- boot ---------------- */

function init() {
    store.load();
    store.subscribe(render);

    document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            view = btn.dataset.view;
            document.querySelectorAll('.tab').forEach((b) => {
                const on = b === btn;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', String(on));
            });
            render();
        });
    });

    render();
}

function render() {
    for (const name of ['play', 'teams', 'history']) {
        const el = qs(`#view-${name}`);
        el.classList.toggle('hidden', name !== view);
    }
    if (view === 'play') renderPlay(qs('#view-play'));
    if (view === 'teams') renderTeams(qs('#view-teams'));
    if (view === 'history') renderHistory(qs('#view-history'));
}

const teamName = (match, id) => {
    const live = store.teamById(id);
    if (live) return live.name;
    const snap = (match.teams || []).find((t) => t.id === id);
    return snap ? snap.name : 'Team';
};

const teamColor = (match, id) => {
    const live = store.teamById(id);
    if (live) return live.color;
    const snap = (match.teams || []).find((t) => t.id === id);
    return snap ? snap.color : 'var(--text-dim)';
};

const teamOf = (match, id) => (match.teams || []).find((t) => t.id === id) || { players: [] };

/* ============================================================
   PLAY
   ============================================================ */

function renderPlay(root) {
    const match = store.activeMatch();
    if (!match) { mount(root, setupPanel()); return; }

    const s = standings(match);
    mount(root,
        scoreboard(match, s),
        s.over && match.status !== 'complete' ? winBanner(match, s) : null,
        match.status === 'complete' ? completeBanner(match, s) : entryCard(match, s),
        s.rows.length ? trendCard(match, s) : null,
        handsCard(match, s));
}

/* ---------------- new match ---------------- */

function setupPanel() {
    const teams = store.allTeams().filter((t) => !t.archived);
    const rules = store.getSettings().rules;

    if (teams.length < 2) {
        return card('Start a match',
            h('p', { class: 'muted' },
                'A match needs at least two teams. Build the roster once and it is reused for every night after this.'),
            h('div', { class: 'row-actions' },
                h('button', { class: 'btn btn-primary', type: 'button', onClick: () => teamModal(null) }, '+ New team')));
    }

    setupPick = setupPick.filter((id) => teams.some((t) => t.id === id));
    if (setupPick.length === 0) setupPick = teams.slice(0, 2).map((t) => t.id);

    const chips = teams.map((t) => {
        const on = setupPick.includes(t.id);
        return h('button', {
            type: 'button',
            class: `team-chip${on ? ' is-on' : ''}`,
            onClick: () => {
                if (on) setupPick = setupPick.filter((x) => x !== t.id);
                else if (setupPick.length < 4) setupPick = [...setupPick, t.id];
                else { toast('Four teams is the maximum for one match.', 'warn'); return; }
                render();
            },
        }, h('span', { class: 'dot', style: { background: t.color } }), t.name,
            h('span', { class: 'chip-sub' }, t.players.map((p) => p.name).join(' & ')));
    });

    return card('Start a match',
        h('p', { class: 'label' }, 'Teams'),
        h('div', { class: 'chip-row' }, chips),
        h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => teamModal(null) }, '+ New team')),
        h('p', { class: 'label mt' }, 'House rules'),
        rulesSummary(rules),
        h('div', { class: 'row-actions' },
            h('button', { class: 'btn', type: 'button', onClick: rulesModal }, 'Edit rules'),
            h('button', {
                class: 'btn btn-primary', type: 'button',
                onClick: () => {
                    if (setupPick.length < 2) { toast('Pick at least two teams.', 'warn'); return; }
                    draft = null;
                    store.createMatch(setupPick, store.getSettings().rules);
                    toast('Match started. Good luck.');
                },
            }, 'Start match →')));
}

function rulesSummary(rules) {
    const r = withDefaults(rules);
    const bits = [
        `Play to ${r.target}`,
        `${r.bagLimit} bags = ${r.bagPenalty}`,
        `Nil ${r.nil} / blind ${r.blindNil}`,
        r.bagsCarry ? 'bags carry over' : 'bags reset',
        r.failedNilBags ? 'busted nils bag' : 'busted nils do not bag',
        r.bust !== null && r.bust !== undefined ? `out at ${r.bust}` : null,
    ].filter(Boolean);
    return h('div', { class: 'rule-pills' }, bits.map((b) => h('span', { class: 'pill' }, b)));
}

function rulesModal() {
    const rules = { ...store.getSettings().rules };

    const fields = RULE_FIELDS.map((f) =>
        h('label', { class: 'field' },
            h('span', {}, f.label),
            h('input', {
                type: 'number', value: rules[f.key], min: f.min, max: f.max, step: f.step,
                onInput: (e) => { rules[f.key] = Number(e.target.value); },
            }),
            h('small', { class: 'muted' }, f.hint)));

    const toggles = RULE_TOGGLES.map((t) =>
        h('label', { class: 'field field-check' },
            h('input', {
                type: 'checkbox', checked: !!rules[t.key],
                onChange: (e) => { rules[t.key] = e.target.checked; },
            }),
            h('span', {}, h('strong', {}, t.label), h('small', { class: 'muted' }, t.hint))));

    const bustOn = rules.bust !== null && rules.bust !== undefined;
    const bustInput = h('input', {
        type: 'number', value: bustOn ? rules.bust : -200, step: 50, disabled: !bustOn,
        onInput: (e) => { rules.bust = Number(e.target.value); },
    });
    const bustField = h('label', { class: 'field field-check' },
        h('input', {
            type: 'checkbox', checked: bustOn,
            onChange: (e) => { rules.bust = e.target.checked ? Number(bustInput.value) : null; bustInput.disabled = !e.target.checked; },
        }),
        h('span', {}, h('strong', {}, 'Bust out'), h('small', { class: 'muted' }, 'A team at or below this score loses the match.')),
        bustInput);

    const presets = h('div', { class: 'chip-row' }, Object.entries(PRESETS).map(([key, p]) =>
        h('button', {
            type: 'button', class: 'team-chip',
            onClick: () => { store.setRules(p.rules); closeModal(); toast(`Loaded “${p.label}”.`); },
        }, p.label)));

    openModal('House rules',
        h('div', {},
            h('p', { class: 'label' }, 'Presets'), presets,
            h('p', { class: 'label mt' }, 'Custom'),
            h('div', { class: 'field-grid' }, fields),
            h('div', { class: 'field-list' }, toggles, bustField),
            h('p', { class: 'muted mt' },
                'Rules are copied into a match when it starts, so changing them here never re-scores a match already in progress.')),
        [h('button', { class: 'btn', type: 'button', onClick: closeModal }, 'Cancel'),
        h('button', {
            class: 'btn btn-primary', type: 'button',
            onClick: () => { store.setRules(rules); closeModal(); toast('House rules saved.'); },
        }, 'Save rules')]);
}

/* ---------------- scoreboard ---------------- */

function scoreboard(match, s) {
    const rules = s.rules;
    const sorted = [...s.teams].sort((a, b) => b.score - a.score);
    const lead = sorted[0] ? sorted[0].score : 0;

    const cards = s.teams.map((t) => {
        const m = teamMetrics(match, t.teamId);
        const gap = lead - t.score;
        const toWin = Math.max(0, rules.target - t.score);

        // Bag pips: the whole point is seeing the penalty coming, so the last
        // two before the limit read as a warning rather than a count.
        const pips = h('div', { class: 'pips', title: `${t.bags} of ${rules.bagLimit} bags` },
            Array.from({ length: rules.bagLimit }, (_, i) =>
                h('span', { class: `pip${i < t.bags ? ' is-on' : ''}${i >= rules.bagLimit - 2 ? ' is-hot' : ''}` })));

        return h('article', { class: `score-card${gap === 0 ? ' is-lead' : ''}`, style: { '--team': teamColor(match, t.teamId) } },
            h('header', {},
                h('h3', {}, teamName(match, t.teamId)),
                h('p', { class: 'players' }, teamOf(match, t.teamId).players.map((p) => p.name).join(' & '))),
            h('div', { class: 'score-big' }, String(t.score)),
            h('div', { class: 'score-sub' },
                gap === 0 ? h('span', { class: 'good' }, 'leading') : `${gap} behind`,
                ' · ',
                toWin > 0 ? `${toWin} to win` : h('span', { class: 'good' }, 'at target')),
            h('div', { class: 'bags-row' },
                h('span', { class: 'label' }, 'Bags'),
                pips,
                h('span', { class: 'bag-count' }, `${t.bags}/${rules.bagLimit}`),
                t.bagPenalties ? h('span', { class: 'bad' }, `${t.bagPenalties}× penalty`) : null),
            h('dl', { class: 'mini-stats' },
                stat('Made bid', m.hands ? pct(m.contractRate) : '—', `${m.made} of ${m.hands} hands`),
                stat('Bid delta', m.contractHands ? signedDec(m.avgDelta) : '—', 'avg tricks over bid'),
                stat('Nils', m.nilAttempts + m.blindAttempts ? `${m.nilMade + m.blindMade}/${m.nilAttempts + m.blindAttempts}` : '—', 'made / tried')));
    });

    return h('section', { class: 'board' },
        h('div', { class: 'board-head' },
            h('div', {},
                h('h2', {}, `Hand ${s.rows.length + (match.status === 'complete' ? 0 : 1)}`),
                h('p', { class: 'muted' }, `Playing to ${rules.target} · started ${relTime(match.createdAt)}`)),
            h('div', { class: 'row-actions' },
                h('button', { class: 'btn btn-ghost', type: 'button', onClick: rulesModal }, 'Rules'),
                h('button', {
                    class: 'btn btn-ghost', type: 'button',
                    onClick: () => confirmAction('End this match?',
                        'It moves to History with its current scores. You can reopen it later.',
                        'End match', () => { store.finishMatch(match.id, s.winnerId); toast('Match filed under History.'); }),
                }, 'End match'))),
        h('div', { class: `score-grid cols-${s.teams.length}` }, cards));
}

const stat = (label, value, hint) =>
    h('div', { class: 'mini-stat' },
        h('dt', {}, label),
        h('dd', {}, value),
        hint ? h('small', {}, hint) : null);

function winBanner(match, s) {
    return h('div', { class: 'banner banner-win' },
        h('div', {},
            h('strong', {}, `${teamName(match, s.winnerId)} wins.`),
            ' ',
            h('span', { class: 'muted' },
                s.reason === 'bust' ? 'Everyone else busted out.' : `First past ${s.rules.target}.`)),
        h('button', {
            class: 'btn btn-primary', type: 'button',
            onClick: () => { store.finishMatch(match.id, s.winnerId); toast('Match closed out.'); },
        }, 'Close it out'));
}

function completeBanner(match, s) {
    return h('div', { class: 'banner' },
        h('div', {},
            h('strong', {}, match.winnerId ? `${teamName(match, match.winnerId)} took it.` : 'Match ended.'),
            ' ', h('span', { class: 'muted' }, `${s.rows.length} hands · ${relTime(match.endedAt)}`)),
        h('button', {
            class: 'btn', type: 'button',
            onClick: () => { store.reopenMatch(match.id); toast('Reopened — add more hands.'); },
        }, 'Reopen'));
}

/* ---------------- hand entry ---------------- */

function blankEntries(match) {
    const e = {};
    for (const t of match.teams) for (const p of t.players) e[p.id] = { bid: 0, nil: 'none', tricks: 0 };
    return e;
}

function ensureDraft(match) {
    if (!draft) draft = { roundId: null, entries: blankEntries(match) };
    return draft;
}

function entryCard(match, s) {
    const d = ensureDraft(match);
    const editing = !!d.roundId;
    const handNo = editing
        ? s.rows.findIndex((r) => r.id === d.roundId) + 1
        : s.rows.length + 1;

    const feedback = h('div', { class: 'entry-feedback' });
    const commit = h('button', { class: 'btn btn-primary', type: 'button' });

    const refresh = () => paintFeedback(match, d, feedback, commit);

    const groups = match.teamIds.map((teamId) => {
        const team = teamOf(match, teamId);
        return h('div', { class: 'entry-team', style: { '--team': teamColor(match, teamId) } },
            h('h4', {}, teamName(match, teamId)),
            h('div', { class: 'entry-rows' },
                team.players.map((p) => playerRow(p, d, refresh))));
    });

    commit.textContent = editing ? 'Save changes' : 'Record hand';
    commit.addEventListener('click', () => {
        const v = validateHand(match, d.entries);
        if (!v.ok) { toast(v.errors[0], 'warn'); return; }

        // Clear the draft BEFORE writing: the store emits synchronously, so the
        // re-render happens inside these calls. Resetting afterwards would be
        // throwing the blank form away and leaving last hand's bids on screen.
        const entries = d.entries;
        const roundId = d.roundId;
        draft = null;

        if (editing) { store.updateRound(match.id, roundId, entries); toast(`Hand ${handNo} updated — scores re-tallied.`); }
        else { store.addRound(match.id, entries); toast(`Hand ${handNo} recorded.`); }
    });

    const actions = h('div', { class: 'row-actions' },
        commit,
        editing
            ? h('button', { class: 'btn', type: 'button', onClick: () => { draft = null; render(); } }, 'Cancel')
            : h('button', {
                class: 'btn btn-ghost', type: 'button',
                onClick: () => { draft = { roundId: null, entries: blankEntries(match) }; render(); },
            }, 'Clear'));

    const el = card(editing ? `Editing hand ${handNo}` : `Hand ${handNo}`,
        h('div', { class: `entry-grid cols-${match.teamIds.length}` }, groups),
        feedback,
        actions);

    refresh();
    return el;
}

function playerRow(player, d, refresh) {
    const e = d.entries[player.id] || (d.entries[player.id] = { bid: 0, nil: 'none', tricks: 0 });

    const bidValue = e.nil === 'none' ? String(e.bid) : e.nil;
    const bid = h('select', {
        class: 'sel sel-bid', 'aria-label': `${player.name} bid`,
        onChange: (ev) => {
            const v = ev.target.value;
            if (v === BID_NIL || v === BID_BLIND) { e.nil = v; e.bid = 0; }
            else { e.nil = 'none'; e.bid = clampInt(v, 0, 13); }
            ev.target.classList.toggle('is-nil', e.nil !== 'none');
            refresh();
        },
    },
        ...Array.from({ length: 14 }, (_, i) => h('option', { value: String(i), selected: bidValue === String(i) }, String(i))),
        h('option', { value: BID_NIL, selected: bidValue === BID_NIL }, 'Nil'),
        h('option', { value: BID_BLIND, selected: bidValue === BID_BLIND }, 'Blind nil'));
    bid.classList.toggle('is-nil', e.nil !== 'none');

    const tricks = h('select', {
        class: 'sel sel-tricks', 'aria-label': `${player.name} tricks won`,
        onChange: (ev) => { e.tricks = clampInt(ev.target.value, 0, 13); refresh(); },
    }, ...Array.from({ length: 14 }, (_, i) => h('option', { value: String(i), selected: e.tricks === i }, String(i))));

    return h('div', { class: 'entry-row' },
        h('span', { class: 'p-name' }, player.name),
        h('span', { class: 'field-mini' }, h('small', {}, 'bid'), bid),
        h('span', { class: 'field-mini' }, h('small', {}, 'took'), tricks));
}

/**
 * Live feedback while a hand is being typed. Showing the projected swing
 * before it is committed is what stops the table arguing about a hand that
 * was entered wrong three rounds ago.
 */
function paintFeedback(match, d, node, commit) {
    const v = validateHand(match, d.entries);
    const rules = withDefaults(match.rules);
    const preview = standings({ ...match, rounds: [...match.rounds.filter((r) => r.id !== d.roundId), { id: '_preview', entries: d.entries }] });
    const before = standings({ ...match, rounds: match.rounds.filter((r) => r.id !== d.roundId) });

    const boardWord = { board: 'board', under: 'under', over: 'over' }[v.board];
    const chips = [
        h('span', { class: `chip chip-${v.tricks === rules.handSize ? 'ok' : 'warn'}` }, `${v.tricks}/${rules.handSize} tricks`),
        h('span', { class: `chip chip-${v.board === 'board' ? 'ok' : 'muted'}` }, `${v.bids} bid — ${boardWord}`),
    ];

    const swings = match.teamIds.map((id) => {
        const row = preview.rows[preview.rows.length - 1].byTeam[id];
        const now = before.teams.find((t) => t.teamId === id);
        return h('span', { class: 'swing', style: { '--team': teamColor(match, id) } },
            h('span', { class: 'dot' }),
            h('span', { class: 'swing-name' }, teamName(match, id)),
            h('span', { class: `swing-delta ${row.delta >= 0 ? 'good' : 'bad'}` }, signed(row.delta)),
            h('span', { class: 'swing-to' }, `→ ${now.score + row.delta}`),
            row.bagPenalty ? h('span', { class: 'chip chip-warn' }, 'bag penalty') : null);
    });

    mount(node,
        h('div', { class: 'chip-row' }, chips),
        v.ok ? h('div', { class: 'swing-row' }, swings)
            : h('p', { class: 'muted' }, v.errors[0]));

    commit.disabled = !v.ok;
}

/* ---------------- running score trend ---------------- */

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    return el;
};

/**
 * One line per team, running score against hand number.
 *
 * The hands table underneath is this chart's table view, so every value drawn
 * here is also readable as a number — which is what lets the chart stay clean
 * (no label on every point) without hiding anything.
 */
function trendCard(match, s) {
    const W = 760, H = 230;
    const pad = { t: 18, r: 148, b: 30, l: 46 };
    const ids = match.teamIds;

    // Series start at 0 before any hand is played.
    const series = ids.map((id) => ({
        id,
        name: teamName(match, id),
        color: teamColor(match, id),
        pts: [0, ...s.rows.map((r) => r.byTeam[id].score)],
    }));

    const n = series[0].pts.length - 1;
    const values = series.flatMap((x) => x.pts).concat([0, s.rules.target]);
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || 1;
    const yMin = lo - span * 0.08, yMax = hi + span * 0.08;

    const X = (i) => pad.l + (n === 0 ? 0 : (i / n) * (W - pad.l - pad.r));
    const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trend', role: 'img', 'aria-label': 'Running score by hand' });

    // Recessive grid on round numbers — a score axis labelled 546 and −116 is
    // technically the data range and useless to read against.
    for (const v of niceTicks(yMin, yMax, 4)) {
        svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'grid' }));
        const label = svgEl('text', { x: pad.l - 8, y: Y(v) + 4, class: 'axis', 'text-anchor': 'end' });
        label.textContent = String(v);
        svg.append(label);
    }
    if (yMin < 0 && yMax > 0) svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y(0), y2: Y(0), class: 'zero' }));

    // The target is the whole point of the match — draw it as a reference.
    if (s.rules.target >= yMin && s.rules.target <= yMax) {
        svg.append(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y(s.rules.target), y2: Y(s.rules.target), class: 'target' }));
        // Label sits inside the plot: the right gutter belongs to the series
        // labels, and the two collide there whenever a team nears the target.
        const tl = svgEl('text', { x: pad.l + 4, y: Y(s.rules.target) - 6, class: 'axis' });
        tl.textContent = `target ${s.rules.target}`;
        svg.append(tl);
    }

    for (let i = 0; i <= n; i += Math.max(1, Math.ceil(n / 8))) {
        const t = svgEl('text', { x: X(i), y: H - 8, class: 'axis', 'text-anchor': 'middle' });
        t.textContent = String(i);
        svg.append(t);
    }

    for (const ser of series) {
        const d = ser.pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
        svg.append(svgEl('path', { d, class: 'line', stroke: ser.color }));
        ser.last = ser.pts[ser.pts.length - 1];
        svg.append(svgEl('circle', { cx: X(n), cy: Y(ser.last), r: 4, fill: ser.color, class: 'end-dot' }));
    }

    // Direct labels at the line ends — identity without reading the legend.
    // Two teams within a few points of each other would stack their labels on
    // top of each other, so nudge them apart before drawing.
    const BLOCK = 30;
    const labels = series
        .map((ser) => ({ ser, y: Y(ser.last) }))
        .sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < BLOCK) labels[i].y = labels[i - 1].y + BLOCK;
    }
    const overflow = labels.length ? labels[labels.length - 1].y - (H - pad.b) : 0;
    if (overflow > 0) labels.forEach((l) => { l.y -= overflow; });

    for (const { ser, y } of labels) {
        const lab = svgEl('text', { x: W - pad.r + 10, y: y - 1, class: 'end-label' });
        lab.textContent = ser.name.length > 16 ? `${ser.name.slice(0, 15)}…` : ser.name;
        svg.append(lab);
        const val = svgEl('text', { x: W - pad.r + 10, y: y + 14, class: 'end-value' });
        val.textContent = String(ser.last);
        svg.append(val);
        // A leader line keeps the label tied to its point once it has been moved.
        if (Math.abs(y - Y(ser.last)) > 2) {
            svg.append(svgEl('line', {
                x1: X(n) + 5, y1: Y(ser.last), x2: W - pad.r + 6, y2: y - 5,
                class: 'leader', stroke: ser.color,
            }));
        }
    }

    // Crosshair + tooltip.
    const cross = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'cross', opacity: 0 });
    svg.append(cross);
    const dots = series.map((ser) => {
        const c = svgEl('circle', { r: 5, fill: ser.color, class: 'hover-dot', opacity: 0 });
        svg.append(c);
        return c;
    });

    const tip = h('div', { class: 'tip hidden' });
    const wrap = h('div', { class: 'trend-wrap' }, svg, tip);

    const move = (ev) => {
        const box = svg.getBoundingClientRect();
        const px = ((ev.clientX - box.left) / box.width) * W;
        const i = Math.max(0, Math.min(n, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * n)));
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
        series.forEach((ser, k) => {
            dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Y(ser.pts[i])); dots[k].setAttribute('opacity', 1);
        });
        mount(tip,
            h('strong', {}, i === 0 ? 'Before play' : `After hand ${i}`),
            ...series.map((ser) => h('div', { class: 'tip-row' },
                h('span', { class: 'dot', style: { background: ser.color } }),
                h('span', {}, ser.name),
                h('b', {}, String(ser.pts[i])))));
        tip.classList.remove('hidden');
        const leftPct = (X(i) / W) * 100;
        tip.style.left = `${Math.min(78, Math.max(2, leftPct))}%`;
    };
    const leave = () => {
        cross.setAttribute('opacity', 0);
        dots.forEach((d) => d.setAttribute('opacity', 0));
        tip.classList.add('hidden');
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', leave);

    const legend = h('div', { class: 'legend' }, series.map((ser) =>
        h('span', { class: 'legend-item' }, h('span', { class: 'dot', style: { background: ser.color } }), ser.name)));

    return card('Running score', legend, wrap,
        h('p', { class: 'muted small' }, 'Hover for the score after any hand. Every value is also in the table below.'));
}

/** Round axis ticks: a 1/2/5×10^n step covering the range. */
function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / Math.max(1, count);
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v));
    return ticks;
}

/* ---------------- hands table ---------------- */

function handsCard(match, s) {
    if (!s.rows.length) {
        return card('Hands', h('p', { class: 'muted' }, 'No hands yet. Record the first one above.'));
    }

    const head = h('tr', {},
        h('th', {}, '#'),
        match.teamIds.map((id) =>
            h('th', { class: 'th-team', colspan: 3, style: { '--team': teamColor(match, id) } },
                h('span', { class: 'dot' }), teamName(match, id))),
        h('th', {}, ''));

    const sub = h('tr', { class: 'sub-head' },
        h('th', {}, ''),
        match.teamIds.flatMap(() => [h('th', {}, 'bid'), h('th', {}, 'took'), h('th', {}, 'score')]),
        h('th', {}, ''));

    const body = s.rows.map((row) => {
        const round = match.rounds.find((r) => r.id === row.id);
        const cells = match.teamIds.flatMap((id) => {
            const t = row.byTeam[id];
            const nilTags = t.nils.map((nl) =>
                h('span', { class: `tag ${nl.success ? 'tag-ok' : 'tag-bad'}` }, nl.kind === 'blind' ? 'BN' : 'N'));
            return [
                // The nil tag never replaces the number: the partner still had a
                // contract, and hiding it makes the hand unreadable after the fact.
                h('td', { class: 'num' }, String(t.contract), nilTags),
                h('td', { class: 'num' }, String(t.contractTricks + t.nils.reduce((a, x) => a + x.tricks, 0))),
                h('td', { class: 'num' },
                    h('span', { class: t.delta >= 0 ? 'good' : 'bad' }, signed(t.delta)),
                    h('small', { class: 'muted' }, ` ${t.score}`),
                    t.bagPenalty ? h('span', { class: 'tag tag-bad' }, 'bags') : null),
            ];
        });

        return h('tr', { class: row.decisive ? 'is-decisive' : '' },
            h('td', { class: 'num muted' }, String(row.round)),
            cells,
            h('td', { class: 'row-tools' },
                h('button', {
                    class: 'icon-btn', type: 'button', title: `Edit hand ${row.round}`,
                    onClick: () => { draft = { roundId: row.id, entries: JSON.parse(JSON.stringify(round.entries)) }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
                }, '✎'),
                h('button', {
                    class: 'icon-btn', type: 'button', title: `Delete hand ${row.round}`,
                    onClick: () => confirmAction(`Delete hand ${row.round}?`,
                        'Every later hand is re-scored from this point, so the running totals will shift.',
                        'Delete hand', () => { draft = null; store.deleteRound(match.id, row.id); toast('Hand deleted — scores re-tallied.'); }),
                }, '✕')));
    });

    return card('Hands',
        h('div', { class: 'table-wrap' },
            h('table', { class: 'hands' }, h('thead', {}, head, sub), h('tbody', {}, body))),
        h('p', { class: 'muted small' },
            'Edit or delete any hand — scores are recomputed from the first hand forward, never patched in place.'));
}

const card = (title, ...body) =>
    h('section', { class: 'card' }, title ? h('h3', { class: 'card-title' }, title) : null, ...body);

/* ============================================================
   TEAMS — the roster, and what it has done over time
   ============================================================ */

function renderTeams(root) {
    const teams = store.allTeams();
    const matches = store.allMatches();
    const live = teams.filter((t) => !t.archived);
    const archived = teams.filter((t) => t.archived);

    const head = h('div', { class: 'view-head' },
        h('div', {},
            h('h2', {}, 'Roster'),
            h('p', { class: 'muted' }, 'Teams persist between matches, so records and head-to-heads build up over a season.')),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => teamModal(null) }, '+ New team'));

    if (!live.length && !archived.length) {
        mount(root, head, card(null,
            h('p', { class: 'muted' }, 'No teams yet. Add two and you can start a match.')));
        return;
    }

    mount(root, head,
        h('div', { class: 'roster-grid' }, live.map((t) => teamCard(t, matches))),
        archived.length
            ? h('section', { class: 'card' },
                h('h3', { class: 'card-title' }, 'Archived'),
                h('p', { class: 'muted small' }, 'These teams appear in finished matches, so their history is kept.'),
                h('div', { class: 'chip-row' }, archived.map((t) =>
                    h('span', { class: 'team-chip' },
                        h('span', { class: 'dot', style: { background: t.color } }), t.name,
                        h('button', { class: 'icon-btn', type: 'button', title: 'Restore', onClick: () => { store.restoreTeam(t.id); toast(`${t.name} restored.`); } }, '↩')))))
            : null);
}

function teamCard(team, matches) {
    const lt = lifetime(matches, team.id);
    const record = lt.wins + lt.losses ? `${lt.wins}–${lt.losses}` : '—';

    const form = lt.recent.length
        ? h('div', { class: 'form-row' }, lt.recent.map((r) => h('span', { class: `form-pip is-${r.toLowerCase()}` }, r)))
        : h('span', { class: 'muted small' }, 'no completed matches yet');

    const players = team.players.map((p) => {
        const pm = playerMetrics(matches, p.id);
        return h('li', {},
            h('span', { class: 'p-name' }, p.name),
            h('span', { class: 'muted small' },
                pm.hands
                    ? `${dec(pm.avgBid)} avg bid · ${dec(pm.avgTricks)} avg tricks${pm.nilAttempts + pm.blindAttempts ? ` · nil ${pm.nilMade + pm.blindMade}/${pm.nilAttempts + pm.blindAttempts}` : ''}`
                    : 'no hands yet'));
    });

    return h('article', { class: 'roster-card', style: { '--team': team.color } },
        h('header', {},
            h('div', {},
                h('h3', {}, team.name),
                h('p', { class: 'muted small' }, `${lt.matches} match${lt.matches === 1 ? '' : 'es'} · ${lt.hands} hands`)),
            h('div', { class: 'row-actions' },
                h('button', { class: 'icon-btn', type: 'button', title: 'Edit', onClick: () => teamModal(team) }, '✎'),
                h('button', {
                    class: 'icon-btn', type: 'button', title: 'Delete',
                    onClick: () => confirmAction(`Delete ${team.name}?`,
                        'If the team appears in any match it is archived instead, so that history stays intact.',
                        'Delete', () => {
                            const r = store.deleteTeam(team.id);
                            toast(r.archived ? `${team.name} archived — it appears in past matches.` : `${team.name} deleted.`);
                        }),
                }, '✕'))),
        h('dl', { class: 'mini-stats wide' },
            stat('Record', record, lt.wins + lt.losses ? pct(lt.winRate) + ' wins' : 'unplayed'),
            stat('Made bid', lt.hands ? pct(lt.contractRate) : '—', 'contracts kept'),
            stat('Bags/hand', lt.hands ? dec(lt.bagsPerHand, 2) : '—', `${lt.bagPenalties} penalt${lt.bagPenalties === 1 ? 'y' : 'ies'}`),
            stat('Bid delta', lt.contractHands ? signedDec(lt.avgDelta) : '—', 'over/under bid'),
            stat('Nils', lt.nilAttempts + lt.blindAttempts ? pct(lt.nilRate) : '—', `${lt.nilMade + lt.blindMade} of ${lt.nilAttempts + lt.blindAttempts}`),
            stat('Streak', lt.currentStreak ? `${lt.currentStreak > 0 ? 'W' : 'L'}${Math.abs(lt.currentStreak)}` : '—', lt.longestWin ? `best W${lt.longestWin}` : 'no wins yet')),
        h('div', { class: 'form-block' }, h('span', { class: 'label' }, 'Recent'), form),
        h('ul', { class: 'player-list' }, players));
}

function teamModal(team) {
    const editing = !!team;
    const state = {
        name: editing ? team.name : '',
        color: editing ? team.color : null,
        players: editing ? team.players.map((p) => p.name) : ['', ''],
    };

    const nameInput = h('input', {
        type: 'text', value: state.name, placeholder: 'e.g. The Spadesmen', maxlength: 40,
        onInput: (e) => { state.name = e.target.value; },
    });

    const playerInputs = h('div', { class: 'field-grid' },
        state.players.map((p, i) =>
            h('label', { class: 'field' },
                h('span', {}, `Player ${i + 1}`),
                h('input', {
                    type: 'text', value: p, placeholder: 'Name', maxlength: 30,
                    onInput: (e) => { state.players[i] = e.target.value; },
                }))));

    const soloNote = h('p', { class: 'muted small' },
        'Leave the second player blank for a solo (cutthroat) team — the engine scores one-player teams the same way.');

    openModal(editing ? 'Edit team' : 'New team',
        h('div', {},
            h('label', { class: 'field' }, h('span', {}, 'Team name'), nameInput),
            playerInputs,
            soloNote),
        [h('button', { class: 'btn', type: 'button', onClick: closeModal }, 'Cancel'),
        h('button', {
            class: 'btn btn-primary', type: 'button',
            onClick: () => {
                const names = state.players.map((s) => s.trim()).filter(Boolean);
                if (!state.name.trim()) { toast('Give the team a name.', 'warn'); return; }
                if (!names.length) { toast('A team needs at least one player.', 'warn'); return; }
                if (editing) {
                    // Changing the roster size mid-season would orphan the ids
                    // that recorded hands are keyed by, so only names change here.
                    if (names.length !== team.players.length) { toast('Player count is fixed once a team exists — make a new team instead.', 'warn'); return; }
                    store.updateTeam(team.id, { name: state.name, playerNames: names });
                    toast('Team updated.');
                } else {
                    const t = store.createTeam({ name: state.name, players: names });
                    if (setupPick.length < 4) setupPick = [...setupPick, t.id];
                    toast(`${t.name} added.`);
                }
                closeModal();
            },
        }, editing ? 'Save' : 'Add team')]);
}

/* ============================================================
   HISTORY — past matches, head-to-head, and the data itself
   ============================================================ */

function renderHistory(root) {
    const matches = store.allMatches().slice().sort((a, b) => b.createdAt - a.createdAt);
    const teams = store.allTeams();

    const head = h('div', { class: 'view-head' },
        h('div', {},
            h('h2', {}, 'History'),
            h('p', { class: 'muted' }, `${matches.length} match${matches.length === 1 ? '' : 'es'} on record.`)),
        h('div', { class: 'row-actions' },
            h('button', { class: 'btn', type: 'button', onClick: exportData }, 'Export'),
            h('button', { class: 'btn', type: 'button', onClick: importData }, 'Import'),
            h('button', {
                class: 'btn btn-ghost', type: 'button',
                onClick: () => confirmAction('Erase everything?',
                    'Every team, match and hand in this browser is deleted. Export first if you want a copy.',
                    'Erase all', () => { store.clearAll(); toast('All data erased.'); }),
            }, 'Erase')));

    mount(root, head,
        h2hCard(matches, teams),
        matches.length
            ? h('div', { class: 'match-list' }, matches.map((m) => matchRow(m)))
            : card(null, h('p', { class: 'muted' }, 'No matches yet.')));
}

function h2hCard(matches, teams) {
    const played = teams.filter((t) => matches.some((m) => m.teamIds.includes(t.id)));
    if (played.length < 2) return null;

    const header = h('tr', {}, h('th', {}, ''), played.map((t) =>
        h('th', { class: 'th-team', style: { '--team': t.color } }, h('span', { class: 'dot' }), t.name)));

    const rows = played.map((a) =>
        h('tr', {},
            h('th', { class: 'th-team row-head', style: { '--team': a.color } }, h('span', { class: 'dot' }), a.name),
            played.map((b) => {
                if (a.id === b.id) return h('td', { class: 'num muted' }, '—');
                const r = headToHead(matches, a.id, b.id);
                if (!r.played) return h('td', { class: 'num muted' }, '·');
                return h('td', { class: 'num' },
                    h('span', { class: r.a > r.b ? 'good' : r.a < r.b ? 'bad' : '' }, `${r.a}–${r.b}`));
            })));

    return card('Head to head',
        h('div', { class: 'table-wrap' }, h('table', { class: 'h2h' }, h('thead', {}, header), h('tbody', {}, rows))),
        h('p', { class: 'muted small' }, 'Read across: the row team’s wins first.'));
}

function matchRow(match) {
    const { standings: s, winnerId, decided } = resultOf(match);
    const ranked = [...s.teams].sort((a, b) => b.score - a.score);
    const isActive = store.getSettings().activeMatchId === match.id;

    const scores = h('div', { class: 'match-scores' }, ranked.map((t) =>
        h('span', { class: `match-score${t.teamId === winnerId ? ' is-win' : ''}`, style: { '--team': teamColor(match, t.teamId) } },
            h('span', { class: 'dot' }),
            h('span', { class: 'ms-name' }, teamName(match, t.teamId)),
            h('b', {}, String(t.score)),
            h('small', { class: 'muted' }, `${t.bags} bag${t.bags === 1 ? '' : 's'}`))));

    const detail = h('div', { class: 'match-detail hidden' });
    let built = false;

    const toggle = h('button', {
        class: 'btn btn-ghost', type: 'button',
        onClick: () => {
            if (!built) { mount(detail, matchDetail(match)); built = true; }
            detail.classList.toggle('hidden');
            toggle.textContent = detail.classList.contains('hidden') ? 'Details' : 'Hide';
        },
    }, 'Details');

    return h('article', { class: `match-row${isActive ? ' is-active' : ''}` },
        h('header', {},
            h('div', {},
                h('h3', {},
                    decided && winnerId ? `${teamName(match, winnerId)} won` : isActive ? 'In progress' : 'Unfinished',
                    match.rules.target !== 500 ? h('span', { class: 'pill' }, `to ${match.rules.target}`) : null),
                h('p', { class: 'muted small' }, `${relTime(match.createdAt)} · ${s.rows.length} hands`)),
            h('div', { class: 'row-actions' },
                toggle,
                isActive
                    ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { view = 'play'; document.querySelector('.tab[data-view="play"]').click(); } }, 'Resume')
                    : h('button', {
                        class: 'btn', type: 'button',
                        onClick: () => { draft = null; store.reopenMatch(match.id); document.querySelector('.tab[data-view="play"]').click(); toast('Reopened on the Play tab.'); },
                    }, 'Reopen'),
                h('button', {
                    class: 'icon-btn', type: 'button', title: 'Delete match',
                    onClick: () => confirmAction('Delete this match?',
                        'Its hands and its effect on every record are removed for good.',
                        'Delete', () => { store.deleteMatch(match.id); toast('Match deleted.'); }),
                }, '✕'))),
        scores,
        detail);
}

function matchDetail(match) {
    const rows = match.teamIds.map((id) => {
        const m = teamMetrics(match, id);
        return h('div', { class: 'detail-team', style: { '--team': teamColor(match, id) } },
            h('h4', {}, h('span', { class: 'dot' }), teamName(match, id)),
            h('dl', { class: 'mini-stats wide' },
                stat('Final', String(m.score), `${dec(m.pointsPerHand)} per hand`),
                stat('Made bid', m.hands ? pct(m.contractRate) : '—', `${m.made}–${m.set}`),
                stat('Bags', String(m.bagsEarned), `${m.bagPenalties} penalt${m.bagPenalties === 1 ? 'y' : 'ies'}`),
                stat('Bid delta', m.contractHands ? signedDec(m.avgDelta) : '—', `avg bid ${dec(m.avgBid)}`),
                stat('Nils', m.nilAttempts + m.blindAttempts ? `${m.nilMade + m.blindMade}/${m.nilAttempts + m.blindAttempts}` : '—', 'made / tried'),
                stat('Best hand', m.best ? signed(m.best.delta) : '—', m.best ? `hand ${m.best.round}` : ''),
                stat('Worst hand', m.worst ? signed(m.worst.delta) : '—', m.worst ? `hand ${m.worst.round}` : '')));
    });
    return h('div', { class: 'detail-grid' }, rows);
}

/* ---------------- data in and out ---------------- */

function exportData() {
    const payload = store.exportData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `spades-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${payload.teams.length} teams and ${payload.matches.length} matches.`);
}

function importData() {
    const input = h('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let payload;
            try { payload = JSON.parse(String(reader.result)); }
            catch { toast('That file is not valid JSON.', 'warn'); return; }

            // Merging is the safe default: importing a backup should never
            // silently erase matches played since that backup was taken.
            openModal('Import data',
                h('p', { class: 'muted' },
                    `${file.name} holds ${(payload.teams || []).length} teams and ${(payload.matches || []).length} matches. ` +
                    'Merging keeps what is already here and adds anything new. Replacing discards everything in this browser first.'),
                [h('button', { class: 'btn', type: 'button', onClick: closeModal }, 'Cancel'),
                h('button', { class: 'btn btn-danger', type: 'button', onClick: () => runImport(payload, true) }, 'Replace'),
                h('button', { class: 'btn btn-primary', type: 'button', onClick: () => runImport(payload, false) }, 'Merge')]);
        };
        reader.readAsText(file);
    });
    input.click();
}

function runImport(payload, replace) {
    try {
        const r = store.importData(payload, { replace });
        closeModal();
        toast(`${replace ? 'Replaced with' : 'Merged'} ${r.teams} teams and ${r.matches} matches.`);
    } catch (e) {
        toast(e.message, 'warn');
    }
}

init();

/* ============================================================
   app.js — routing, screens, wiring.

   Three pillars: Learn (the drilled curriculum), Table (the play aid for a
   live game) and Scores (the tracker). Hash routing, no framework, one render
   per state change.
   ============================================================ */

import { el, $, fill, clear, announce, toast } from './dom.js';
import {
    TILES, tileName, isDragon, isHonor, isWind, sortTiles, parseTiles, toCounts,
    HAIR_GROUPS, HAIR_GROUP_LABEL, suitOf, rankOf, honorGlyph,
} from './tiles.js';
import { tileEl, handEl } from './render.js';
import { MODULES, moduleById, nextModule } from './lessons.js';
import { DRILLS, drillsForModule, generate, makeRng } from './drills.js';
import { VARIANTS, RULE_CONTROLS } from './rules.js';
import { scoreHand, resolvePayment, canDeclarePile, faanToPoints } from './scoring.js';
import * as store from './store.js';
import { standings, lifetime, sessionSummary, signed, pct, rate } from './stats.js';
import { scoreChart } from './chart.js';

const root = () => $('#view');

/* ---------------- routing ---------------- */

const ROUTES = [
    { path: /^\/?$/, render: renderHome, tab: 'home' },
    { path: /^\/learn$/, render: renderLearn, tab: 'learn' },
    { path: /^\/learn\/(\d+)$/, render: (m) => renderModule(Number(m[1])), tab: 'learn' },
    { path: /^\/learn\/(\d+)\/drill$/, render: (m) => renderDrill(Number(m[1])), tab: 'learn' },
    { path: /^\/table$/, render: renderTable, tab: 'table' },
    { path: /^\/scores$/, render: renderScores, tab: 'scores' },
    { path: /^\/rules$/, render: renderRules, tab: 'rules' },
];

function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    for (const r of ROUTES) {
        const m = hash.match(r.path);
        if (m) {
            document.querySelectorAll('[data-tab]').forEach((t) => {
                t.classList.toggle('is-current', t.dataset.tab === r.tab);
                if (t.dataset.tab === r.tab) t.setAttribute('aria-current', 'page');
                else t.removeAttribute('aria-current');
            });
            fill(root(), r.render(m));
            root().focus({ preventScroll: true });
            window.scrollTo(0, 0);
            return;
        }
    }
    location.hash = '#/';
}

const go = (path) => { location.hash = `#${path}`; };

/* ---------------- home ---------------- */

/*
 * The hero is a live tile, not a statistic. The most characteristic thing in
 * this game's world is the tiles, and for a teaching tool the most honest
 * opening is the first drill itself — a stranger can find out in four seconds
 * whether they can already spot a dragon.
 */
function renderHome() {
    const wrap = el('div', { class: 'home' });

    const rng = makeRng(Math.floor(Date.now() / 1000));
    const dragons = TILES.filter(isDragon);
    const target = dragons[Math.floor(rng() * dragons.length)];
    const others = TILES.filter((t) => !isDragon(t)).sort(() => rng() - 0.5).slice(0, 6);
    const rack = [...others, target].sort(() => rng() - 0.5);

    const prompt = el('p', { class: 'hero-prompt', text: 'One of these seven is a dragon. Tap it.' });
    const rackEl = el('div', { class: 'hero-rack' });
    const result = el('div', { class: 'hero-result', 'aria-live': 'polite' });

    let done = false;
    rack.forEach((code) => {
        rackEl.append(tileEl(code, {
            size: 'lg',
            action: (picked, node) => {
                if (done) return;
                done = true;
                const right = isDragon(picked);
                node.classList.add(right ? 'is-right' : 'is-wrong');
                if (!right) {
                    [...rackEl.children].find((c) => c.dataset.tile === target)
                        ?.classList.add('is-right');
                }
                const v = dragonVerdict(picked, target);
                fill(result,
                    el('p', { class: `hero-verdict ${right ? 'is-right' : 'is-wrong'}`, text: v.headline }),
                    el('p', { class: 'hero-explain', text: v.body }));
                result.classList.add('is-shown');
                announce(`${v.headline} ${v.body}`);
            },
        }));
    });

    wrap.append(el('section', { class: 'hero' },
        el('h1', { class: 'hero-title' }, 'Learn mahjong by playing it, ',
            el('span', { class: 'hero-cn' }, '麻雀')),
        prompt,
        rackEl,
        result,
        el('div', { class: 'hero-actions' },
            el('a', { class: 'btn btn-primary', href: '#/learn' }, 'Start at the beginning'),
            el('a', { class: 'btn', href: '#/scores' }, 'Keep score')),
    ));

    wrap.append(el('section', { class: 'pillars' },
        pillar('Learn', 'Eight short modules, each ending in drills. Tiles first, scoring last — the order people actually learn in.', '#/learn'),
        pillar('Table', 'For a live game: whose deal it is, what beats what when a tile is claimed, and what a hand is worth.', '#/table'),
        pillar('Scores', 'A roster that remembers, sessions that snapshot their rules, and lifetime records for everyone you play with.', '#/scores'),
    ));

    const p = store.getProgress();
    const passed = MODULES.filter((m) => p.modules[m.id]?.passed).length;
    if (passed > 0) {
        wrap.append(el('p', { class: 'home-progress' },
            `${passed} of ${MODULES.length} modules passed. `,
            el('a', { href: '#/learn' }, 'Pick up where you left off.')));
    }
    return wrap;
}

const pillar = (title, body, href) => el('a', { class: 'pillar', href },
    el('h2', {}, title), el('p', {}, body));

/*
 * Feedback for the hero guess. A bare right/wrong teaches nothing, so the
 * wrong branch names what the player actually picked and says which family it
 * belongs to — the confusion is almost always "honours are all the same thing"
 * or "this painted tile must be the special one", and both are worth naming on
 * the spot rather than leaving to module 0.
 */
const withGlyph = (code) => (honorGlyph(code) ? `${tileName(code)} (${honorGlyph(code)})` : tileName(code));

const DRAGON_HINT = {
    5: 'the blank one — a carved frame with nothing inside it',
    6: 'fa cai, prosperity',
    7: 'hong zhong, the centre',
};

function whyNotDragon(code) {
    if (isWind(code)) {
        return 'That is a wind. Winds are honours like the dragons, but a different set of them: 東 east, 南 south, 西 west, 北 north — four kinds, where the dragons are three.';
    }
    if (code === '1s') {
        return 'That is the one of bamboo, the bird — the most eye-catching tile in the set, which is exactly why it gets picked. It is an ordinary suit tile, not a dragon, though it is the wild in the Hairs variant.';
    }
    const suit = {
        m: 'the characters, 萬',
        p: 'the dots, 筒',
        s: 'the bamboo, 索',
    }[suitOf(code)];
    return `That is a suit tile — one of ${suit}, which run 1 to 9. Dragons and winds are honours: they carry no number at all.`;
}

function dragonVerdict(picked, target) {
    if (isDragon(picked)) {
        return {
            headline: `Correct. That is the ${withGlyph(picked)}, ${DRAGON_HINT[rankOf(picked)]}.`,
            body: 'There are three dragons and no more: 中 red, 發 green and 白 white. They have no rank and no order, so they can never form a run — only triplets and pairs. You have just learned three of the thirty-four tiles in the set.',
        };
    }
    return {
        headline: `Wrong. You picked the ${withGlyph(picked)}.`,
        body: `${whyNotDragon(picked)} The dragon in that rack was the ${withGlyph(target)}, ${DRAGON_HINT[rankOf(target)]} — now highlighted.`,
    };
}

/* ---------------- learn ---------------- */

function renderLearn() {
    const p = store.getProgress();
    const wrap = el('div', { class: 'stack' });
    wrap.append(el('header', { class: 'page-head' },
        el('h1', {}, 'The curriculum'),
        el('p', { class: 'lede' },
            'Recognition first, because naming a tile without thinking is what everything else rests on. Scoring last, because it is a separate thing to learn and putting it early is how people give up.')));

    const listEl = el('ol', { class: 'modules' });
    MODULES.forEach((m) => {
        const state = p.modules[m.id];
        listEl.append(el('li', { class: `module${state?.passed ? ' is-passed' : ''}` },
            el('a', { href: `#/learn/${m.id}`, class: 'module-link' },
                el('span', { class: 'module-n', text: String(m.id) }),
                el('span', { class: 'module-body' },
                    el('span', { class: 'module-title', text: m.title }),
                    el('span', { class: 'module-sub', text: m.subtitle })),
                el('span', { class: 'module-meta' },
                    state?.passed ? el('span', { class: 'tick', title: 'Passed' }, '✓ passed')
                        : el('span', { class: 'mins', text: `${m.minutes} min` })))));
    });
    wrap.append(listEl);

    const weakest = Object.entries(p.tiles ?? {})
        .filter(([, t]) => t.seen >= 2 && t.correct / t.seen < 0.7)
        .sort((a, b) => (a[1].correct / a[1].seen) - (b[1].correct / b[1].seen))
        .slice(0, 8)
        .map(([code]) => code);

    if (weakest.length) {
        wrap.append(el('section', { class: 'panel' },
            el('h2', {}, 'Tiles you keep missing'),
            el('p', { class: 'muted' }, 'The recognition drill serves these more often until they stick.'),
            handEl(sortTiles(weakest), { size: 'sm' })));
    }
    return wrap;
}

function renderModule(id) {
    const m = moduleById(id);
    if (!m) { go('/learn'); return el('div'); }

    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'crumb' }, el('a', { href: '#/learn' }, '← All modules')));
    wrap.append(el('header', { class: 'page-head' },
        el('p', { class: 'module-eyebrow', text: `Module ${m.id}` }),
        el('h1', {}, m.title),
        el('p', { class: 'lede', text: m.subtitle })));

    const body = el('article', { class: 'lesson' });
    m.blocks.forEach((b) => body.append(renderBlock(b)));
    wrap.append(body);

    const drills = drillsForModule(m.id);
    const next = nextModule(m.id);
    wrap.append(el('div', { class: 'lesson-foot' },
        drills.length
            ? el('a', { class: 'btn btn-primary', href: `#/learn/${m.id}/drill` }, `Drill this — ${drills.length === 1 ? drills[0].title.toLowerCase() : `${drills.length} sets`}`)
            : null,
        next ? el('a', { class: 'btn', href: `#/learn/${next.id}` }, `Next: ${next.title}`) : null));
    return wrap;
}

function renderBlock(b) {
    switch (b.type) {
        case 'h': return el('h2', { text: b.text });
        case 'p': return el('p', { text: b.text });
        case 'note': return el('aside', { class: 'note', text: b.text });
        case 'list': return el('ul', { class: 'lesson-list' }, b.items.map((i) => el('li', { text: i })));
        case 'tiles': return el('figure', { class: 'figure' },
            handEl(b.tiles, { size: b.tiles.length > 9 ? 'sm' : 'md' }),
            b.caption ? el('figcaption', { text: b.caption }) : null);
        case 'table': return el('div', { class: 'table-scroll' }, el('table', { class: 'data' },
            el('thead', {}, el('tr', {}, b.head.map((h) => el('th', { text: h })))),
            el('tbody', {}, b.rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: c })))))));
        default: return el('p', { text: String(b.text ?? '') });
    }
}

/* ---------------- drills ---------------- */

const DRILL_LENGTH = 8;

function renderDrill(moduleId) {
    const drills = drillsForModule(moduleId);
    if (!drills.length) { go(`/learn/${moduleId}`); return el('div'); }

    const wrap = el('div', { class: 'stack drill-screen' });
    const head = el('header', { class: 'drill-head' });
    const stage = el('section', { class: 'drill-stage' });
    wrap.append(el('p', { class: 'crumb' }, el('a', { href: `#/learn/${moduleId}` }, '← Back to the lesson')));
    wrap.append(head, stage);

    let n = 0;
    let correct = 0;
    let seed = Math.floor(Math.random() * 1e9);

    const ctx = {
        rules: store.getSettings().rules,
        weightFor: (t) => store.tileWeight(t),
    };

    const showProgress = () => {
        fill(head,
            el('h1', {}, moduleById(moduleId).title),
            el('div', { class: 'drill-progress', role: 'progressbar',
                'aria-valuemin': '0', 'aria-valuemax': String(DRILL_LENGTH), 'aria-valuenow': String(n) },
                Array.from({ length: DRILL_LENGTH }, (_, i) => el('span', {
                    class: `pip${i < n ? ' is-done' : ''}${i === n ? ' is-current' : ''}`,
                }))),
            el('p', { class: 'muted', text: `${correct} right of ${n}` }));
    };

    const ask = () => {
        if (n >= DRILL_LENGTH) return finish();
        showProgress();
        const drill = drills[n % drills.length];
        const q = generate(drill.id, makeRng(seed + n * 7919), ctx);
        fill(stage, questionEl(q, (chosen) => {
            const right = chosen === q.answerId;
            if (right) correct += 1;
            if (q.kind === 'tile-id') store.recordTile(q.tile, right);
            n += 1;
            showProgress();
            return right;
        }, () => ask()));
    };

    const finish = () => {
        store.recordDrill(moduleId, { correct, total: DRILL_LENGTH });
        const passed = correct / DRILL_LENGTH >= 0.8;
        const next = nextModule(moduleId);
        fill(head, el('h1', {}, passed ? 'Passed' : 'Not yet'));
        fill(stage, el('div', { class: 'drill-done' },
            el('p', { class: 'drill-score' }, `${correct} of ${DRILL_LENGTH}`),
            el('p', {}, passed
                ? 'That is the standard. The next module is unlocked, though nothing stops you drilling this one again.'
                : 'Eight out of ten is the bar. Run it again — this is the part that rewards repetition more than reading.'),
            el('div', { class: 'lesson-foot' },
                el('button', { class: 'btn btn-primary', onClick: () => { n = 0; correct = 0; seed = Math.floor(Math.random() * 1e9); ask(); } }, 'Run it again'),
                passed && next ? el('a', { class: 'btn', href: `#/learn/${next.id}` }, `Next: ${next.title}`) : null,
                el('a', { class: 'btn', href: `#/learn/${moduleId}` }, 'Back to the lesson'))));
        announce(passed ? `Passed with ${correct} of ${DRILL_LENGTH}` : `${correct} of ${DRILL_LENGTH}, not passed`);
    };

    ask();
    return wrap;
}

function questionEl(q, answer, next) {
    const card = el('div', { class: 'q' });
    card.append(el('p', { class: 'q-prompt', text: q.prompt }));
    // A lone tile is a recognition question, so it gets shown at full size.
    if (q.tiles?.length) {
        card.append(handEl(q.tiles, {
            size: q.tiles.length === 1 ? 'xl' : q.tiles.length > 9 ? 'sm' : 'md',
        }));
    }

    const opts = el('div', { class: `q-options${q.options.some((o) => o.tile) ? ' q-options-tiles' : ''}` });
    const feedback = el('div', { class: 'q-feedback' });
    let answered = false;

    q.options.forEach((o) => {
        const btn = o.tile
            ? tileEl(o.tile, { size: 'md', action: () => choose(o, btn) })
            : el('button', { class: 'q-option', type: 'button', text: o.label, onClick: () => choose(o, btn) });
        opts.append(btn);
    });

    function choose(o, btn) {
        if (answered) return;
        answered = true;
        const right = answer(o.id);
        opts.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        btn.classList.add(right ? 'is-right' : 'is-wrong');
        if (!right) {
            [...opts.children].find((c) => (c.dataset.tile ?? c.textContent) ===
                (q.options.find((x) => x.id === q.answerId)?.tile ?? q.options.find((x) => x.id === q.answerId)?.label))
                ?.classList.add('is-right');
        }
        fill(feedback,
            el('p', { class: `q-verdict ${right ? 'is-right' : 'is-wrong'}`, text: right ? 'Right' : 'Not that one' }),
            el('p', { class: 'q-explain', text: q.explain }),
            el('button', { class: 'btn btn-primary', type: 'button', onClick: next }, 'Next'));
        feedback.classList.add('is-shown');
        announce(`${right ? 'Right.' : 'Not that one.'} ${q.explain}`);
        feedback.querySelector('button')?.focus();
    }

    card.append(opts, feedback);
    return card;
}

/* ---------------- table (play aid) ---------------- */

function renderTable() {
    const wrap = el('div', { class: 'stack' });
    const s = store.activeSession();

    wrap.append(el('header', { class: 'page-head' },
        el('h1', {}, 'At the table'),
        el('p', { class: 'lede' }, 'The three things a table loses track of, and the one thing it argues about.')));

    wrap.append(dealerPanel(s));
    wrap.append(claimPanel());
    wrap.append(calculatorPanel());
    wrap.append(lookupPanel());
    return wrap;
}

function dealerPanel(s) {
    const panel = el('section', { class: 'panel' }, el('h2', {}, 'Whose deal'));
    if (!s) {
        panel.append(el('p', { class: 'muted' },
            'No session is running. ',
            el('a', { href: '#/scores' }, 'Start one'),
            ' and the dealer and prevailing wind are tracked for you as you record hands.'));
        return panel;
    }
    const names = s.seats.map((x) => store.playerName(x.playerId));
    panel.append(el('p', { class: 'wind-round' },
        'Prevailing wind ',
        el('strong', {}, `${store.SEAT_WIND_GLYPH[s.roundWind]} ${store.SEAT_WINDS[s.roundWind]}`),
        ` · hand ${s.handNo}`));
    const seatsEl = el('div', { class: 'seats' });
    names.forEach((name, i) => {
        // Seat wind rotates relative to the dealer, who is always east.
        const wind = (i - s.dealerSeat + 4) % 4;
        seatsEl.append(el('div', { class: `seat${i === s.dealerSeat ? ' is-dealer' : ''}` },
            el('span', { class: 'seat-wind', text: store.SEAT_WIND_GLYPH[wind] }),
            el('span', { class: 'seat-name', text: name },
                el('i', { class: 'seat-chip', style: { background: store.seatColor(i) } })),
            el('span', { class: 'seat-role', text: i === s.dealerSeat ? 'dealer' : store.SEAT_WINDS[wind].toLowerCase() })));
    });
    panel.append(seatsEl);
    return panel;
}

function claimPanel() {
    return el('section', { class: 'panel' },
        el('h2', {}, 'Who takes the discard'),
        el('div', { class: 'table-scroll' }, el('table', { class: 'data' },
            el('thead', {}, el('tr', {}, ['Claim', 'From which seat', 'Beats'].map((h) => el('th', { text: h })))),
            el('tbody', {},
                claimRow('Win', 'Any seat', 'everything'),
                claimRow('Kong', 'Any seat', 'a chow'),
                claimRow('Pung', 'Any seat', 'a chow'),
                claimRow('Chow', 'Only the seat to the discarder’s right', 'nothing')))),
        el('aside', { class: 'note' },
            'A claim skips everyone between the claimant and the discarder. That is why play does not go round the table in a tidy circle, and why "my turn is next" is not something to rely on.'));
}

const claimRow = (a, b, c) => el('tr', {}, el('td', {}, el('strong', { text: a })), el('td', { text: b }), el('td', { text: c }));

/*
 * The scoring calculator. This is the play aid people will actually open
 * mid-game, so it computes as you change it rather than behind a button.
 */
function calculatorPanel() {
    const rules = store.getSettings().rules;
    const panel = el('section', { class: 'panel' },
        el('h2', {}, 'What is it worth'),
        el('p', { class: 'muted', text: `Scoring by ${VARIANTS[rules.variant].name}. ` }));
    panel.querySelector('.muted').append(el('a', { href: '#/rules' }, 'Change the rules'));

    const out = el('div', { class: 'calc-out', 'aria-live': 'polite' });
    const form = el('div', { class: 'calc' });
    const state = rules.variant === 'hkos'
        ? { faan: 3, flowers: 0 }
        : { sevenPairs: false, piles: {} };

    const recompute = () => {
        const win = rules.variant === 'hkos'
            ? { faan: state.faan, flowers: state.flowers }
            : {
                sevenPairs: state.sevenPairs,
                piles: Object.entries(state.piles)
                    .filter(([, size]) => size >= 3)
                    .map(([group, size]) => ({ group, size })),
            };
        const r = scoreHand(win, rules);
        fill(out, r.valid
            ? [
                el('p', { class: 'calc-score' }, String(r.score), el('span', { class: 'calc-unit' }, r.score === 1 ? 'point' : 'points')),
                el('p', { class: 'calc-break', text: r.breakdown.map((b) => b.label).join(' + ') }),
                el('p', { class: 'muted', text: `Self-drawn, all three pay ${r.score} each — ${r.score * 3} to you. On a discard the discarder alone pays ${r.score}.` }),
            ]
            : el('p', { class: 'calc-invalid', text: r.reason }));
    };

    if (rules.variant === 'hkos') {
        form.append(stepper('Faan in the hand', state.faan, 0, 13, (v) => { state.faan = v; recompute(); }));
        form.append(stepper('Flowers', state.flowers, 0, 8, (v) => { state.flowers = v; recompute(); }));
    } else {
        form.append(el('label', { class: 'check' },
            el('input', { type: 'checkbox', onChange: (e) => { state.sevenPairs = e.target.checked; recompute(); } }),
            el('span', {}, 'Seven pairs')));
        HAIR_GROUPS.forEach((g) => {
            state.piles[g] = 0;
            form.append(stepper(`${HAIR_GROUP_LABEL[g]} pile`, 0, 0, 14, (v) => { state.piles[g] = v; recompute(); },
                'Tiles in the pile, seed included. Under three is not a pile.'));
        });
    }

    panel.append(form, out);
    recompute();
    return panel;
}

function stepper(label, value, min, max, onChange, help) {
    let v = value;
    const readout = el('output', { class: 'stepper-value', text: String(v) });
    const set = (next) => {
        v = Math.max(min, Math.min(max, next));
        readout.textContent = String(v);
        onChange(v);
    };
    return el('div', { class: 'field' },
        el('span', { class: 'field-label', text: label }),
        el('div', { class: 'stepper' },
            el('button', { class: 'stepper-btn', type: 'button', 'aria-label': `${label}: one fewer`, onClick: () => set(v - 1) }, '−'),
            readout,
            el('button', { class: 'stepper-btn', type: 'button', 'aria-label': `${label}: one more`, onClick: () => set(v + 1) }, '+')),
        help ? el('span', { class: 'field-help', text: help }) : null);
}

function lookupPanel() {
    const panel = el('section', { class: 'panel' }, el('h2', {}, 'Name a tile'));
    const out = el('p', { class: 'lookup-out', 'aria-live': 'polite', text: 'Tap any tile.' });
    const grid = el('div', { class: 'lookup-grid' });
    ['m', 'p', 's', 'z'].forEach((suit) => {
        const row = el('div', { class: 'lookup-row' });
        TILES.filter((t) => suitOf(t) === suit).forEach((t) => {
            row.append(tileEl(t, { size: 'sm', action: () => { out.textContent = tileName(t); } }));
        });
        grid.append(row);
    });
    panel.append(grid, out);
    return panel;
}

/* ---------------- scores ---------------- */

function renderScores() {
    const wrap = el('div', { class: 'stack' });
    const s = store.activeSession();
    wrap.append(el('header', { class: 'page-head' },
        el('h1', {}, 'Scores'),
        el('p', { class: 'lede' }, 'A roster that remembers people, and sessions that remember the rules they were played under.')));

    wrap.append(s ? activeSessionPanel(s) : startPanel());
    wrap.append(rosterPanel());
    wrap.append(historyPanel());
    wrap.append(dataPanel());
    return wrap;
}

function startPanel() {
    const players = store.getPlayers();
    const panel = el('section', { class: 'panel' }, el('h2', {}, 'Start a session'));
    if (players.length < 4) {
        panel.append(el('p', { class: 'muted', text: `A table seats four. Add ${4 - players.length} more ${4 - players.length === 1 ? 'player' : 'players'} below to begin.` }));
        return panel;
    }
    const chosen = [];
    const nameField = el('input', { class: 'input', type: 'text', placeholder: 'Friday night', 'aria-label': 'Session name' });
    const picker = el('div', { class: 'picker' });
    const startBtn = el('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Start with these four');

    const refresh = () => {
        fill(picker, players.map((p) => {
            const i = chosen.indexOf(p.id);
            return el('button', {
                class: `chip${i >= 0 ? ' is-on' : ''}`, type: 'button',
                'aria-pressed': i >= 0 ? 'true' : 'false',
                onClick: () => {
                    if (i >= 0) chosen.splice(i, 1);
                    else if (chosen.length < 4) chosen.push(p.id);
                    refresh();
                },
            }, i >= 0 ? el('span', { class: 'chip-seat', style: { background: store.seatColor(i) } }, store.SEAT_WIND_GLYPH[i]) : null, p.name);
        }));
        startBtn.disabled = chosen.length !== 4;
    };
    refresh();

    startBtn.addEventListener('click', () => {
        store.startSession({ name: nameField.value, playerIds: chosen });
        toast('Session started');
        route();
    });

    panel.append(
        el('p', { class: 'muted' }, 'Pick four, in seating order. The first is east and deals first.'),
        picker,
        el('div', { class: 'row' }, nameField, startBtn));
    return panel;
}

function activeSessionPanel(s) {
    const names = s.seats.map((x) => store.playerName(x.playerId));
    const rows = standings(s);
    const sum = sessionSummary(s);
    const panel = el('section', { class: 'panel' });

    panel.append(el('div', { class: 'panel-head' },
        el('h2', {}, s.name),
        el('span', { class: 'badge', text: VARIANTS[s.variant].name }),
        el('button', { class: 'btn btn-quiet', type: 'button', onClick: () => {
            store.closeSession(s.id); toast('Session closed'); route();
        } }, 'Close session')));

    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const tableEl = el('table', { class: 'data standings' },
        el('thead', {}, el('tr', {}, ['', 'Player', 'Score', 'Wins', 'Self-draws', 'Fed a win'].map((h) => el('th', { text: h })))),
        el('tbody', {}, sorted.map((r) => el('tr', {},
            el('td', {}, el('span', { class: 'seat-wind sm', text: store.SEAT_WIND_GLYPH[(r.seat - s.dealerSeat + 4) % 4] })),
            el('td', {}, el('i', { class: 'seat-chip', style: { background: store.seatColor(r.seat) } }), names[r.seat]),
            el('td', { class: `num ${r.score > 0 ? 'pos' : r.score < 0 ? 'neg' : ''}`, text: signed(r.score) }),
            el('td', { class: 'num', text: String(r.wins) }),
            el('td', { class: 'num', text: String(r.selfDraws) }),
            el('td', { class: 'num', text: String(r.dealInto) })))));
    panel.append(el('div', { class: 'table-scroll' }, tableEl));

    if (sum.handsPlayed) {
        panel.append(scoreChart(s, names));
        panel.append(el('p', { class: 'muted' },
            `${sum.handsPlayed} ${sum.handsPlayed === 1 ? 'hand' : 'hands'} · ${sum.selfDraws} self-drawn · ${sum.draws} washed out · biggest swing ${sum.biggestSwing}`));
    }

    panel.append(recordHandForm(s, names));

    if (s.hands.length) {
        panel.append(el('details', { class: 'log' },
            el('summary', {}, `Hand log (${s.hands.length})`),
            el('ol', { class: 'log-list' }, [...s.hands].reverse().map((h) => el('li', {},
                el('span', { class: 'log-no', text: `#${h.no}` }),
                el('span', {}, describeHand(h, names, s)),
                el('span', { class: 'log-delta', text: h.deltas.map(signed).join(' / ') })))),
            el('button', { class: 'btn btn-quiet', type: 'button', onClick: () => {
                store.undoLastHand(s.id); toast('Last hand removed'); route();
            } }, 'Undo last hand')));
    }
    return panel;
}

function describeHand(h, names, s) {
    if (h.winType === 'draw') return 'Washed out';
    const who = names[h.winner];
    if (h.winType === 'selfdraw') return `${who} self-drew for ${h.score}`;
    return `${who} won ${h.score} off ${names[h.discarder]}`;
}

/*
 * Recording a hand. The preview updates as the form changes, so a table can
 * see what a hand pays before committing it — which is also how a beginner
 * learns what the rules do.
 */
function recordHandForm(s, names) {
    const rules = s.rules;
    const form = el('form', { class: 'record' });
    const state = {
        winner: null, winType: 'discard', discarder: null,
        sevenPairs: false, piles: {}, faan: rules.minFaan ?? 3, flowers: 0,
    };
    HAIR_GROUPS.forEach((g) => { state.piles[g] = 0; });

    const preview = el('div', { class: 'record-preview', 'aria-live': 'polite' });
    const body = el('div', { class: 'record-body' });
    const submit = el('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, 'Record hand');

    /*
     * `afterPick` exists because choosing a winner has to rebuild the fields
     * below it — there is nothing to ask about a discarder or a hair pile
     * until someone has won — while choosing a discarder must not, since that
     * picker would be tearing itself down mid-click.
     */
    const seatPicker = (label, key, allowNone, afterPick) => {
        const box = el('div', { class: 'field' }, el('span', { class: 'field-label', text: label }));
        const opts = el('div', { class: 'picker' });
        const choose = (value) => { state[key] = value; paint(); (afterPick ?? update)(); };
        const paint = () => fill(opts, [
            ...s.seats.map((_, i) => el('button', {
                class: `chip${state[key] === i ? ' is-on' : ''}`, type: 'button',
                'aria-pressed': state[key] === i ? 'true' : 'false',
                onClick: () => choose(i),
            }, el('span', { class: 'chip-seat', style: { background: store.seatColor(i) } },
                store.SEAT_WIND_GLYPH[(i - s.dealerSeat + 4) % 4]), names[i])),
            allowNone ? el('button', {
                class: `chip${state[key] === null ? ' is-on' : ''}`, type: 'button',
                'aria-pressed': state[key] === null ? 'true' : 'false',
                onClick: () => choose(null),
            }, 'Washed out') : null,
        ]);
        paint();
        box.append(opts);
        return box;
    };

    const compute = () => {
        if (state.winner == null) return { win: null, result: null, deltas: new Array(4).fill(0) };
        const win = rules.variant === 'hkos'
            ? { faan: state.faan, flowers: state.flowers }
            : {
                sevenPairs: state.sevenPairs,
                piles: Object.entries(state.piles).filter(([, n]) => n >= 3).map(([group, size]) => ({ group, size })),
            };
        const result = scoreHand(win, rules);
        const deltas = result.valid ? resolvePayment({
            seats: 4, winner: state.winner, winType: state.winType,
            discarder: state.discarder, dealer: s.dealerSeat, score: result.score,
        }, rules) : new Array(4).fill(0);
        return { win, result, deltas };
    };

    const update = () => {
        const { result, deltas } = compute();
        const needsDiscarder = state.winType === 'discard' && state.discarder == null;
        const ok = state.winner === null
            ? true
            : Boolean(result?.valid) && !needsDiscarder && state.discarder !== state.winner;
        submit.disabled = !ok;

        if (state.winner === null) {
            fill(preview, el('p', { class: 'muted' }, 'Washed out — nothing moves, and the deal stays with east.'));
            return;
        }
        if (!result?.valid) { fill(preview, el('p', { class: 'calc-invalid', text: result?.reason ?? '' })); return; }
        if (needsDiscarder) { fill(preview, el('p', { class: 'muted' }, 'Who discarded it?')); return; }
        if (state.discarder === state.winner) { fill(preview, el('p', { class: 'calc-invalid' }, 'You cannot win off your own discard. That is a self-draw.')); return; }

        fill(preview,
            el('p', { class: 'calc-score' }, String(result.score), el('span', { class: 'calc-unit' }, result.score === 1 ? 'point' : 'points')),
            el('p', { class: 'calc-break', text: result.breakdown.map((b) => b.label).join(' + ') }),
            el('div', { class: 'delta-row' }, deltas.map((d, i) => el('span', { class: 'delta' },
                el('i', { class: 'seat-chip', style: { background: store.seatColor(i) } }),
                el('span', { class: 'delta-name', text: names[i] }),
                el('span', { class: `num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`, text: signed(d) })))));
    };

    body.append(seatPicker('Who won', 'winner', true, () => { renderConditional(); update(); }));

    const how = el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'How' }));
    const howOpts = el('div', { class: 'picker' });
    const paintHow = () => fill(howOpts, [['discard', 'Off a discard'], ['selfdraw', 'Self-drawn']].map(([v, label]) =>
        el('button', {
            class: `chip${state.winType === v ? ' is-on' : ''}`, type: 'button',
            'aria-pressed': state.winType === v ? 'true' : 'false',
            onClick: () => { state.winType = v; if (v === 'selfdraw') state.discarder = null; paintHow(); renderConditional(); update(); },
        }, label)));
    paintHow();
    how.append(howOpts);
    body.append(how);

    const conditional = el('div', { class: 'record-conditional' });
    body.append(conditional);

    const renderConditional = () => {
        clear(conditional);
        if (state.winner == null) return;
        if (state.winType === 'discard') conditional.append(seatPicker('Who discarded it', 'discarder', false));
        if (rules.variant === 'hkos') {
            conditional.append(stepper('Faan in the hand', state.faan, 0, 13, (v) => { state.faan = v; update(); }));
            conditional.append(stepper('Flowers', state.flowers, 0, 8, (v) => { state.flowers = v; update(); }));
        } else {
            conditional.append(el('label', { class: 'check' },
                el('input', { type: 'checkbox', checked: state.sevenPairs, onChange: (e) => { state.sevenPairs = e.target.checked; update(); } }),
                el('span', {}, 'Seven pairs')));
            HAIR_GROUPS.forEach((g) => conditional.append(
                stepper(`${HAIR_GROUP_LABEL[g]} pile`, state.piles[g], 0, 14, (v) => { state.piles[g] = v; update(); })));
        }
    };

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const { win, result, deltas } = compute();
        store.recordHand(s.id, {
            winner: state.winner,
            winType: state.winner === null ? 'draw' : state.winType,
            discarder: state.winType === 'discard' ? state.discarder : null,
            score: result?.score ?? 0,
            detail: win,
            deltas,
        });
        toast(state.winner === null ? 'Washed-out hand recorded' : `${names[state.winner]} +${result.score}`);
        route();
    });

    renderConditional();
    update();
    form.append(el('h3', {}, `Record hand ${s.handNo}`), body, preview, el('div', { class: 'row' }, submit));
    return form;
}

function rosterPanel() {
    const panel = el('section', { class: 'panel' }, el('h2', {}, 'Roster'));
    const players = store.getPlayers();
    const listEl = el('ul', { class: 'roster' });
    players.forEach((p) => listEl.append(el('li', {},
        el('input', {
            class: 'input input-flush', type: 'text', value: p.name, 'aria-label': `Name for ${p.name}`,
            onChange: (e) => store.renamePlayer(p.id, e.target.value),
        }),
        el('button', {
            class: 'btn btn-quiet', type: 'button',
            onClick: () => { store.removePlayer(p.id); toast(`${p.name} removed from the roster`); route(); },
        }, 'Remove'))));
    if (!players.length) listEl.append(el('li', { class: 'muted' }, 'Nobody yet.'));

    const input = el('input', { class: 'input', type: 'text', placeholder: 'Add a player', 'aria-label': 'New player name' });
    const add = () => {
        if (store.addPlayer(input.value)) { input.value = ''; route(); }
    };
    panel.append(listEl, el('div', { class: 'row' },
        input,
        el('button', { class: 'btn', type: 'button', onClick: add }, 'Add')));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    const sessions = store.getSessions();
    if (players.length && sessions.length) {
        const life = lifetime(players, sessions).filter((r) => r.handsPlayed > 0)
            .sort((a, b) => b.score - a.score);
        if (life.length) {
            panel.append(el('h3', {}, 'Lifetime'));
            panel.append(el('div', { class: 'table-scroll' }, el('table', { class: 'data' },
                el('thead', {}, el('tr', {}, ['Player', 'Score', 'Hands', 'Win rate', 'Self-draws', 'Fed a win'].map((h) => el('th', { text: h })))),
                el('tbody', {}, life.map((r) => el('tr', {},
                    el('td', { text: r.name }),
                    el('td', { class: `num ${r.score > 0 ? 'pos' : r.score < 0 ? 'neg' : ''}`, text: signed(r.score) }),
                    el('td', { class: 'num', text: String(r.handsPlayed) }),
                    el('td', { class: 'num', text: pct(rate(r.wins, r.handsPlayed)) }),
                    el('td', { class: 'num', text: String(r.selfDraws) }),
                    el('td', { class: 'num', text: String(r.dealInto) })))))));
        }
    }
    return panel;
}

function historyPanel() {
    const sessions = store.getSessions();
    if (!sessions.length) return el('div');
    const panel = el('section', { class: 'panel' }, el('h2', {}, 'Sessions'));
    panel.append(el('ul', { class: 'sessions' }, sessions.map((s) => {
        const sum = sessionSummary(s);
        const names = s.seats.map((x) => store.playerName(x.playerId));
        return el('li', {},
            el('div', {},
                el('strong', { text: s.name }),
                el('span', { class: 'muted', text: ` ${VARIANTS[s.variant].name} · ${sum.handsPlayed} hands · ${names.join(', ')}` })),
            el('div', { class: 'row' },
                sum.leader ? el('span', { class: 'muted', text: `Leader: ${names[sum.leader.seat]} ${signed(sum.leader.score)}` }) : null,
                !s.closed && store.getSettings().activeSessionId !== s.id
                    ? el('button', { class: 'btn btn-quiet', type: 'button', onClick: () => { store.setActiveSession(s.id); route(); } }, 'Resume')
                    : null,
                el('button', { class: 'btn btn-quiet', type: 'button', onClick: () => {
                    store.deleteSession(s.id); toast('Session deleted'); route();
                } }, 'Delete')));
    })));
    return panel;
}

function dataPanel() {
    const panel = el('section', { class: 'panel' },
        el('h2', {}, 'Your data'),
        el('p', { class: 'muted' }, 'Everything lives in this browser. Nothing is uploaded, and clearing site data clears it.'));

    const file = el('input', { type: 'file', accept: 'application/json', class: 'sr-only', id: 'import-file' });
    file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
            store.importAll(await f.text());
            toast('Imported');
            route();
        } catch (e) {
            toast(e.message);
        }
    });

    panel.append(el('div', { class: 'row' },
        el('button', { class: 'btn', type: 'button', onClick: () => {
            const blob = new Blob([store.exportAll()], { type: 'application/json' });
            const a = el('a', { href: URL.createObjectURL(blob), download: `mahjong-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a); a.click(); a.remove();
        } }, 'Export everything'),
        el('label', { class: 'btn', for: 'import-file' }, 'Import a file'),
        file,
        el('button', { class: 'btn btn-quiet', type: 'button', onClick: () => {
            store.resetProgress(); toast('Drill progress reset'); route();
        } }, 'Reset drill progress')));
    return panel;
}

/* ---------------- rules ---------------- */

function renderRules() {
    const settings = store.getSettings();
    const wrap = el('div', { class: 'stack' });
    wrap.append(el('header', { class: 'page-head' },
        el('h1', {}, 'Rules'),
        el('p', { class: 'lede' }, 'A session copies these when it starts, so changing them here never re-scores a night you have already played.')));

    const picker = el('div', { class: 'variant-picker' });
    Object.values(VARIANTS).forEach((v) => {
        picker.append(el('button', {
            class: `variant${settings.variant === v.id ? ' is-on' : ''}`, type: 'button',
            'aria-pressed': settings.variant === v.id ? 'true' : 'false',
            onClick: () => { store.setVariant(v.id); route(); },
        },
        el('h2', { text: v.name }),
        el('p', { text: v.blurb }),
        el('p', { class: 'variant-meta', text: `${v.tiles} tiles${v.flowers ? ', flowers and seasons' : ', no flowers'}` })));
    });
    wrap.append(picker);

    const panel = el('section', { class: 'panel' }, el('h2', {}, 'House rules'));
    RULE_CONTROLS[settings.variant].forEach((c) => {
        const value = settings.rules[c.key];
        if (c.type === 'bool') {
            panel.append(el('label', { class: 'check' },
                el('input', { type: 'checkbox', checked: value, onChange: (e) => store.setRules({ [c.key]: e.target.checked }) }),
                el('span', {}, c.label, c.help ? el('small', { text: c.help }) : null)));
        } else if (c.type === 'number') {
            panel.append(stepper(c.label, value, c.min, c.max, (v) => store.setRules({ [c.key]: v }), c.help));
        } else if (c.type === 'choice') {
            const opts = el('div', { class: 'picker' }, c.options.map((o) => el('button', {
                class: `chip${value === o.value ? ' is-on' : ''}`, type: 'button',
                'aria-pressed': value === o.value ? 'true' : 'false',
                onClick: () => { store.setRules({ [c.key]: o.value }); route(); },
            }, o.label)));
            panel.append(el('div', { class: 'field' }, el('span', { class: 'field-label', text: c.label }), opts));
        }
    });
    wrap.append(panel);

    if (settings.variant === 'hairs') {
        wrap.append(el('section', { class: 'panel' },
            el('h2', {}, 'How hairs work'),
            el('ul', { class: 'lesson-list' }, [
                'Declared before your first discard, peng or chi — three distinct tiles of one group, face up.',
                'Groups are the winds, the dragons, and the terminals (the 1s and 9s).',
                'Any tile of that group you draw later joins the pile, and you take a replacement from the back of the wall.',
                'The one of bamboo is wild: it counts as distinct in any pile and joins any pile.',
                'Each pile scores its size minus the three it was seeded with.',
            ].map((t) => el('li', { text: t }))),
            el('aside', { class: 'note' },
                'This variant is not in any published ruleset — it was recorded from the way one table plays it. The toggles above exist because house rules drift, and another table almost certainly counts something differently.')));
    } else {
        wrap.append(el('section', { class: 'panel' },
            el('h2', {}, 'The faan table'),
            el('div', { class: 'table-scroll' }, el('table', { class: 'data' },
                el('thead', {}, el('tr', {}, ['Faan', 'Points'].map((h) => el('th', { text: h })))),
                el('tbody', {}, Array.from({ length: 14 }, (_, f) => el('tr', {},
                    el('td', { text: String(f) }),
                    el('td', { class: 'num', text: String(faanToPoints(f, settings.rules)) }))))))));
    }
    return wrap;
}

/* ---------------- boot ---------------- */

store.load();
window.addEventListener('hashchange', route);
store.subscribe(() => {});
route();

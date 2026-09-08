/* ============================================================
   app.js — views and wiring.

   The round form and the table graphic are the same state seen twice: every
   keystroke updates one draft object, and both re-render from it. That is why
   you can see what a round is worth before committing to it — the projected
   deltas on the felt come from the same engine call that will score it.
   ============================================================ */

import * as store from './store.js';
import { CALLS, DEFAULT_RULES } from './rules.js';
import { scoreRound, standings, validateRound, multiplier } from './scoring.js';
import { matchStats, lifetimeStats, landlordMatrix } from './stats.js';
import { renderTable } from './table.js';
import { renderChart } from './chart.js';
import { el, mount, clear, toast, modal, button, signed, pct, dec, when, initials } from './dom.js';

/* ---------------- app state ---------------- */

const EMPTY_DRAFT = { landlordId: null, call: null, winner: null, bombs: 0, rocket: false, spring: false, antiSpring: false, redeal: false };

let view = 'play';
let draft = { ...EMPTY_DRAFT };
let resultPhase = null;   // {deltas, round} while a recorded round is on screen
let resultTimer = null;

const views = {};

/** Seat colours are positional, so the table lineup carries them, not the roster. */
function seatedPlayers(match, scores) {
    return match.players.map((p, i) => ({
        ...p, seat: i, color: store.seatColor(i),
        score: scores ? scores[p.id] : 0,
    }));
}

const scoresById = (match) => Object.fromEntries(
    standings(match.rounds, match.playerIds, match.rules).map((r) => [r.id, r.score]),
);

/* ============================================================
   Play
   ============================================================ */

function renderPlay(root) {
    const match = store.activeMatch();
    if (!match) return mount(root, newTableScreen());

    const scores = scoresById(match);
    const players = seatedPlayers(match, scores);
    const stats = matchStats(match, match.rules);

    // While a recorded round is still on screen we show what happened; the
    // rest of the time the table previews the round being typed.
    const showing = resultPhase ? resultPhase.round : draft;
    const deltas = resultPhase
        ? resultPhase.deltas
        : (draft.landlordId && draft.call && draft.winner
            ? scoreRound(draft, match.playerIds, match.rules) : null);
    const phase = resultPhase ? 'result' : (draft.landlordId ? 'draft' : 'idle');

    const tableHost = el('div.table-host');
    const chartHost = el('div.chart-host');

    mount(root, [
        el('div.play-grid', {}, [
            el('section.panel.panel-table', {}, [
                el('div.panel-head', {}, [
                    el('h2.panel-title', {}, [
                        `Round ${stats.rounds + 1}`,
                        el('span.panel-sub', {}, ` · ${stats.rounds} played${stats.redeals ? `, ${stats.redeals} redealt` : ''}`),
                    ]),
                    button('End match', { class: 'btn btn-ghost btn-sm', onclick: () => confirmEnd(match) }),
                ]),
                tableHost,
            ]),
            el('section.panel.panel-form', {}, roundForm(match, players)),
        ]),
        el('section.panel', {}, [
            el('h2.panel-title', {}, 'Running score'),
            chartHost,
        ]),
        matchSummary(match, stats, players),
        roundLog(match, players),
    ]);

    renderTable(tableHost, { players, round: showing, rules: match.rules, deltas, phase });
    renderChart(chartHost, { match, players });
}

/* ---------------- the round form ---------------- */

function roundForm(match, players) {
    const set = (patch) => {
        Object.assign(draft, patch);
        // Spring belongs to a landlord win and anti-spring to a peasant win;
        // flipping the winner drops the flag that no longer applies rather
        // than silently keeping a value the engine would ignore.
        if (patch.winner === 'landlord') draft.antiSpring = false;
        if (patch.winner === 'peasants') draft.spring = false;
        if (patch.redeal) Object.assign(draft, { ...EMPTY_DRAFT, redeal: true });
        clearResult();
        render();
    };

    if (draft.redeal) {
        return [
            el('h2.panel-title', {}, 'Redeal'),
            el('p.muted.small', {}, 'Nobody called, so nothing scores. It still goes in the log so the round count stays honest.'),
            el('div.form-actions', {}, [
                button('Record redeal', { class: 'btn btn-primary', onclick: () => record(match) }),
                button('Cancel', { class: 'btn btn-ghost', onclick: () => set({ redeal: false }) }),
            ]),
        ];
    }

    const v = validateRound(draft, match.playerIds, match.rules);
    const chainInfo = multiplier(draft, match.rules);
    const stake = (Number(draft.call) || 0) * chainInfo.value;

    return [
        el('h2.panel-title', {}, 'Record a round'),

        field('Landlord', el('div.chip-row', {}, players.map((p) => chip(p.name, {
            active: draft.landlordId === p.id,
            color: p.color,
            onclick: () => set({ landlordId: p.id }),
        })))),

        field('Call 叫分', el('div.chip-row', {}, CALLS.map((c) => chip(String(c), {
            active: draft.call === c,
            onclick: () => set({ call: c }),
        })))),

        field('Winner', el('div.chip-row', {}, [
            chip('Landlord won', { active: draft.winner === 'landlord', gold: true, onclick: () => set({ winner: 'landlord' }) }),
            chip('Peasants won', { active: draft.winner === 'peasants', onclick: () => set({ winner: 'peasants' }) }),
        ])),

        field('Bombs 炸弹', el('div.stepper', {}, [
            button('−', { class: 'btn btn-step', 'aria-label': 'One fewer bomb', disabled: draft.bombs === 0, onclick: () => set({ bombs: Math.max(0, draft.bombs - 1) }) }),
            el('span.stepper-value', {}, String(draft.bombs)),
            button('+', { class: 'btn btn-step', 'aria-label': 'One more bomb', onclick: () => set({ bombs: draft.bombs + 1 }) }),
            chip('王炸 rocket', { active: draft.rocket, onclick: () => set({ rocket: !draft.rocket }) }),
        ])),

        // Spring is only offered on the side that can actually have it.
        draft.winner === 'landlord' && match.rules.springEnabled
            ? field('Spring 春天', el('div.chip-row', {}, [
                chip('Peasants never played a card', { active: draft.spring, onclick: () => set({ spring: !draft.spring }) }),
            ])) : null,
        draft.winner === 'peasants' && match.rules.antiSpringEnabled
            ? field('Anti-spring 反春', el('div.chip-row', {}, [
                chip('Landlord played only once', { active: draft.antiSpring, onclick: () => set({ antiSpring: !draft.antiSpring }) }),
            ])) : null,

        el('div.stake-readout', { class: v.ok ? 'stake-readout is-ready' : 'stake-readout' }, [
            el('span.stake-label', {}, 'Stake'),
            el('span.stake-value', {}, v.ok ? String(stake) : '—'),
            el('span.stake-note.small.muted', {}, v.ok
                ? `landlord ${signed(stake * 2 * (draft.winner === 'landlord' ? 1 : -1))}, each peasant ${signed(stake * (draft.winner === 'landlord' ? -1 : 1))}`
                : v.errors[0]),
        ]),

        el('div.form-actions', {}, [
            button('Record round', { class: 'btn btn-primary', disabled: !v.ok, onclick: () => record(match) }),
            button('Redeal', { class: 'btn btn-ghost', onclick: () => set({ redeal: true }) }),
            draft.landlordId || draft.call ? button('Clear', { class: 'btn btn-ghost', onclick: () => { draft = { ...EMPTY_DRAFT }; clearResult(); render(); } }) : null,
        ]),
    ];
}

const field = (label, control) => el('div.field', {}, [el('label.field-label', {}, label), control]);

function chip(label, { active = false, color = null, gold = false, onclick } = {}) {
    return el('button.chip', {
        type: 'button', onclick,
        'aria-pressed': active ? 'true' : 'false',
        'data-active': active ? 'yes' : 'no',
        'data-gold': gold ? 'yes' : null,
        style: color ? `--chip-color:${color}` : null,
    }, label);
}

function record(match) {
    const v = validateRound(draft, match.playerIds, match.rules);
    if (!v.ok) return toast(v.errors[0], 'bad');

    const deltas = scoreRound(draft, match.playerIds, match.rules);
    const saved = store.addRound(match.id, draft);
    resultPhase = { deltas, round: { ...draft } };
    draft = { ...EMPTY_DRAFT };

    // Hold the finished round on the felt long enough to read it, then hand
    // the table back to the next one.
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { resultPhase = null; render(); }, 3200);

    toast(saved.redeal ? 'Redeal recorded.' : 'Round recorded.');
    render();
}

function clearResult() {
    if (!resultPhase) return;
    clearTimeout(resultTimer);
    resultPhase = null;
}

/* ---------------- match summary + log ---------------- */

function matchSummary(match, stats, players) {
    const rows = stats.standings.map((row) => {
        const p = players.find((x) => x.id === row.id);
        const st = stats.players[row.id];
        return el('tr', {}, [
            el('td', {}, [el('span.dot', { style: `--c:${p.color}` }), ' ', p.name]),
            el('td.num.score', { class: `num score ${row.score > 0 ? 'good' : row.score < 0 ? 'bad' : ''}` }, signed(row.score)),
            el('td.num', {}, `${st.asLandlord}`),
            el('td.num', {}, pct(st.landlordWinRate)),
            el('td.num', {}, pct(st.peasantWinRate)),
            el('td.num', { class: `num ${st.netPerRoundAsLandlord > 0 ? 'good' : st.netPerRoundAsLandlord < 0 ? 'bad' : ''}` }, st.netPerRoundAsLandlord == null ? '—' : signed(Number(dec(st.netPerRoundAsLandlord, 1)))),
            el('td.num', { class: `num ${st.netPerRoundAsPeasant > 0 ? 'good' : st.netPerRoundAsPeasant < 0 ? 'bad' : ''}` }, st.netPerRoundAsPeasant == null ? '—' : signed(Number(dec(st.netPerRoundAsPeasant, 1)))),
            el('td.num', {}, st.avgCall == null ? '—' : dec(st.avgCall, 1)),
        ]);
    });

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'This match'),
        el('div.stat-strip', {}, [
            stat('Rounds', String(stats.rounds)),
            stat('Landlord wins', stats.rounds ? pct(stats.landlordWins / stats.rounds) : '—', `${stats.landlordWins} of ${stats.rounds}`),
            stat('Bombs / round', stats.bombsPerRound == null ? '—' : dec(stats.bombsPerRound, 2)),
            stat('Springs', String(stats.springs)),
            stat('Biggest swing', stats.biggestSwing ? String(stats.biggestSwing.points) : '—',
                stats.biggestSwing ? `round ${stats.biggestSwing.roundIndex + 1}` : null),
        ]),
        el('div.table-scroll', {}, el('table.data', {}, [
            el('thead', {}, el('tr', {}, [
                el('th', {}, 'Player'), el('th.num', {}, 'Score'), el('th.num', {}, 'Landlord'),
                el('th.num', {}, 'LL win%'), el('th.num', {}, 'Peasant win%'),
                el('th.num', {}, 'Net/rd LL'), el('th.num', {}, 'Net/rd peas.'), el('th.num', {}, 'Avg call'),
            ])),
            el('tbody', {}, rows),
        ])),
    ]);
}

const stat = (label, value, note) => el('div.stat', {}, [
    el('span.stat-label', {}, label),
    el('span.stat-value', {}, value),
    note ? el('span.stat-note', {}, note) : null,
]);

function roundLog(match, players) {
    if (!match.rounds.length) {
        return el('section.panel', {}, [
            el('h2.panel-title', {}, 'Rounds'),
            el('p.empty', {}, 'No rounds yet. The first one you record shows up here.'),
        ]);
    }
    const name = (id) => players.find((p) => p.id === id)?.name || '—';

    const rows = match.rounds.map((r, i) => {
        const deltas = scoreRound(r, match.playerIds, match.rules);
        const chainInfo = multiplier(r, match.rules);
        return el('tr', { class: r.redeal ? 'is-redeal' : '' }, [
            el('td.num.muted', {}, String(i + 1)),
            el('td', {}, r.redeal ? el('span.muted', {}, 'Redeal 流局') : [
                el('span.role-seal', {}, '地主'), ' ', name(r.landlordId),
            ]),
            el('td.num', {}, r.redeal ? '—' : String(r.call)),
            el('td', {}, r.redeal ? '—' : el('span.badge', { class: `badge ${r.winner === 'landlord' ? 'badge-gold' : 'badge-plain'}` },
                r.winner === 'landlord' ? 'Landlord' : 'Peasants')),
            el('td', {}, r.redeal ? '—' : (chainInfo.factors.length
                ? el('span.chain-inline', {}, chainInfo.factors.map((f) => el('span.chain-tag', { 'data-kind': f.key }, `${f.count > 1 ? `${f.count}× ` : ''}${f.cn}`)))
                : el('span.muted', {}, '—'))),
            el('td.num', {}, r.redeal ? '—' : `×${chainInfo.value}`),
            ...players.map((p) => el('td.num', { class: `num ${deltas[p.id] > 0 ? 'good' : deltas[p.id] < 0 ? 'bad' : 'muted'}` },
                r.redeal ? '—' : signed(deltas[p.id]))),
            el('td.num', {}, el('div.row-actions', {}, [
                button('Edit', { class: 'btn btn-tiny', onclick: () => editRound(match, r, players) }),
                button('Delete', { class: 'btn btn-tiny btn-danger', onclick: () => { store.deleteRound(match.id, r.id); toast('Round deleted.'); } }),
            ])),
        ]);
    });

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'Rounds'),
        el('p.muted.small', {}, 'Scores are folded from this list every time, so editing or deleting any round re-scores the match correctly.'),
        el('div.table-scroll', {}, el('table.data', {}, [
            el('thead', {}, el('tr', {}, [
                el('th.num', {}, '#'), el('th', {}, 'Landlord'), el('th.num', {}, 'Call'),
                el('th', {}, 'Won'), el('th', {}, 'Multipliers'), el('th.num', {}, 'Mult'),
                ...players.map((p) => el('th.num', {}, initials(p.name))),
                el('th', {}, ''),
            ])),
            el('tbody', {}, rows),
        ])),
    ]);
}

/* ---------------- editing a recorded round ---------------- */

function editRound(match, round, players) {
    let edit = { ...round };
    const body = el('div.modal-form');

    const redraw = () => {
        const v = validateRound(edit, match.playerIds, match.rules);
        const info = multiplier(edit, match.rules);
        const stake = (Number(edit.call) || 0) * info.value;
        const set = (patch) => {
            Object.assign(edit, patch);
            if (patch.winner === 'landlord') edit.antiSpring = false;
            if (patch.winner === 'peasants') edit.spring = false;
            redraw();
        };
        mount(body, [
            el('label.field-label', {}, 'Redeal'),
            el('div.chip-row', {}, [chip('Nobody called', { active: !!edit.redeal, onclick: () => set({ redeal: !edit.redeal }) })]),
            edit.redeal ? null : field('Landlord', el('div.chip-row', {}, players.map((p) => chip(p.name, {
                active: edit.landlordId === p.id, color: p.color, onclick: () => set({ landlordId: p.id }),
            })))),
            edit.redeal ? null : field('Call', el('div.chip-row', {}, CALLS.map((c) => chip(String(c), {
                active: edit.call === c, onclick: () => set({ call: c }),
            })))),
            edit.redeal ? null : field('Winner', el('div.chip-row', {}, [
                chip('Landlord', { active: edit.winner === 'landlord', gold: true, onclick: () => set({ winner: 'landlord' }) }),
                chip('Peasants', { active: edit.winner === 'peasants', onclick: () => set({ winner: 'peasants' }) }),
            ])),
            edit.redeal ? null : field('Bombs', el('div.stepper', {}, [
                button('−', { class: 'btn btn-step', disabled: !edit.bombs, onclick: () => set({ bombs: Math.max(0, (edit.bombs || 0) - 1) }) }),
                el('span.stepper-value', {}, String(edit.bombs || 0)),
                button('+', { class: 'btn btn-step', onclick: () => set({ bombs: (edit.bombs || 0) + 1 }) }),
                chip('王炸', { active: !!edit.rocket, onclick: () => set({ rocket: !edit.rocket }) }),
            ])),
            edit.redeal || edit.winner !== 'landlord' || !match.rules.springEnabled ? null
                : field('Spring', el('div.chip-row', {}, [chip('春天', { active: !!edit.spring, onclick: () => set({ spring: !edit.spring }) })])),
            edit.redeal || edit.winner !== 'peasants' || !match.rules.antiSpringEnabled ? null
                : field('Anti-spring', el('div.chip-row', {}, [chip('反春', { active: !!edit.antiSpring, onclick: () => set({ antiSpring: !edit.antiSpring }) })])),
            el('div.stake-readout', {}, [
                el('span.stake-label', {}, 'Stake'),
                el('span.stake-value', {}, edit.redeal ? '0' : (v.ok ? String(stake) : '—')),
                el('span.stake-note.small.muted', {}, edit.redeal ? 'nothing scores' : (v.ok ? '' : v.errors[0])),
            ]),
        ]);
    };
    redraw();

    const close = modal({
        title: 'Edit round',
        body,
        actions: [
            button('Cancel', { class: 'btn btn-ghost', onclick: () => close() }),
            button('Save', {
                class: 'btn btn-primary',
                onclick: () => {
                    const v = validateRound(edit, match.playerIds, match.rules);
                    if (!edit.redeal && !v.ok) return toast(v.errors[0], 'bad');
                    store.updateRound(match.id, round.id, edit);
                    close();
                    toast('Round updated.');
                },
            }),
        ],
    });
}

/* ---------------- starting and ending a match ---------------- */

function newTableScreen() {
    const roster = store.activePlayers();
    let picked = [];

    const host = el('div');
    const redraw = () => {
        mount(host, [
            el('section.panel.panel-start', {}, [
                el('h2.panel-title', {}, 'Sit down'),
                el('p.muted', {}, 'Three players to a table. Pick who is playing — the order you pick them is where they sit.'),
                roster.length < 3
                    ? el('p.empty', {}, ['You need at least three people on the roster. ',
                        button('Add players', { class: 'btn btn-link', onclick: () => { view = 'players'; render(); } })])
                    : el('div.chip-row.chip-row-wrap', {}, roster.map((p) => {
                        const i = picked.indexOf(p.id);
                        return chip(i === -1 ? p.name : `${i + 1}. ${p.name}`, {
                            active: i !== -1,
                            color: i === -1 ? null : store.seatColor(i),
                            onclick: () => {
                                picked = i === -1
                                    ? (picked.length < 3 ? [...picked, p.id] : picked)
                                    : picked.filter((x) => x !== p.id);
                                redraw();
                            },
                        });
                    })),
                el('div.form-actions', {}, [
                    button('Start match', {
                        class: 'btn btn-primary', disabled: picked.length !== 3,
                        onclick: () => {
                            try {
                                store.createMatch(picked, store.getSettings().rules);
                                draft = { ...EMPTY_DRAFT };
                                toast('Table set. Deal.');
                            } catch (e) { toast(e.message, 'bad'); }
                        },
                    }),
                    picked.length ? button('Clear', { class: 'btn btn-ghost', onclick: () => { picked = []; redraw(); } }) : null,
                ]),
            ]),
            store.allMatches().length ? recentMatches() : null,
        ]);
    };
    redraw();
    return host;
}

function recentMatches() {
    const recent = store.allMatches().slice(-3).reverse();
    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'Recent'),
        el('div.match-list', {}, recent.map((m) => matchCard(m, { compact: true }))),
    ]);
}

function confirmEnd(match) {
    const rows = standings(match.rounds, match.playerIds, match.rules);
    const winner = match.players.find((p) => p.id === rows[0].id);
    const close = modal({
        title: 'End this match?',
        body: el('div', {}, [
            el('p.muted', {}, match.rounds.length
                ? `${rows.length && rows[0].score === rows[1]?.score ? 'It is a tie at the top' : `${winner.name} finishes on top`} after ${match.rounds.length} round${match.rounds.length === 1 ? '' : 's'}.`
                : 'No rounds were recorded, so nothing will be scored.'),
            el('div.final-strip', {}, rows.map((r) => {
                const p = match.players.find((x) => x.id === r.id);
                const i = match.players.findIndex((x) => x.id === r.id);
                return el('div.final-row', {}, [
                    el('span.dot', { style: `--c:${store.seatColor(i)}` }),
                    el('span.final-name', {}, p.name),
                    el('span.final-score', { class: `final-score ${r.score > 0 ? 'good' : r.score < 0 ? 'bad' : ''}` }, signed(r.score)),
                ]);
            })),
        ]),
        actions: [
            button('Keep playing', { class: 'btn btn-ghost', onclick: () => close() }),
            button('End match', { class: 'btn btn-primary', onclick: () => { store.finishMatch(match.id); clearResult(); draft = { ...EMPTY_DRAFT }; close(); toast('Match ended.'); } }),
        ],
    });
}

/* ============================================================
   Players
   ============================================================ */

function renderPlayers(root) {
    const roster = store.allPlayers();
    const matches = store.allMatches();
    const lifetime = lifetimeStats(matches);
    const nameById = Object.fromEntries(roster.map((p) => [p.id, p.name]));

    const input = el('input.input', { type: 'text', placeholder: 'Name', maxlength: 24,
        onkeydown: (e) => { if (e.key === 'Enter') add(); } });
    const add = () => {
        const name = input.value.trim();
        if (!name) return toast('Give them a name first.', 'bad');
        store.createPlayer(name);
        input.value = '';
        toast(`${name} added.`);
    };

    mount(root, [
        el('section.panel', {}, [
            el('h2.panel-title', {}, 'Roster'),
            el('p.muted.small', {}, 'Records key off the person, not the name, so fixing a spelling keeps every round they have played.'),
            el('div.add-row', {}, [input, button('Add player', { class: 'btn btn-primary', onclick: add })]),
            roster.length ? el('div.roster', {}, roster.map((p) => rosterCard(p, lifetime[p.id]))) : el('p.empty', {}, 'Nobody on the roster yet.'),
        ]),
        Object.keys(lifetime).length ? lifetimeTable(lifetime, nameById) : null,
        Object.keys(lifetime).length ? matrixPanel(matches, nameById) : null,
    ]);
}

function rosterCard(player, lt) {
    const rename = () => {
        const input = el('input.input', { type: 'text', value: player.name, maxlength: 24 });
        const close = modal({
            title: 'Rename player',
            body: el('div.modal-form', {}, [input, el('p.muted.small', {}, 'Their history follows them.')]),
            actions: [
                button('Cancel', { class: 'btn btn-ghost', onclick: () => close() }),
                button('Save', { class: 'btn btn-primary', onclick: () => { store.updatePlayer(player.id, { name: input.value }); close(); toast('Renamed.'); } }),
            ],
        });
    };
    const remove = () => {
        const res = store.deletePlayer(player.id);
        toast(res.archived ? `${player.name} is archived — they appear in a match, so their history stays.` : `${player.name} removed.`);
    };

    return el('div.roster-card', { class: player.archived ? 'roster-card is-archived' : 'roster-card' }, [
        el('div.roster-top', {}, [
            el('span.avatar', {}, initials(player.name)),
            el('div.roster-id', {}, [
                el('span.roster-name', {}, player.name),
                el('span.roster-meta.small.muted', {}, lt
                    ? `${lt.matchesPlayed} match${lt.matchesPlayed === 1 ? '' : 'es'} · ${lt.rounds} rounds`
                    : 'no rounds yet'),
            ]),
        ]),
        lt ? el('div.roster-stats', {}, [
            miniStat('Score', signed(lt.score), lt.score > 0 ? 'good' : lt.score < 0 ? 'bad' : ''),
            miniStat('As landlord', pct(lt.landlordWinRate)),
            miniStat('As peasant', pct(lt.peasantWinRate)),
        ]) : null,
        el('div.roster-actions', {}, [
            player.archived
                ? button('Restore', { class: 'btn btn-tiny', onclick: () => { store.restorePlayer(player.id); toast(`${player.name} is back on the roster.`); } })
                : button('Rename', { class: 'btn btn-tiny', onclick: rename }),
            player.archived ? null : button('Remove', { class: 'btn btn-tiny btn-danger', onclick: remove }),
        ]),
    ]);
}

const miniStat = (label, value, tone = '') => el('div.mini-stat', {}, [
    el('span.mini-label', {}, label),
    el('span.mini-value', { class: `mini-value ${tone}` }, value),
]);

function lifetimeTable(lifetime, nameById) {
    const rows = Object.values(lifetime).sort((a, b) => b.score - a.score).map((r) => el('tr', {}, [
        el('td', {}, nameById[r.id] || 'Removed player'),
        el('td.num', { class: `num score ${r.score > 0 ? 'good' : r.score < 0 ? 'bad' : ''}` }, signed(r.score)),
        el('td.num', {}, `${r.matchWins}/${r.matchesPlayed}`),
        el('td.num', {}, String(r.rounds)),
        el('td.num', {}, pct(r.landlordRate)),
        el('td.num', {}, pct(r.landlordWinRate)),
        el('td.num', {}, pct(r.peasantWinRate)),
        el('td.num', { class: `num ${r.netPerRoundAsLandlord > 0 ? 'good' : r.netPerRoundAsLandlord < 0 ? 'bad' : ''}` },
            r.netPerRoundAsLandlord == null ? '—' : signed(Number(dec(r.netPerRoundAsLandlord, 1)))),
        el('td.num', { class: `num ${r.netPerRoundAsPeasant > 0 ? 'good' : r.netPerRoundAsPeasant < 0 ? 'bad' : ''}` },
            r.netPerRoundAsPeasant == null ? '—' : signed(Number(dec(r.netPerRoundAsPeasant, 1)))),
        el('td.num', {}, r.avgCall == null ? '—' : dec(r.avgCall, 2)),
    ]));

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'Lifetime'),
        el('p.muted.small', {}, 'Net per round by side is the number that settles arguments: a high call average with a low landlord win rate is someone buying the seat and losing it.'),
        el('div.table-scroll', {}, el('table.data', {}, [
            el('thead', {}, el('tr', {}, [
                el('th', {}, 'Player'), el('th.num', {}, 'Score'), el('th.num', {}, 'Matches'),
                el('th.num', {}, 'Rounds'), el('th.num', {}, 'LL freq'), el('th.num', {}, 'LL win%'),
                el('th.num', {}, 'Peasant win%'), el('th.num', {}, 'Net/rd LL'), el('th.num', {}, 'Net/rd peas.'), el('th.num', {}, 'Avg call'),
            ])),
            el('tbody', {}, rows),
        ])),
    ]);
}

function matrixPanel(matches, nameById) {
    const mx = landlordMatrix(matches);
    const ids = Object.keys(nameById).filter((id) => mx[id] || Object.values(mx).some((row) => row[id]));
    if (!ids.length) return null;

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'Against the landlord'),
        el('p.muted.small', {}, 'Three-handed, the two peasants are allies — so the useful head-to-head is not player against player but how each peasant fares when a given person takes the seat. Read a row as: when they were landlord, this is what each peasant did to them.'),
        el('div.table-scroll', {}, el('table.data.matrix', {}, [
            el('thead', {}, el('tr', {}, [
                el('th', {}, 'Landlord ↓ / peasant →'),
                ...ids.map((id) => el('th.num', {}, nameById[id])),
            ])),
            el('tbody', {}, ids.filter((id) => mx[id]).map((lid) => el('tr', {}, [
                el('th', {}, [el('span.role-seal', {}, '地主'), ' ', nameById[lid]]),
                ...ids.map((pid) => {
                    if (pid === lid) return el('td.num.cell-self', {}, '—');
                    const cell = mx[lid][pid];
                    if (!cell) return el('td.num.muted', {}, '—');
                    return el('td.num', { title: `${cell.wins} of ${cell.rounds} rounds beaten` }, [
                        el('span.cell-rate', { class: `cell-rate ${cell.net > 0 ? 'good' : cell.net < 0 ? 'bad' : ''}` }, pct(cell.winRate)),
                        el('span.cell-net.small.muted', {}, ` ${signed(cell.net)}`),
                    ]);
                }),
            ]))),
        ])),
    ]);
}

/* ============================================================
   History
   ============================================================ */

function renderHistory(root) {
    const matches = store.allMatches().slice().reverse();
    mount(root, [
        rulesPanel(),
        el('section.panel', {}, [
            el('h2.panel-title', {}, 'Matches'),
            matches.length ? el('div.match-list', {}, matches.map((m) => matchCard(m))) : el('p.empty', {}, 'No matches yet.'),
        ]),
        dataPanel(),
    ]);
}

function matchCard(match, { compact = false } = {}) {
    const rows = standings(match.rounds, match.playerIds, match.rules);
    const scored = match.rounds.filter((r) => !r.redeal).length;

    return el('article.match-card', { 'data-status': match.status }, [
        el('div.match-head', {}, [
            el('div', {}, [
                el('span.match-date', {}, when(match.createdAt)),
                el('span.match-meta.small.muted', {}, ` · ${scored} round${scored === 1 ? '' : 's'}`),
            ]),
            el('span.badge', { class: `badge ${match.status === 'active' ? 'badge-live' : 'badge-plain'}` },
                match.status === 'active' ? 'In progress' : 'Finished'),
        ]),
        el('div.match-rows', {}, rows.map((r) => {
            const p = match.players.find((x) => x.id === r.id);
            const i = match.players.findIndex((x) => x.id === r.id);
            return el('div.match-row', { 'data-rank': r.rank }, [
                el('span.dot', { style: `--c:${store.seatColor(i)}` }),
                el('span.match-name', {}, p ? p.name : 'Removed'),
                el('span.match-score', { class: `match-score ${r.score > 0 ? 'good' : r.score < 0 ? 'bad' : ''}` }, signed(r.score)),
            ]);
        })),
        compact ? null : el('div.match-actions', {}, [
            match.status === 'active'
                ? button('Resume', { class: 'btn btn-tiny', onclick: () => { store.setActiveMatch(match.id); view = 'play'; render(); } })
                : button('Reopen', { class: 'btn btn-tiny', onclick: () => { store.reopenMatch(match.id); view = 'play'; clearResult(); render(); toast('Match reopened.'); } }),
            button('Delete', { class: 'btn btn-tiny btn-danger', onclick: () => confirmDeleteMatch(match) }),
        ]),
    ]);
}

function confirmDeleteMatch(match) {
    const close = modal({
        title: 'Delete this match?',
        body: el('p.muted', {}, `${when(match.createdAt)}, ${match.rounds.length} rounds. This cannot be undone, and it removes those rounds from everyone's lifetime record.`),
        actions: [
            button('Keep it', { class: 'btn btn-ghost', onclick: () => close() }),
            button('Delete', { class: 'btn btn-danger', onclick: () => { store.deleteMatch(match.id); close(); toast('Match deleted.'); } }),
        ],
    });
}

function rulesPanel() {
    const rules = store.getSettings().rules;
    const num = (key, label, note) => el('div.rule', {}, [
        el('label.field-label', {}, label),
        el('input.input.input-num', {
            type: 'number', min: 1, step: 1, value: rules[key],
            onchange: (e) => { store.setRules({ [key]: Number(e.target.value) }); toast('House rules updated.'); },
        }),
        note ? el('span.small.muted', {}, note) : null,
    ]);
    const flag = (key, label, note) => el('div.rule', {}, [
        el('label.switch', {}, [
            el('input', { type: 'checkbox', checked: !!rules[key], onchange: (e) => { store.setRules({ [key]: e.target.checked }); toast('House rules updated.'); } }),
            el('span.switch-track', {}, el('span.switch-thumb')),
            el('span.switch-label', {}, label),
        ]),
        note ? el('span.small.muted', {}, note) : null,
    ]);

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'House rules'),
        el('p.muted.small', {}, 'The landlord is always decided by calling 1, 2 or 3, and the call is the base score. What differs table to table is the multiplier chain. A match copies these when it starts, so changing them never re-scores a night already played.'),
        el('div.rules-grid', {}, [
            num('bombMultiplier', 'Bomb 炸弹', 'each bomb multiplies the stake'),
            num('rocketMultiplier', 'Rocket 王炸', 'some tables run it at 4'),
            num('springMultiplier', 'Spring 春天', 'applies to spring and anti-spring'),
            rules.capEnabled ? num('maxMultiplier', 'Cap at', 'the highest multiplier a round can reach') : null,
        ]),
        el('div.rules-grid.rules-flags', {}, [
            flag('springEnabled', 'Spring 春天', 'landlord wins, peasants never played'),
            flag('antiSpringEnabled', 'Anti-spring 反春', 'peasants win, landlord played once'),
            flag('capEnabled', 'Cap the multiplier', 'stop a runaway chain'),
        ]),
    ]);
}

function dataPanel() {
    const importFile = el('input', { type: 'file', accept: 'application/json', class: 'hidden',
        onchange: (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const res = store.importData(JSON.parse(reader.result));
                    toast(`Merged ${res.players} players and ${res.matches} matches.`);
                } catch (err) { toast(err.message, 'bad'); }
                e.target.value = '';
            };
            reader.readAsText(file);
        } });

    const doExport = () => {
        const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `doudizhu-${new Date().toISOString().slice(0, 10)}.json` });
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Exported.');
    };

    const wipe = () => {
        const close = modal({
            title: 'Clear everything?',
            body: el('p.muted', {}, 'Every player, match and round in this browser is deleted. Export first if you want a copy.'),
            actions: [
                button('Cancel', { class: 'btn btn-ghost', onclick: () => close() }),
                button('Clear everything', { class: 'btn btn-danger', onclick: () => { store.clearAll(); close(); toast('Cleared.'); } }),
            ],
        });
    };

    return el('section.panel', {}, [
        el('h2.panel-title', {}, 'Data'),
        el('p.muted.small', {}, 'Everything lives in this browser. Import merges by default, so restoring an old backup never wipes matches played since it was taken.'),
        el('div.form-actions', {}, [
            button('Export', { class: 'btn', onclick: doExport }),
            button('Import', { class: 'btn', onclick: () => importFile.click() }),
            button('Clear everything', { class: 'btn btn-danger', onclick: wipe }),
            importFile,
        ]),
    ]);
}

/* ============================================================
   wiring
   ============================================================ */

function render() {
    Object.entries(views).forEach(([name, node]) => {
        node.classList.toggle('hidden', name !== view);
    });
    if (view === 'play') renderPlay(views.play);
    else if (view === 'players') renderPlayers(views.players);
    else renderHistory(views.history);

    document.querySelectorAll('.tab').forEach((tab) => {
        const on = tab.dataset.view === view;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}

/* The table picks its type sizes from how wide it actually renders, so a
   resize past that threshold has to redraw it. */
let resizeTimer = null;
function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (view === 'play') render(); }, 150);
}

function init() {
    ['play', 'players', 'history'].forEach((name) => { views[name] = document.getElementById(`view-${name}`); });
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => { view = tab.dataset.view; clearResult(); render(); });
    });
    window.addEventListener('resize', onResize);
    store.load();
    store.subscribe(render);
    render();
}

init();

/* ============================================================
   drills.js — the questions.

   Research on teaching this game is consistent: mahjong is learned like a
   language, by exposure and repetition, not like chess, by mastering rules
   first. So every module ends in drills rather than a summary, and the
   recognition drill weights itself towards the tiles a learner keeps missing.

   Generators are pure and take an explicit random source, which is what lets
   the tests assert that a drill never shows an answer key that disagrees with
   the engine. A drill that teaches the wrong thing is worse than no drill.
   ============================================================ */

import {
    TILES, tileName, sortTiles, toCounts, fromCounts, tileFromIndex,
    isHonor, suitOf, rankOf, hairGroupOf, HAIR_GROUPS, HAIR_GROUP_LABEL,
} from './tiles.js';
import { isWinningHand, shanten, discardOptions } from './hand.js';
import { scoreHand } from './scoring.js';

/*
 * A small deterministic generator. Seeded so a failing drill can be reproduced
 * from its seed alone, and so the tests are not flaky.
 *
 * The seed is scrambled and the stream warmed before use. Raw xorshift from a
 * small seed emits several near-zero values first, which biased every weighted
 * draw towards the first item in the list — the recognition drill served 1m
 * however badly a learner knew 白.
 */
export function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    s = Math.imul(s ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
    s = (s ^ (s >>> 16)) >>> 0 || 1;

    const next = () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 0x100000000;
    };
    for (let i = 0; i < 8; i++) next();
    return next;
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function shuffle(rng, arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* Weighted draw, used by the recognition drill so practice concentrates where
   it is needed instead of spreading evenly over tiles already known. */
function weightedPick(rng, items, weightFor) {
    const weights = items.map((t) => Math.max(0.0001, weightFor(t)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
}

const opt = (id, label, extra = {}) => ({ id, label, ...extra });

/* Distractors must be plausible but never accidentally correct, and never
   duplicate each other — two identical options make a four-way question a
   three-way one without saying so. */
function distinctOptions(rng, correct, pool, count = 4) {
    const chosen = [correct];
    for (const c of shuffle(rng, pool)) {
        if (chosen.length >= count) break;
        if (!chosen.some((x) => x.label === c.label)) chosen.push(c);
    }
    return shuffle(rng, chosen);
}

/* ---------------- 0. recognition ---------------- */

function tileIdDrill(rng, ctx) {
    const weightFor = ctx.weightFor ?? (() => 1);
    const tile = weightedPick(rng, TILES, weightFor);
    const correct = opt(tile, tileName(tile));

    const sameSuit = TILES.filter((t) => t !== tile && suitOf(t) === suitOf(tile));
    const others = TILES.filter((t) => t !== tile);
    const pool = [...sameSuit, ...others].map((t) => opt(t, tileName(t)));

    return {
        kind: 'tile-id',
        tile,
        prompt: 'Which tile is this?',
        tiles: [tile],
        options: distinctOptions(rng, correct, pool),
        answerId: tile,
        explain: explainTile(tile),
    };
}

function explainTile(tile) {
    if (!isHonor(tile)) {
        const suit = { m: 'Characters, 萬 — the rank is written as a Chinese numeral above the 萬',
                       p: 'Dots, 筒 — count the circles',
                       s: 'Bamboo, 索 — count the stalks' }[suitOf(tile)];
        if (tile === '1s') {
            return 'The one of bamboo is drawn as a bird rather than a stalk. It is the easiest tile in the set to spot once you know to look for it — and in the Hairs variant it is the wild.';
        }
        return `${tileName(tile)}. ${suit}.`;
    }
    const r = rankOf(tile);
    if (r <= 4) return `${tileName(tile)}. The four winds are 東 south 南 west 西 north 北, in that order — the order the deal and the seats follow all game.`;
    if (r === 5) return 'The white dragon, 白, is the blank one: a carved frame with nothing inside it. It is a tile, not a spare.';
    if (r === 6) return 'The green dragon, 發 — fa cai, prosperity.';
    return 'The red dragon, 中 — hong zhong, the centre.';
}

/* ---------------- 1. sets ---------------- */

function nameTheSetDrill(rng) {
    const kind = pick(rng, ['pair', 'pung', 'kong', 'chow', 'chow']);
    let tiles;
    if (kind === 'chow') {
        const suit = pick(rng, ['m', 'p', 's']);
        const start = 1 + Math.floor(rng() * 7);
        tiles = [start, start + 1, start + 2].map((r) => `${r}${suit}`);
    } else {
        const tile = pick(rng, TILES);
        const n = kind === 'pair' ? 2 : kind === 'pung' ? 3 : 4;
        tiles = new Array(n).fill(tile);
    }
    const labels = {
        pair: 'A pair — two alike',
        pung: 'A pung — three alike',
        kong: 'A kong — four alike',
        chow: 'A chow — three in a row, one suit',
    };
    return {
        kind: 'name-the-set',
        prompt: 'What is this?',
        tiles,
        options: shuffle(rng, Object.entries(labels).map(([k, v]) => opt(k, v))),
        answerId: kind,
        explain: kind === 'chow'
            ? 'Three consecutive tiles of one suit. Honours have no order, so winds and dragons can never form a chow.'
            : `${labels[kind]}. Identical tiles, so any suit and the honours can all form one.`,
    };
}

/* ---------------- 2. winning shape ---------------- */

/* Build a real hand rather than sampling randomly and hoping: a randomly drawn
   14 tiles is almost never a winning hand, so a sampled drill would be a
   drill in answering "no". */
function buildWinningHand(rng) {
    const counts = new Array(34).fill(0);
    const add = (i, n) => {
        if (counts[i] + n > 4) return false;
        counts[i] += n;
        return true;
    };
    let sets = 0;
    let guard = 0;
    while (sets < 4 && guard++ < 200) {
        if (rng() < 0.45) {
            const i = Math.floor(rng() * 34);
            if (add(i, 3)) sets++;
        } else {
            const suit = Math.floor(rng() * 3) * 9;
            const start = suit + Math.floor(rng() * 7);
            if (counts[start] < 4 && counts[start + 1] < 4 && counts[start + 2] < 4) {
                counts[start]++; counts[start + 1]++; counts[start + 2]++;
                sets++;
            }
        }
    }
    for (let g = 0; g < 200; g++) {
        const i = Math.floor(rng() * 34);
        if (add(i, 2)) break;
    }
    return fromCounts(counts);
}

/* Break a winning hand by the smallest possible edit, so "no" is a judgement
   about shape rather than a hand that is obviously junk. */
function breakHand(rng, tiles) {
    for (let attempt = 0; attempt < 40; attempt++) {
        const out = [...tiles];
        const idx = Math.floor(rng() * out.length);
        const replacement = tileFromIndex(Math.floor(rng() * 34));
        out[idx] = replacement;
        try {
            const counts = toCounts(out);
            if (!isWinningHand(counts)) return sortTiles(out);
        } catch { /* five copies: try again */ }
    }
    return null;
}

function isWinningDrill(rng) {
    const winning = buildWinningHand(rng);
    const wantWin = rng() < 0.5;
    let tiles = sortTiles(winning);
    if (!wantWin) tiles = breakHand(rng, winning) ?? tiles;

    const wins = isWinningHand(toCounts(tiles));
    return {
        kind: 'is-winning',
        prompt: 'Four sets and a pair. Is this hand complete?',
        tiles,
        options: [opt('yes', 'Yes, it wins'), opt('no', 'No, not yet')],
        answerId: wins ? 'yes' : 'no',
        explain: wins
            ? 'Fourteen tiles that split into four sets and one pair. That is the standard winning shape, and almost every hand you ever win will be this.'
            : 'These fourteen tiles cannot be split into four sets and a pair. Count the sets you can make, then see what is stranded.',
    };
}

/* ---------------- 3. claims ---------------- */

const CLAIM_RULES = [
    { id: 'win', label: 'Taking it to win', rank: 3 },
    { id: 'pung', label: 'Pung — any player', rank: 2 },
    { id: 'kong', label: 'Kong — any player', rank: 2 },
    { id: 'chow', label: 'Chow — only the player to the discarder\'s right', rank: 1 },
    { id: 'none', label: 'Nobody, play passes on', rank: 0 },
];

function whoClaimsDrill(rng) {
    const scenario = pick(rng, [
        {
            answer: 'win',
            prompt: 'A tile is discarded. One player can pung it, and another can use it to win. Who takes it?',
            explain: 'A win outranks everything. A pung outranks a chow. A chow can only be claimed by the player to the discarder\'s right, because that is whose turn is next anyway.',
        },
        {
            answer: 'pung',
            prompt: 'A tile is discarded. The player to the discarder\'s right can chow it; the player opposite can pung it. Who takes it?',
            explain: 'A pung beats a chow, and it beats it from any seat. The chow claimant loses the tile even though the turn was about to be theirs.',
        },
        {
            answer: 'chow',
            prompt: 'A tile is discarded. Only the player to the discarder\'s right wants it, to complete a run. May they take it?',
            explain: 'Yes. A chow is the one claim restricted by seat: only the player about to take their turn anyway may claim a run.',
        },
        {
            answer: 'none',
            prompt: 'A tile is discarded. The player opposite could complete a run with it, and nobody else wants it. Who takes it?',
            explain: 'Nobody. A chow may only be claimed by the player to the discarder\'s right. From any other seat a run claim is not allowed, and the tile is lost.',
        },
    ]);
    return {
        kind: 'who-claims',
        prompt: scenario.prompt,
        tiles: [],
        options: shuffle(rng, CLAIM_RULES.map((c) => opt(c.id, c.label))),
        answerId: scenario.answer,
        explain: scenario.explain,
    };
}

/* ---------------- 4. reading a hand ---------------- */

function bestDiscardDrill(rng) {
    let tiles = null;
    for (let attempt = 0; attempt < 60 && !tiles; attempt++) {
        const base = buildWinningHand(rng);
        const swapped = [...base];
        swapped[Math.floor(rng() * swapped.length)] = tileFromIndex(Math.floor(rng() * 34));
        try {
            toCounts(swapped);
            tiles = sortTiles(swapped);
        } catch { /* try again */ }
    }
    tiles = tiles ?? sortTiles(buildWinningHand(rng));

    const opts = discardOptions(toCounts(tiles));
    const best = opts[0];
    const worst = opts[opts.length - 1];
    const others = opts.slice(1).filter((o) => o.tile !== best.tile);

    const options = distinctOptions(
        rng,
        opt(best.tile, tileName(best.tile), { tile: best.tile }),
        others.map((o) => opt(o.tile, tileName(o.tile), { tile: o.tile })),
    );

    return {
        kind: 'best-discard',
        prompt: 'Which tile would you throw?',
        tiles,
        options,
        answerId: best.tile,
        explain: best.shanten === 0
            ? `Throwing ${tileName(best.tile)} leaves you waiting on ${best.waits.map(tileName).join(' or ')}. Every other discard here leaves you further away.`
            : `Throwing ${tileName(best.tile)} leaves the hand ${best.shanten} from ready — the closest any discard gets. Keeping ${tileName(worst.tile)} instead costs you ${worst.shanten - best.shanten}.`,
    };
}

/* ---------------- 5. scoring ---------------- */

function scoreItDrill(rng, ctx) {
    const rules = ctx.rules;
    const sevenPairs = rng() < 0.25;
    const pileCount = rng() < 0.45 ? 0 : rng() < 0.7 ? 1 : 2;
    const groups = shuffle(rng, HAIR_GROUPS).slice(0, pileCount);
    const piles = groups.map((group) => ({ group, size: 3 + Math.floor(rng() * 4) }));

    const win = { sevenPairs, piles };
    const truth = scoreHand(win, rules).score;

    const near = new Set();
    for (let d = -3; d <= 4; d++) {
        const v = truth + d;
        if (v > 0 && v !== truth) near.add(v);
    }
    const options = distinctOptions(
        rng,
        opt(`v${truth}`, String(truth)),
        [...near].map((v) => opt(`v${v}`, String(v))),
    );

    const parts = [
        sevenPairs ? `Seven pairs is worth ${rules.sevenPairsWin}` : `A win is worth ${rules.baseWin}`,
        ...piles.map((p) => `the ${HAIR_GROUP_LABEL[p.group].toLowerCase()} pile has ${p.size} tiles, so ${p.size} − 3 = ${Math.max(0, p.size - 3)}`),
    ];
    return {
        kind: 'score-it',
        prompt: piles.length
            ? `You win${sevenPairs ? ' with seven pairs' : ''}, holding ${piles.map((p) => `${p.size} ${HAIR_GROUP_LABEL[p.group].toLowerCase()}`).join(' and ')}. What is it worth?`
            : `You win${sevenPairs ? ' with seven pairs' : ''} with no hairs declared. What is it worth?`,
        tiles: [],
        win,
        options,
        answerId: `v${truth}`,
        explain: `${parts.join('; ')}. That totals ${truth}.`,
    };
}

/* ---------------- registry ---------------- */

export const DRILLS = [
    { id: 'tile-id', module: 0, title: 'Name the tile', generate: tileIdDrill },
    { id: 'name-the-set', module: 1, title: 'Name the set', generate: nameTheSetDrill },
    { id: 'is-winning', module: 2, title: 'Does it win?', generate: isWinningDrill },
    { id: 'who-claims', module: 4, title: 'Who takes it?', generate: whoClaimsDrill },
    { id: 'best-discard', module: 5, title: 'What would you throw?', generate: bestDiscardDrill },
    { id: 'score-it', module: 6, title: 'What is it worth?', generate: scoreItDrill },
];

const BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

export function generate(id, rng, ctx = {}) {
    const drill = BY_ID.get(id);
    if (!drill) throw new Error(`no drill '${id}'`);
    return drill.generate(rng, ctx);
}

export const drillsForModule = (moduleId) => DRILLS.filter((d) => d.module === moduleId);

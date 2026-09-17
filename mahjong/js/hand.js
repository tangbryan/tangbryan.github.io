/* ============================================================
   hand.js — decomposition, win detection and shanten.

   Everything else in the app sits on this file: win detection, the "what
   should I discard" drill, the scoring assistant and the tenpai readout all
   call into it. It is deliberately the most heavily tested module.

   Hands are 34-slot histograms (see tiles.js), never arrays of codes.

   A standard hand is four sets and a pair. A set is a pung (three alike),
   a chow (three in sequence within one suit) or a kong (four alike, which
   only ever arrives already melded). Two special hands stand outside that
   shape: seven pairs and thirteen orphans.
   ============================================================ */

import { TILES, suitOf, rankOf, isTerminalOrHonor, tileFromIndex } from './tiles.js';

const SLOTS = 34;

/* A chow starting at index i needs i+1 and i+2 to be the same suit, which
   holds exactly when i is a numbered tile of rank 7 or less. */
const chowStart = (i) => {
    const t = TILES[i];
    return suitOf(t) !== 'z' && rankOf(t) <= 7;
};

/* ---------------- decomposition ---------------- */

/*
 * Every way the concealed tiles split into (4 − melds) sets and one pair.
 * Returns [] when the hand does not complete. More than one result is normal
 * and meaningful: 111222333m is three pungs or three chows, and which reading
 * you take changes the faan, so scoring needs to see both.
 */
export function decompose(counts, melds = []) {
    const need = 4 - melds.length;
    if (need < 0) return [];
    const c = [...counts];
    const found = [];
    const seen = new Set();

    const record = (sets, pair) => {
        const key = sets.map((s) => `${s.type}:${s.tiles[0]}`).sort().join('|') + `/${pair}`;
        if (seen.has(key)) return;
        seen.add(key);
        found.push({ sets: sets.map((s) => ({ ...s })), pair });
    };

    const walk = (sets, pair) => {
        const i = c.findIndex((n) => n > 0);
        if (i === -1) {
            if (sets.length === need && pair) record(sets, pair);
            return;
        }
        const tile = TILES[i];

        if (!pair && c[i] >= 2) {
            c[i] -= 2;
            walk(sets, tile);
            c[i] += 2;
        }
        if (sets.length < need) {
            if (c[i] >= 3) {
                c[i] -= 3;
                sets.push({ type: 'pung', tiles: [tile, tile, tile], concealed: true });
                walk(sets, pair);
                sets.pop();
                c[i] += 3;
            }
            if (chowStart(i) && c[i + 1] > 0 && c[i + 2] > 0) {
                c[i] -= 1; c[i + 1] -= 1; c[i + 2] -= 1;
                sets.push({ type: 'chow', tiles: [tile, TILES[i + 1], TILES[i + 2]], concealed: true });
                walk(sets, pair);
                sets.pop();
                c[i] += 1; c[i + 1] += 1; c[i + 2] += 1;
            }
        }
    };

    walk([], null);

    const open = melds.map((m) => ({ ...m, concealed: m.concealed ?? false }));
    return found.map((d) => ({ sets: [...open, ...d.sets], pair: d.pair }));
}

/* ---------------- the two special hands ---------------- */

/*
 * Seven distinct pairs. Four of a kind is explicitly not two pairs — allowing
 * it would make a hand with two kongs read as seven pairs, which no ruleset
 * permits. Only ever concealed, so any meld disqualifies it.
 */
export function isSevenPairs(counts, melds = []) {
    if (melds.length) return false;
    return counts.filter((n) => n === 2).length === 7
        && counts.every((n) => n === 0 || n === 2);
}

const ORPHANS = TILES.map((t, i) => (isTerminalOrHonor(t) ? i : -1)).filter((i) => i >= 0);

export function isThirteenOrphans(counts, melds = []) {
    if (melds.length) return false;
    if (!ORPHANS.every((i) => counts[i] >= 1)) return false;
    const total = counts.reduce((a, b) => a + b, 0);
    const outside = counts.reduce((a, n, i) => a + (ORPHANS.includes(i) ? 0 : n), 0);
    return total === 14 && outside === 0;
}

export function isWinningHand(counts, melds = []) {
    return decompose(counts, melds).length > 0
        || isSevenPairs(counts, melds)
        || isThirteenOrphans(counts, melds);
}

/* ---------------- shanten ---------------- */

/*
 * Tiles still needed to reach a win: −1 complete, 0 tenpai, 1 one away.
 *
 * The standard-form count comes from
 *
 *     shanten = 2 × (slotsLeft − sets) − partials − (pair ? 1 : 0)
 *
 * where the four set slots are shared by melds, completed sets and partials,
 * and the pair sits in its own slot. Keeping the pair out of the block budget
 * is what removes the "add one if there is no pair" correction that trips up
 * most implementations of this.
 */
function standardShanten(counts, meldCount) {
    const slots = 4 - meldCount;
    if (slots < 0) return Infinity;
    const c = [...counts];
    let best = Infinity;

    const walk = (i, sets, partials, pair) => {
        const sh = 2 * (slots - sets) - partials - (pair ? 1 : 0);
        if (sh < best) best = sh;
        if (i >= SLOTS || sets + partials >= slots + (pair ? 0 : 0)) {
            if (i >= SLOTS) return;
        }
        if (i >= SLOTS) return;
        if (c[i] === 0) { walk(i + 1, sets, partials, pair); return; }

        const room = sets + partials < slots;

        if (room && c[i] >= 3) {
            c[i] -= 3;
            walk(i, sets + 1, partials, pair);
            c[i] += 3;
        }
        if (room && chowStart(i) && c[i + 1] > 0 && c[i + 2] > 0) {
            c[i] -= 1; c[i + 1] -= 1; c[i + 2] -= 1;
            walk(i, sets + 1, partials, pair);
            c[i] += 1; c[i + 1] += 1; c[i + 2] += 1;
        }
        if (!pair && c[i] >= 2) {
            c[i] -= 2;
            walk(i, sets, partials, true);
            c[i] += 2;
        }
        if (room && c[i] >= 2) {
            c[i] -= 2;
            walk(i, sets, partials + 1, pair);
            c[i] += 2;
        }
        if (room && chowStart(i) && c[i + 1] > 0) {
            c[i] -= 1; c[i + 1] -= 1;
            walk(i, sets, partials + 1, pair);
            c[i] += 1; c[i + 1] += 1;
        }
        // A gap shape (1_3) is as good as a run shape: both need one tile.
        if (room && suitOf(TILES[i]) !== 'z' && rankOf(TILES[i]) <= 7 && c[i + 2] > 0) {
            c[i] -= 1; c[i + 2] -= 1;
            walk(i, sets, partials + 1, pair);
            c[i] += 1; c[i + 2] += 1;
        }
        // Leave this tile as a floater and move on.
        walk(i + 1, sets, partials, pair);
    };

    walk(0, 0, 0, false);
    return best;
}

function sevenPairsShanten(counts, melds) {
    if (melds.length) return Infinity;
    const pairs = counts.filter((n) => n >= 2).length;
    const kinds = counts.filter((n) => n >= 1).length;
    return 6 - pairs + Math.max(0, 7 - kinds);
}

function orphansShanten(counts, melds) {
    if (melds.length) return Infinity;
    const kinds = ORPHANS.filter((i) => counts[i] >= 1).length;
    const hasPair = ORPHANS.some((i) => counts[i] >= 2);
    return 13 - kinds - (hasPair ? 1 : 0);
}

export function shanten(counts, melds = []) {
    return Math.min(
        standardShanten(counts, melds.length),
        sevenPairsShanten(counts, melds),
        orphansShanten(counts, melds),
    );
}

/* ---------------- waits and discards ---------------- */

/* The tiles that would complete this hand right now. */
export function waits(counts, melds = []) {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
        if (counts[i] >= 4) continue;
        counts[i] += 1;
        if (isWinningHand(counts, melds)) out.push(tileFromIndex(i));
        counts[i] -= 1;
    }
    return out;
}

/*
 * Every legal discard from a 14-tile hand, ranked. Ties on shanten break on
 * the width of the resulting wait, which is what a player actually wants to
 * know: two discards that both reach tenpai are not equally good if one waits
 * on two tiles and the other on one.
 */
export function discardOptions(counts, melds = []) {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
        if (counts[i] === 0) continue;
        counts[i] -= 1;
        const sh = shanten(counts, melds);
        out.push({
            tile: tileFromIndex(i),
            shanten: sh,
            waits: sh === 0 ? waits(counts, melds) : [],
        });
        counts[i] += 1;
    }
    return out.sort((a, b) => a.shanten - b.shanten || b.waits.length - a.waits.length);
}

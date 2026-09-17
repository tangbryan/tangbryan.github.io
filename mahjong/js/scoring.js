/* ============================================================
   scoring.js — what a win is worth, and who pays it.

   Two variants, one entry point. `scoreHand` turns a described win into a
   score; `resolvePayment` turns a score into the four seat deltas. Keeping
   those apart matters: the payment rules differ between variants for the same
   score, and the tracker needs the deltas, not the score.

   Every resolvePayment result sums to zero. That is asserted in the tests and
   it is the invariant that keeps a season's running totals honest.
   ============================================================ */

import { WILD, hairGroupOf, HAIR_GROUP_LABEL } from './tiles.js';
import { withDefaults } from './rules.js';

/* ---------------- Hong Kong: faan to points ---------------- */

/*
 * The half-double schedule. Even faan are powers of two; odd faan from five up
 * sit halfway to the next power. Written as a table rather than a formula
 * because the first five entries do not follow the pattern and a clever
 * expression would only hide that.
 */
const FAAN_POINTS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];

export function faanToPoints(faan, rules) {
    const r = withDefaults(rules);
    const capped = Math.min(Math.max(0, Math.floor(faan)), r.limitFaan ?? 13);
    return FAAN_POINTS[Math.min(capped, FAAN_POINTS.length - 1)];
}

/* ---------------- Hairs: piles ---------------- */

/*
 * A pile is declared from the dealt hand, before its owner's first discard,
 * peng or chi. Three tiles, all of one group, all distinct — with 1s (一索,
 * the bird) standing in for any of them.
 *
 * The caller names the group rather than having it inferred, because 1s is
 * both the wild and a terminal in its own right: ['1s','1s','1z'] is a legal
 * winds pile and an illegal terminals one, and only the player knows which
 * they meant.
 */
export function canDeclarePile(tiles, group) {
    if (!Array.isArray(tiles) || tiles.length !== 3) {
        return { ok: false, reason: 'A pile is declared with exactly three tiles.' };
    }
    if (!HAIR_GROUP_LABEL[group]) {
        return { ok: false, reason: `${group} is not a hair group.` };
    }
    const real = tiles.filter((t) => t !== WILD);
    const stray = real.find((t) => hairGroupOf(t) !== group);
    if (stray) {
        return { ok: false, reason: `${stray} is not one of the ${HAIR_GROUP_LABEL[group].toLowerCase()}.` };
    }
    if (new Set(real).size !== real.length) {
        return { ok: false, reason: 'The three tiles must be distinct.' };
    }
    if (real.length === 0) {
        return { ok: false, reason: 'Three wilds are not three distinct tiles.' };
    }
    return { ok: true, group };
}

/* Once a pile is live any tile of its group joins it, duplicates included,
   and the drawer takes a replacement from the back of the wall. */
export function canJoinPile(group, tile) {
    return tile === WILD || hairGroupOf(tile) === group;
}

export function pileHairs(pile, rules) {
    const r = withDefaults(rules);
    const seed = r.hairSeedPerPile ? 3 : 0;
    return Math.max(0, (pile.size ?? 0) - seed);
}

/* ---------------- scoring a win ---------------- */

/*
 * `win` describes what happened, not what the hand was:
 *   Hairs — { sevenPairs, piles: [{ group, size }] }
 *   HKOS  — { faan, flowers }
 */
export function scoreHand(win = {}, rules) {
    const r = withDefaults(rules);
    return r.variant === 'hkos' ? scoreHongKong(win, r) : scoreHairs(win, r);
}

function scoreHairs(win, r) {
    const piles = win.piles ?? [];
    const base = win.sevenPairs ? r.sevenPairsWin : r.baseWin;

    let hairs = piles.reduce((sum, p) => sum + pileHairs(p, r), 0);
    if (!r.hairSeedPerPile) hairs = Math.max(0, hairs - 3);

    const score = r.hairMode === 'multiplicative'
        ? base * 2 ** hairs
        : base + hairs;

    return {
        valid: true,
        variant: 'hairs',
        base,
        hairs,
        score,
        breakdown: [
            { label: win.sevenPairs ? 'Seven pairs' : 'Win', value: base },
            ...(hairs ? [{ label: `${hairs} hair${hairs === 1 ? '' : 's'}`, value: hairs }] : []),
        ],
    };
}

function scoreHongKong(win, r) {
    const flowers = win.flowers ?? 0;
    const handFaan = win.faan ?? 0;
    const faan = handFaan + flowers * r.flowerFaan;

    if (handFaan < r.minFaan) {
        return {
            valid: false,
            variant: 'hkos',
            faan,
            score: 0,
            reason: `A hand needs ${r.minFaan} faan to be declared; this one has ${handFaan}.`,
            breakdown: [],
        };
    }
    return {
        valid: true,
        variant: 'hkos',
        faan,
        score: faanToPoints(faan, r),
        breakdown: [
            { label: `${handFaan} faan`, value: handFaan },
            ...(flowers ? [{ label: `${flowers} flower${flowers === 1 ? '' : 's'}`, value: flowers * r.flowerFaan }] : []),
        ],
    };
}

/* ---------------- payment ---------------- */

/*
 * Returns one delta per seat, summing to zero.
 *
 *   discard  — the discarder alone pays
 *   selfdraw — all three losers pay
 *   draw     — nothing moves
 *
 * Hong Kong multiplies any payment involving the dealer by two. The house
 * variant does not, so the multiplier is a rule rather than a branch.
 */
export function resolvePayment({ seats = 4, winner, winType, discarder, dealer, score }, rules) {
    const r = withDefaults(rules);
    const deltas = new Array(seats).fill(0);
    if (winner == null || winType === 'draw' || !score) return deltas;

    const mult = (payer) => (
        r.dealerDouble && (payer === dealer || winner === dealer) ? 2 : 1
    );

    if (winType === 'selfdraw') {
        for (let seat = 0; seat < seats; seat++) {
            if (seat === winner) continue;
            const paid = score * mult(seat);
            deltas[seat] -= paid;
            deltas[winner] += paid;
        }
    } else {
        if (discarder == null || discarder === winner) return deltas;
        const paid = score * mult(discarder);
        deltas[discarder] -= paid;
        deltas[winner] += paid;
    }
    return deltas;
}

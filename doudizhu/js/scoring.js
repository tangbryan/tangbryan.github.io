/* ============================================================
   scoring.js — the engine. Pure: no DOM, no storage, no imports beyond rules.

   斗地主, 叫分 1–3, abstract points, zero-sum:

       stake = call × 2^bombs × rocket × spring
       landlord wins → landlord +2·stake, each peasant −stake
       peasants win  → landlord −2·stake, each peasant +stake

   Nothing here reads or writes a score. Standings are folded from the round
   list on every call, so editing round 3 of 20 is a re-fold rather than a
   patch, and a fix in this file retroactively corrects every stored match.
   ============================================================ */

import { withDefaults } from './rules.js';

/**
 * The multiplier chain, and the factors that built it — the UI renders those
 * as chips (`底分 2 × 炸 ×2 × 春天 ×2 = 8`), so they are returned rather than
 * folded away.
 */
export function multiplier(round, rules) {
    const r = withDefaults(rules);
    if (!round || round.redeal) return { value: 1, factors: [], capped: false };

    const factors = [];
    const bombs = Math.max(0, Math.floor(Number(round.bombs) || 0));
    if (bombs > 0) {
        factors.push({
            key: 'bomb', label: 'Bomb', cn: '炸弹', count: bombs,
            factor: Math.pow(r.bombMultiplier, bombs),
        });
    }
    if (round.rocket) {
        factors.push({ key: 'rocket', label: 'Rocket', cn: '王炸', count: 1, factor: r.rocketMultiplier });
    }
    // Spring only exists on a landlord win, anti-spring only on a peasant win.
    // Storing the flag on the wrong outcome is a UI slip, not a scoring event.
    if (round.spring && r.springEnabled && round.winner === 'landlord') {
        factors.push({ key: 'spring', label: 'Spring', cn: '春天', count: 1, factor: r.springMultiplier });
    }
    if (round.antiSpring && r.antiSpringEnabled && round.winner === 'peasants') {
        factors.push({ key: 'antiSpring', label: 'Anti-spring', cn: '反春', count: 1, factor: r.springMultiplier });
    }

    const raw = factors.reduce((v, f) => v * f.factor, 1);
    const capped = r.capEnabled && raw > r.maxMultiplier;
    return { value: capped ? r.maxMultiplier : raw, factors, capped };
}

/**
 * Point deltas for one round, keyed by player id. Always sums to zero: the
 * landlord faces every peasant at once, so they take (or pay) one stake per
 * peasant while each peasant settles a single stake.
 */
export function scoreRound(round, seatIds, rules) {
    const deltas = {};
    seatIds.forEach((id) => { deltas[id] = 0; });
    if (!round || round.redeal || !round.winner || !round.landlordId) return deltas;
    if (!seatIds.includes(round.landlordId)) return deltas;

    const stake = (Number(round.call) || 0) * multiplier(round, rules).value;
    const peasants = seatIds.filter((id) => id !== round.landlordId);
    const sign = round.winner === 'landlord' ? 1 : -1;

    deltas[round.landlordId] = sign * stake * peasants.length;
    peasants.forEach((id) => { deltas[id] = -sign * stake; });
    return deltas;
}

/**
 * A round the store will accept. The UI clears contradictory flags as you
 * toggle, but an imported file has no such discipline, so everything that
 * reaches the fold passes through here first.
 */
export function normalizeRound(round) {
    const r = round || {};
    if (r.redeal) {
        return { redeal: true, landlordId: null, call: null, winner: null, bombs: 0, rocket: false, spring: false, antiSpring: false };
    }
    const winner = r.winner === 'landlord' || r.winner === 'peasants' ? r.winner : null;
    return {
        redeal: false,
        landlordId: r.landlordId || null,
        call: r.call == null ? null : Number(r.call),
        winner,
        bombs: Math.max(0, Math.floor(Number(r.bombs) || 0)),
        rocket: !!r.rocket,
        // Spring is a landlord-side event and anti-spring a peasant-side one;
        // a flag left over from flipping the winner is dropped, not scored.
        spring: !!r.spring && winner === 'landlord',
        antiSpring: !!r.antiSpring && winner === 'peasants',
        note: r.note || '',
    };
}

/** Human-readable reasons a round cannot be recorded, for the form to show. */
export function validateRound(round, seatIds, _rules) {
    const errors = [];
    const r = round || {};
    if (r.redeal) return { ok: true, errors };

    if (!r.landlordId) errors.push('Pick the landlord.');
    else if (!seatIds.includes(r.landlordId)) errors.push('The landlord is not at this table.');

    const call = Number(r.call);
    if (!Number.isInteger(call) || call < 1 || call > 3) errors.push('The call must be 1, 2 or 3.');

    if (r.winner !== 'landlord' && r.winner !== 'peasants') errors.push('Say which side won.');

    const bombs = Number(r.bombs);
    if (!Number.isInteger(bombs) || bombs < 0) errors.push('Bombs must be a whole number, zero or more.');

    return { ok: errors.length === 0, errors };
}

/**
 * Current score per player, folded from the round list. Sorted highest first,
 * with tied players sharing a rank (so 4/−2/−2 ranks 1, 2, 2).
 */
export function standings(rounds, seatIds, rules) {
    const totals = {};
    const played = {};
    seatIds.forEach((id) => { totals[id] = 0; played[id] = 0; });

    (rounds || []).forEach((raw) => {
        const round = normalizeRound(raw);
        const deltas = scoreRound(round, seatIds, rules);
        seatIds.forEach((id) => { totals[id] += deltas[id]; });
        if (!round.redeal) seatIds.forEach((id) => { played[id] += 1; });
    });

    const rows = seatIds
        .map((id) => ({ id, score: totals[id], rounds: played[id] }))
        .sort((a, b) => b.score - a.score);

    rows.forEach((row, i) => {
        row.rank = i > 0 && row.score === rows[i - 1].score ? rows[i - 1].rank : i + 1;
    });
    return rows;
}

/**
 * Cumulative score after each round, opening at zero — the series behind the
 * running-score chart. Point i is the table after i rounds.
 */
export function runningScores(rounds, seatIds, rules) {
    const cur = {};
    seatIds.forEach((id) => { cur[id] = 0; });
    const series = [{ index: 0, byId: { ...cur } }];

    (rounds || []).forEach((raw, i) => {
        const deltas = scoreRound(normalizeRound(raw), seatIds, rules);
        seatIds.forEach((id) => { cur[id] += deltas[id]; });
        series.push({ index: i + 1, byId: { ...cur } });
    });
    return series;
}

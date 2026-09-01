/* ============================================================
   scoring.js — the scoring engine. Pure functions, no DOM, no storage.

   The one design rule here: a match's score is never stored, only derived.
   Bag penalties depend on the order hands were played, so the standings are
   a fold over the hand list from zero. That makes editing or deleting hand 3
   of 12 a re-fold rather than a patch, and it means a bug fix in this file
   retroactively corrects every match in the store.
   ============================================================ */

import { withDefaults } from './rules.js';

/* ---------------- one team, one hand ---------------- */

/**
 * Score a single team's hand, before bag penalties.
 *
 * Nil is a player-level contract, so it is settled separately from the
 * partnership's trick contract: a nil bidder contributes 0 to the team bid
 * and their tricks never help their partner make it.
 *
 * @param rules   house rules
 * @param entries array of { bid, nil, tricks } — one per player on the team
 * @returns { points, bags, contract, contractTricks, made, nils }
 */
export function scoreHand(rules, entries) {
    const r = withDefaults(rules);
    const rows = entries.map(normalizeEntry);

    const contractors = rows.filter((e) => e.nil === 'none');
    const nilBidders = rows.filter((e) => e.nil !== 'none');

    const contract = sum(contractors.map((e) => e.bid));
    const contractTricks = sum(contractors.map((e) => e.tricks));

    let bags = 0;
    let points = 0;
    let made = true;

    // The partnership's trick contract.
    if (contractors.length > 0) {
        if (contractTricks >= contract) {
            points += 10 * contract;
            bags += contractTricks - contract;
        } else {
            points -= 10 * contract;
            made = false;
        }
    }

    // Each nil, settled on its own.
    const nils = nilBidders.map((e) => {
        const value = e.nil === 'blind' ? r.blindNil : r.nil;
        const success = e.tricks === 0;
        points += success ? value : -value;
        if (!success && r.failedNilBags) bags += e.tricks;
        if (!success) made = false;
        return { kind: e.nil, tricks: e.tricks, success, value };
    });

    return { points, bags, contract, contractTricks, made, nils };
}

function normalizeEntry(e) {
    const nil = e && (e.nil === 'nil' || e.nil === 'blind') ? e.nil : 'none';
    return {
        nil,
        bid: nil === 'none' ? clampInt(e && e.bid, 0, 13) : 0,
        tricks: clampInt(e && e.tricks, 0, 13),
    };
}

/* ---------------- bags ---------------- */

/**
 * Apply the bag penalty as many times as the running total earns it.
 * A team that lands on 23 bags with a limit of 10 takes the penalty twice
 * and carries 3 — the loop, not a single `if`, is what makes that right.
 */
export function applyBags(rules, prevBags, gained) {
    const r = withDefaults(rules);
    let bags = prevBags + gained;
    let penalty = 0;
    let hits = 0;

    while (r.bagLimit > 0 && bags >= r.bagLimit) {
        penalty += r.bagPenalty;
        hits += 1;
        bags = r.bagsCarry ? bags - r.bagLimit : 0;
        if (!r.bagsCarry) break;
    }

    return { bags, penalty, hits };
}

/* ---------------- the whole match ---------------- */

/**
 * Fold every hand into the current standings.
 *
 * @returns {
 *   teams: [{ teamId, score, bags, bagPenalties, handsPlayed }],
 *   rows:  [{ round, byTeam: { teamId: {...} } }]   — one row per hand
 *   winnerId, over, reason
 * }
 */
export function standings(match) {
    const rules = withDefaults(match.rules);
    const teamIds = match.teamIds || [];

    const state = new Map(
        teamIds.map((id) => [id, { teamId: id, score: 0, bags: 0, bagPenalties: 0, handsPlayed: 0 }])
    );

    const rows = [];
    let winnerId = null;
    let over = false;
    let reason = null;

    (match.rounds || []).forEach((round, index) => {
        const byTeam = {};

        for (const teamId of teamIds) {
            const cur = state.get(teamId);
            const entries = entriesFor(round, match, teamId);
            const hand = scoreHand(rules, entries);
            const bagged = applyBags(rules, cur.bags, hand.bags);

            const delta = hand.points + bagged.penalty;
            cur.score += delta;
            cur.bags = bagged.bags;
            cur.bagPenalties += bagged.hits;
            cur.handsPlayed += 1;

            byTeam[teamId] = {
                ...hand,
                bagsGained: hand.bags,
                bagPenalty: bagged.penalty,
                delta,
                score: cur.score,
                bagsAfter: bagged.bags,
            };
        }

        rows.push({ round: index + 1, id: round.id, byTeam });

        // Win checks run after every hand — a match can end mid-list if hands
        // were entered past the finish, and the standings should say so.
        if (!over) {
            const verdict = checkWin(rules, [...state.values()]);
            if (verdict) {
                over = true;
                winnerId = verdict.winnerId;
                reason = verdict.reason;
                rows[rows.length - 1].decisive = true;
            }
        }
    });

    return {
        rules,
        teams: teamIds.map((id) => ({ ...state.get(id) })),
        rows,
        winnerId,
        over,
        reason,
    };
}

/**
 * Has anyone won? Reaching the target is not enough on its own — two teams
 * can cross in the same hand, and a tie at the top means you keep playing.
 */
function checkWin(rules, teams) {
    if (rules.bust !== null && rules.bust !== undefined) {
        const alive = teams.filter((t) => t.score > rules.bust);
        if (alive.length === 1 && teams.length > 1) {
            return { winnerId: alive[0].teamId, reason: 'bust' };
        }
    }

    const reached = teams.filter((t) => t.score >= rules.target);
    if (reached.length === 0) return null;

    const best = Math.max(...reached.map((t) => t.score));
    const leaders = reached.filter((t) => t.score === best);
    if (leaders.length !== 1) return null; // tied at the top: play another hand

    return { winnerId: leaders[0].teamId, reason: 'target' };
}

/** The per-player entries a given team contributed to a hand. */
export function entriesFor(round, match, teamId) {
    const team = (match.teams || []).find((t) => t.id === teamId);
    const playerIds = team ? team.players.map((p) => p.id) : [];
    return playerIds.map((pid) => (round.entries && round.entries[pid]) || { bid: 0, nil: 'none', tricks: 0 });
}

/* ---------------- hand validation ---------------- */

/**
 * Checks a hand before it is committed. Tricks must account for all 13 —
 * catching that at entry is the difference between a scoreboard and a
 * spreadsheet you stop trusting halfway through the night.
 */
export function validateHand(match, entries) {
    const rules = withDefaults(match.rules);
    const rows = Object.values(entries || {});
    const tricks = sum(rows.map((e) => clampInt(e.tricks, 0, rules.handSize)));
    const bids = sum(rows.map((e) => (e.nil === 'none' ? clampInt(e.bid, 0, rules.handSize) : 0)));

    const errors = [];
    if (tricks !== rules.handSize) {
        errors.push(`Tricks must add up to ${rules.handSize} — currently ${tricks}.`);
    }
    for (const e of rows) {
        if (e.nil !== 'none' && e.bid > 0) {
            errors.push('A nil bid cannot also name a number of tricks.');
            break;
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        tricks,
        bids,
        // "Board" is bids totalling exactly 13; under is where bags come from.
        board: bids === rules.handSize ? 'board' : bids < rules.handSize ? 'under' : 'over',
    };
}

/* ---------------- helpers ---------------- */

export const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);

export function clampInt(v, lo, hi) {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
}

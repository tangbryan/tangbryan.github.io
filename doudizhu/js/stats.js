/* ============================================================
   stats.js — derived analytics. Pure: no DOM, no storage.

   The three numbers that decide a doudizhu night are not the raw score:

     landlord win rate   how often you convert the seat you paid for
     peasant win rate    how often you beat the landlord
     net per round, by side   which seat actually makes you points

   A player who calls 3 every hand and converts 40% of them is losing points
   to a player who never calls and quietly farms the peasant side, and the
   running score alone will not say so. Everything here keys off player id, so
   renaming someone never detaches them from their history.
   ============================================================ */

import { scoreRound, normalizeRound, standings } from './scoring.js';

const rate = (n, d) => (d > 0 ? n / d : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** A fresh row, so every player in the table exists even with zero rounds. */
const blank = (id) => ({
    id, score: 0, rounds: 0,
    asLandlord: 0, landlordWins: 0, netAsLandlord: 0, calls: [],
    asPeasant: 0, peasantWins: 0, netAsPeasant: 0,
    bombs: 0,
});

function finish(row) {
    return {
        ...row,
        landlordWinRate: rate(row.landlordWins, row.asLandlord),
        peasantWinRate: rate(row.peasantWins, row.asPeasant),
        landlordRate: rate(row.asLandlord, row.rounds),
        avgCall: mean(row.calls),
        netPerRoundAsLandlord: rate(row.netAsLandlord, row.asLandlord),
        netPerRoundAsPeasant: rate(row.netAsPeasant, row.asPeasant),
        netPerRound: rate(row.score, row.rounds),
    };
}

/** Per-player splits over one list of rounds. Redeals count for nothing. */
export function playerStats(rounds, seatIds, rules) {
    const rows = Object.fromEntries(seatIds.map((id) => [id, blank(id)]));

    (rounds || []).forEach((raw) => {
        const round = normalizeRound(raw);
        const deltas = scoreRound(round, seatIds, rules);
        seatIds.forEach((id) => { rows[id].score += deltas[id]; });
        if (round.redeal) return;

        const landlordWon = round.winner === 'landlord';
        seatIds.forEach((id) => {
            const row = rows[id];
            row.rounds += 1;
            if (id === round.landlordId) {
                row.asLandlord += 1;
                row.netAsLandlord += deltas[id];
                row.calls.push(round.call);
                if (landlordWon) row.landlordWins += 1;
            } else {
                row.asPeasant += 1;
                row.netAsPeasant += deltas[id];
                if (!landlordWon) row.peasantWins += 1;
            }
        });
    });

    return Object.fromEntries(Object.values(rows).map((r) => [r.id, finish(r)]));
}

/** Everything the match view shows above the per-player table. */
export function matchStats(match, rulesOverride) {
    const rules = rulesOverride || match.rules;
    const seatIds = match.playerIds;
    const all = match.rounds || [];
    const scored = all.map(normalizeRound).filter((r) => !r.redeal);

    let biggestSwing = null;
    all.forEach((raw, i) => {
        const round = normalizeRound(raw);
        if (round.redeal) return;
        const deltas = scoreRound(round, seatIds, rules);
        const points = Math.max(...seatIds.map((id) => Math.abs(deltas[id])));
        if (!biggestSwing || points > biggestSwing.points) {
            biggestSwing = { points, roundIndex: i, round, deltas };
        }
    });

    return {
        rounds: scored.length,
        redeals: all.length - scored.length,
        bombsPerRound: scored.length ? mean(scored.map((r) => r.bombs + (r.rocket ? 1 : 0))) : null,
        springs: scored.filter((r) => r.spring || r.antiSpring).length,
        landlordWins: scored.filter((r) => r.winner === 'landlord').length,
        biggestSwing,
        standings: standings(all, seatIds, rules),
        players: playerStats(all, seatIds, rules),
    };
}

/**
 * The same splits folded across every match. A match win goes to whoever
 * finished on top of a completed match — derived from the fold rather than
 * read off a stored winner, so a corrected round retroactively fixes the record.
 */
export function lifetimeStats(matches) {
    const rows = {};
    const touch = (id) => (rows[id] = rows[id] || { ...blank(id), matchesPlayed: 0, matchWins: 0 });

    (matches || []).forEach((match) => {
        const seatIds = match.playerIds || [];
        const per = playerStats(match.rounds || [], seatIds, match.rules);

        seatIds.forEach((id) => {
            const row = touch(id);
            const p = per[id];
            row.matchesPlayed += 1;
            row.score += p.score;
            row.rounds += p.rounds;
            row.asLandlord += p.asLandlord;
            row.landlordWins += p.landlordWins;
            row.netAsLandlord += p.netAsLandlord;
            row.asPeasant += p.asPeasant;
            row.peasantWins += p.peasantWins;
            row.netAsPeasant += p.netAsPeasant;
            row.calls.push(...p.calls);
        });

        if (match.status === 'complete') {
            standings(match.rounds || [], seatIds, match.rules)
                .filter((r) => r.rank === 1)
                .forEach((r) => { touch(r.id).matchWins += 1; });
        }
    });

    return Object.fromEntries(Object.values(rows).map((r) => [r.id, {
        ...finish(r),
        matchesPlayed: r.matchesPlayed,
        matchWins: r.matchWins,
        matchWinRate: rate(r.matchWins, r.matchesPlayed),
    }]));
}

/**
 * Head-to-head in a three-handed game is not pairwise — two peasants are
 * allies, not opponents. The question that actually comes up is "how do I do
 * against *him* when he takes the landlord seat", so the matrix is
 * landlord → peasant, not player → player.
 */
export function landlordMatrix(matches) {
    const mx = {};

    (matches || []).forEach((match) => {
        const seatIds = match.playerIds || [];
        (match.rounds || []).forEach((raw) => {
            const round = normalizeRound(raw);
            if (round.redeal || !round.landlordId) return;
            const deltas = scoreRound(round, seatIds, match.rules);
            const row = (mx[round.landlordId] = mx[round.landlordId] || {});

            seatIds.filter((id) => id !== round.landlordId).forEach((id) => {
                const cell = (row[id] = row[id] || { rounds: 0, wins: 0, net: 0 });
                cell.rounds += 1;
                cell.net += deltas[id];
                if (round.winner === 'peasants') cell.wins += 1;
            });
        });
    });

    Object.values(mx).forEach((row) => {
        Object.values(row).forEach((cell) => { cell.winRate = rate(cell.wins, cell.rounds); });
    });
    return mx;
}

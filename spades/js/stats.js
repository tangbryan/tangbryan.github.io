/* ============================================================
   stats.js — derived analytics. Pure, and all of it recomputed from the
   hand list, so nothing here can drift out of sync with the score.

   The three numbers that actually tell you how a team plays spades:
     contract rate — how often they make the bid they took
     bid delta     — average (tricks won − tricks bid); positive means they
                     habitually underbid and drown in bags
     bags per hand — the sandbagging rate, the slow way teams lose
   Everything else on this page supports reading those three.
   ============================================================ */

import { standings } from './scoring.js';

const div = (a, b) => (b > 0 ? a / b : 0);

/* ---------------- one team, one match ---------------- */

export function teamMetrics(match, teamId) {
    const s = standings(match);
    const final = s.teams.find((t) => t.teamId === teamId) || { score: 0, bags: 0, bagPenalties: 0 };

    const m = {
        teamId,
        score: final.score,
        bags: final.bags,
        bagPenalties: final.bagPenalties,
        hands: 0,
        made: 0,
        set: 0,
        bidTotal: 0,
        trickTotal: 0,
        deltaTotal: 0,
        contractHands: 0,
        bagsEarned: 0,
        nilAttempts: 0,
        nilMade: 0,
        blindAttempts: 0,
        blindMade: 0,
        best: null,
        worst: null,
    };

    for (const row of s.rows) {
        const h = row.byTeam[teamId];
        if (!h) continue;
        m.hands += 1;
        if (h.made) m.made += 1; else m.set += 1;
        m.bagsEarned += h.bagsGained;

        // Bid delta only means something on hands with an actual contract:
        // a pure double-nil hand has no bid to be over or under.
        if (h.contract > 0 || h.nils.length === 0) {
            m.contractHands += 1;
            m.bidTotal += h.contract;
            m.trickTotal += h.contractTricks;
            m.deltaTotal += h.contractTricks - h.contract;
        }

        for (const n of h.nils) {
            if (n.kind === 'blind') { m.blindAttempts += 1; if (n.success) m.blindMade += 1; }
            else { m.nilAttempts += 1; if (n.success) m.nilMade += 1; }
        }

        if (m.best === null || h.delta > m.best.delta) m.best = { round: row.round, delta: h.delta };
        if (m.worst === null || h.delta < m.worst.delta) m.worst = { round: row.round, delta: h.delta };
    }

    m.contractRate = div(m.made, m.hands);
    m.avgBid = div(m.bidTotal, m.contractHands);
    m.avgTricks = div(m.trickTotal, m.contractHands);
    m.avgDelta = div(m.deltaTotal, m.contractHands);
    m.bagsPerHand = div(m.bagsEarned, m.hands);
    m.pointsPerHand = div(m.score, m.hands);
    m.nilRate = div(m.nilMade + m.blindMade, m.nilAttempts + m.blindAttempts);
    return m;
}

export function matchSummary(match) {
    const s = standings(match);
    return {
        standings: s,
        perTeam: match.teamIds.map((id) => teamMetrics(match, id)),
        leader: [...s.teams].sort((a, b) => b.score - a.score)[0] || null,
        margin: s.teams.length > 1
            ? Math.abs([...s.teams].sort((a, b) => b.score - a.score).slice(0, 2).reduce((a, b) => a.score - b.score))
            : 0,
    };
}

/* ---------------- lifetime, across matches ---------------- */

/** Who won a match — the recorded winner if it was closed out, else the leader. */
export function resultOf(match) {
    const s = standings(match);
    if (match.status === 'complete') {
        return { winnerId: match.winnerId || s.winnerId, decided: true, standings: s };
    }
    return { winnerId: s.winnerId, decided: s.over, standings: s };
}

export function lifetime(matches, teamId) {
    const played = matches
        .filter((m) => m.teamIds.includes(teamId) && m.rounds.length > 0)
        .sort((a, b) => a.createdAt - b.createdAt);

    const agg = {
        teamId,
        matches: 0,
        wins: 0,
        losses: 0,
        hands: 0,
        made: 0,
        bagsEarned: 0,
        bagPenalties: 0,
        nilAttempts: 0,
        nilMade: 0,
        blindAttempts: 0,
        blindMade: 0,
        pointsFor: 0,
        deltaTotal: 0,
        contractHands: 0,
        currentStreak: 0,
        longestWin: 0,
        recent: [],
    };

    let run = 0;
    for (const match of played) {
        const { winnerId, decided } = resultOf(match);
        const m = teamMetrics(match, teamId);

        agg.matches += 1;
        agg.hands += m.hands;
        agg.made += m.made;
        agg.bagsEarned += m.bagsEarned;
        agg.bagPenalties += m.bagPenalties;
        agg.nilAttempts += m.nilAttempts;
        agg.nilMade += m.nilMade;
        agg.blindAttempts += m.blindAttempts;
        agg.blindMade += m.blindMade;
        agg.pointsFor += m.score;
        agg.deltaTotal += m.deltaTotal;
        agg.contractHands += m.contractHands;

        // A match still in progress contributes its hands to the bidding stats
        // but cannot contribute a result — you don't have a record until it ends.
        if (!decided) continue;

        const won = winnerId === teamId;
        if (won) { agg.wins += 1; run = run > 0 ? run + 1 : 1; }
        else { agg.losses += 1; run = run < 0 ? run - 1 : -1; }
        agg.longestWin = Math.max(agg.longestWin, run);
        agg.recent.push(won ? 'W' : 'L');
    }

    agg.currentStreak = run;
    agg.recent = agg.recent.slice(-8);
    agg.winRate = div(agg.wins, agg.wins + agg.losses);
    agg.contractRate = div(agg.made, agg.hands);
    agg.bagsPerHand = div(agg.bagsEarned, agg.hands);
    agg.avgDelta = div(agg.deltaTotal, agg.contractHands);
    agg.pointsPerHand = div(agg.pointsFor, agg.hands);
    agg.nilRate = div(agg.nilMade + agg.blindMade, agg.nilAttempts + agg.blindAttempts);
    return agg;
}

export function headToHead(matches, aId, bId) {
    const shared = matches.filter(
        (m) => m.teamIds.includes(aId) && m.teamIds.includes(bId) && m.rounds.length > 0
    );
    let a = 0, b = 0, open = 0;
    for (const m of shared) {
        const { winnerId, decided } = resultOf(m);
        if (!decided) { open += 1; continue; }
        if (winnerId === aId) a += 1;
        else if (winnerId === bId) b += 1;
    }
    return { played: a + b, a, b, open };
}

/* ---------------- players ---------------- */

/**
 * Individual form. A player has no contract of their own in partnership
 * spades, so what is measurable is their bid size, what they actually take,
 * and how their nils go — which is exactly the case for or against letting
 * them bid nil again.
 */
export function playerMetrics(matches, playerId) {
    const p = { playerId, hands: 0, bidTotal: 0, trickTotal: 0, nilAttempts: 0, nilMade: 0, blindAttempts: 0, blindMade: 0 };

    for (const match of matches) {
        for (const round of match.rounds) {
            const e = round.entries && round.entries[playerId];
            if (!e) continue;
            p.hands += 1;
            p.trickTotal += Number(e.tricks) || 0;
            if (e.nil === 'blind') { p.blindAttempts += 1; if ((Number(e.tricks) || 0) === 0) p.blindMade += 1; }
            else if (e.nil === 'nil') { p.nilAttempts += 1; if ((Number(e.tricks) || 0) === 0) p.nilMade += 1; }
            else p.bidTotal += Number(e.bid) || 0;
        }
    }

    const contractHands = p.hands - p.nilAttempts - p.blindAttempts;
    p.avgBid = div(p.bidTotal, contractHands);
    p.avgTricks = div(p.trickTotal, p.hands);
    p.nilRate = div(p.nilMade + p.blindMade, p.nilAttempts + p.blindAttempts);
    p.nilShare = div(p.nilAttempts + p.blindAttempts, p.hands);
    return p;
}

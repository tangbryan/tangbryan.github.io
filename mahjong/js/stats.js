/* ============================================================
   stats.js — what the hands add up to.

   Pure functions over stored sessions. Nothing here reads localStorage or
   touches the DOM, which is what makes it testable and what keeps the
   tracker's numbers verifiable.

   Every hand carries its own deltas, so statistics never re-derive a score.
   The three numbers that actually tell a beginner something:

     score      how the night is going
     wins       how often you get there first
     dealInto   how often you hand someone else the tile they needed

   The third is the one new players never track and the one that most changes
   how they discard.
   ============================================================ */

const EMPTY = (seat, playerId) => ({
    seat,
    playerId,
    score: 0,
    wins: 0,
    selfDraws: 0,
    dealInto: 0,
    handsPlayed: 0,
});

export function standings(session) {
    const rows = (session.seats ?? []).map((s, i) => EMPTY(i, s.playerId));
    for (const h of session.hands ?? []) {
        (h.deltas ?? []).forEach((d, i) => { if (rows[i]) rows[i].score += d; });
        rows.forEach((r) => { r.handsPlayed += 1; });
        if (h.winner != null && h.winType !== 'draw') {
            if (rows[h.winner]) {
                rows[h.winner].wins += 1;
                if (h.winType === 'selfdraw') rows[h.winner].selfDraws += 1;
            }
            if (h.winType === 'discard' && h.discarder != null && rows[h.discarder]) {
                rows[h.discarder].dealInto += 1;
            }
        }
    }
    return rows;
}

/* One cumulative series per seat, each beginning at zero so the chart has a
   common origin rather than starting at whatever the first hand paid. */
export function runningScores(session) {
    const seats = (session.seats ?? []).length;
    const series = Array.from({ length: seats }, () => [0]);
    let running = new Array(seats).fill(0);
    for (const h of session.hands ?? []) {
        running = running.map((v, i) => v + ((h.deltas ?? [])[i] ?? 0));
        running.forEach((v, i) => series[i].push(v));
    }
    return series;
}

export function sessionSummary(session) {
    const hands = session.hands ?? [];
    const rows = standings(session);
    const biggestSwing = hands.reduce(
        (max, h) => Math.max(max, ...(h.deltas ?? [0]).map(Math.abs)), 0,
    );
    return {
        handsPlayed: hands.length,
        selfDraws: hands.filter((h) => h.winType === 'selfdraw').length,
        draws: hands.filter((h) => h.winType === 'draw').length,
        biggestSwing,
        leader: [...rows].sort((a, b) => b.score - a.score)[0] ?? null,
    };
}

/*
 * A player across every session they sat in. Keyed on player id, never on
 * name or seat: someone renamed in October keeps every hand they played in
 * March, and someone who sat East one night and North the next is one person.
 */
export function lifetime(players, sessions) {
    return players.map((p) => {
        const row = {
            playerId: p.id,
            name: p.name,
            score: 0,
            wins: 0,
            selfDraws: 0,
            dealInto: 0,
            handsPlayed: 0,
            sessions: 0,
        };
        for (const s of sessions) {
            const seat = (s.seats ?? []).findIndex((x) => x.playerId === p.id);
            if (seat < 0) continue;
            row.sessions += 1;
            const r = standings(s)[seat];
            row.score += r.score;
            row.wins += r.wins;
            row.selfDraws += r.selfDraws;
            row.dealInto += r.dealInto;
            row.handsPlayed += r.handsPlayed;
        }
        return row;
    });
}

export const rate = (n, d) => (d > 0 ? n / d : null);
export const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

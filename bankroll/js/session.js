/* ============================================================
   session.js — the session model. Pure: no storage, no DOM.

   Shared verbatim between the read-only site and the editable tracker
   (github.com/tangbryan/poker-bankroll-tracker) so the two can't disagree
   about what a session is or how profit is computed.
   ============================================================ */

export const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** A session:
 *  { id, date:'YYYY-MM-DD', type:'cash'|'tournament', game, location, hours,
 *    stakes, sb, bb, buyIn, cashOut,          // cash
 *    fee, entrants, place, prize,             // tournament
 *    notes }
 *  Profit is always derived, never stored.
 */

export const profitOf = (s) =>
    s.type === 'tournament'
        ? (+s.prize || 0) - ((+s.buyIn || 0) + (+s.fee || 0))
        : (+s.cashOut || 0) - (+s.buyIn || 0);

/** Total money put at risk — the denominator for ROI. */
export const investedOf = (s) =>
    s.type === 'tournament' ? (+s.buyIn || 0) + (+s.fee || 0) : (+s.buyIn || 0);

/** Parse "1/2" or "2/5" into blinds. Returns null when not parseable. */
export function parseStakes(str) {
    if (!str) return null;
    const m = String(str).match(/^\s*\$?([\d.]+)\s*\/\s*\$?([\d.]+)/);
    if (!m) return null;
    const sb = parseFloat(m[1]), bb = parseFloat(m[2]);
    if (!isFinite(sb) || !isFinite(bb) || bb <= 0) return null;
    return { sb, bb };
}

/** Coerce anything session-shaped into the canonical form. */
export function normalize(s) {
    const out = { ...s };
    out.type = s.type === 'tournament' ? 'tournament' : 'cash';
    out.date = s.date || new Date().toISOString().slice(0, 10);
    out.hours = Math.max(0, +s.hours || 0);
    out.location = (s.location || '').trim();
    out.game = (s.game || 'NLH').trim();
    out.notes = (s.notes || '').trim();
    ['buyIn', 'cashOut', 'fee', 'prize', 'entrants', 'place'].forEach((k) => {
        if (out[k] === '' || out[k] == null) out[k] = 0;
        else out[k] = +out[k] || 0;
    });
    if (out.type === 'cash') {
        out.stakes = (s.stakes || '').trim();
        const b = parseStakes(out.stakes);
        out.sb = b ? b.sb : 0;
        out.bb = b ? b.bb : 0;
        out.fee = 0; out.prize = 0; out.entrants = 0; out.place = 0;
    } else {
        out.stakes = (s.stakes || '').trim();
        out.cashOut = 0; out.sb = 0; out.bb = 0;
    }
    return out;
}

/** Stable identity for dedupe on import. */
export const fingerprint = (s) =>
    [s.date, s.type, s.stakes, s.location, s.hours, s.buyIn, s.cashOut, s.prize].join('|');

const csvCell = (v) => {
    const str = String(v ?? '');
    // Guard against spreadsheet formula injection on the leading character.
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCSV(rows) {
    const cols = ['date', 'type', 'game', 'stakes', 'location', 'hours', 'buyIn', 'fee',
        'cashOut', 'prize', 'entrants', 'place', 'profit', 'notes'];
    const lines = [cols.join(',')];
    for (const s of rows) {
        lines.push(cols.map((c) => csvCell(c === 'profit' ? profitOf(s) : s[c])).join(','));
    }
    return lines.join('\n');
}

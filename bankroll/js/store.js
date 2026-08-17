/* ============================================================
   store.js — session data model, persistence, import/export
   ============================================================ */

const KEY = 'bt_bankroll_v1';
const SETTINGS_KEY = 'bt_bankroll_settings_v1';

/** A session:
 *  { id, date:'YYYY-MM-DD', type:'cash'|'tournament', game, location, hours,
 *    stakes, sb, bb, buyIn, cashOut,          // cash
 *    fee, entrants, place, prize,             // tournament
 *    notes }
 *  Profit is always derived, never stored.
 */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

/* ---------------- persistence ---------------- */

let sessions = [];
let settings = { currency: '$', demo: false };
const listeners = new Set();

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(sessions));

function persist() {
    try {
        localStorage.setItem(KEY, JSON.stringify(sessions));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('bankroll: could not save to localStorage', e);
    }
    emit();
}

export function load() {
    try {
        const raw = localStorage.getItem(KEY);
        sessions = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(sessions)) sessions = [];
        const s = localStorage.getItem(SETTINGS_KEY);
        if (s) settings = { ...settings, ...JSON.parse(s) };
    } catch (e) {
        console.warn('bankroll: could not read saved sessions', e);
        sessions = [];
    }
    return sessions;
}

export const all = () => sessions.slice();
export const getSettings = () => ({ ...settings });
export function setSettings(patch) { settings = { ...settings, ...patch }; persist(); }

export function add(session) {
    const s = normalize({ ...session, id: uid() });
    sessions.push(s);
    persist();
    return s;
}

export function update(id, patch) {
    const i = sessions.findIndex((s) => s.id === id);
    if (i === -1) return null;
    sessions[i] = normalize({ ...sessions[i], ...patch, id });
    persist();
    return sessions[i];
}

export function remove(id) {
    sessions = sessions.filter((s) => s.id !== id);
    persist();
}

export function clearAll() {
    sessions = [];
    settings.demo = false;
    persist();
}

export const byId = (id) => sessions.find((s) => s.id === id) || null;

function normalize(s) {
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

/* ---------------- import / export ---------------- */

export function exportJSON() {
    return JSON.stringify({ version: 1, exported: new Date().toISOString(), sessions }, null, 2);
}

/** Replace-or-merge import. Returns {added, skipped}. */
export function importJSON(text, { merge = true } = {}) {
    const data = JSON.parse(text);
    const incoming = Array.isArray(data) ? data : data.sessions;
    if (!Array.isArray(incoming)) throw new Error('No "sessions" array found in that file.');
    if (!merge) sessions = [];
    const existing = new Set(sessions.map(fingerprint));
    let added = 0, skipped = 0;
    for (const raw of incoming) {
        const s = normalize({ ...raw, id: uid() });
        if (merge && existing.has(fingerprint(s))) { skipped++; continue; }
        existing.add(fingerprint(s));
        sessions.push(s);
        added++;
    }
    settings.demo = false;
    persist();
    return { added, skipped };
}

const fingerprint = (s) =>
    [s.date, s.type, s.stakes, s.location, s.hours, s.buyIn, s.cashOut, s.prize].join('|');

const csvCell = (v) => {
    const str = String(v ?? '');
    // Guard against spreadsheet formula injection on the leading character.
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCSV(rows = sessions) {
    const cols = ['date', 'type', 'game', 'stakes', 'location', 'hours', 'buyIn', 'fee',
        'cashOut', 'prize', 'entrants', 'place', 'profit', 'notes'];
    const lines = [cols.join(',')];
    for (const s of rows) {
        lines.push(cols.map((c) => csvCell(c === 'profit' ? profitOf(s) : s[c])).join(','));
    }
    return lines.join('\n');
}

/* ---------------- demo data ---------------- */

/** Deterministic pseudo-random so the sample set looks the same every load. */
function mulberry(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A believable ~14-month history: a small winning cash player who also fires MTTs. */
export function demoSessions() {
    const rnd = mulberry(20260214);
    const out = [];
    const venues = ['Texas Card House', 'Lodge Card Club', 'Champions Club', 'Home game', 'WinStar'];
    const stakesTable = [
        { stakes: '1/2', bbPerHr: 4.5, sd: 55, buyIn: 300 },
        { stakes: '1/3', bbPerHr: 4.0, sd: 70, buyIn: 500 },
        { stakes: '2/5', bbPerHr: 3.0, sd: 130, buyIn: 1000 },
        { stakes: '5/10', bbPerHr: 2.0, sd: 260, buyIn: 2000 },
    ];

    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - 14);

    // Box-Muller for a realistic bell-shaped session outcome.
    const gauss = () => {
        const u = Math.max(rnd(), 1e-9), v = Math.max(rnd(), 1e-9);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        // plays mostly Thu–Sun
        const playChance = dow === 5 || dow === 6 ? 0.55 : dow === 4 || dow === 0 ? 0.3 : 0.08;
        if (rnd() > playChance) continue;

        const date = d.toISOString().slice(0, 10);
        const isMTT = rnd() < 0.16;

        if (isMTT) {
            const buyIn = [110, 240, 400, 1100][Math.floor(rnd() * 4)];
            const fee = Math.round(buyIn * 0.1);
            const entrants = 60 + Math.floor(rnd() * 400);
            const cashed = rnd() < 0.17;
            const place = cashed
                ? 1 + Math.floor(rnd() * Math.max(1, entrants * 0.13))
                : Math.floor(entrants * 0.15) + Math.floor(rnd() * entrants * 0.85);
            // steep, top-heavy payout curve
            const prize = cashed
                ? Math.round(buyIn * entrants * (0.28 / Math.pow(place, 0.85)))
                : 0;
            out.push({
                id: uid(), date, type: 'tournament', game: 'NLH',
                stakes: `$${buyIn} MTT`, location: venues[Math.floor(rnd() * venues.length)],
                hours: +(3 + rnd() * 7).toFixed(1),
                buyIn, fee, prize, entrants, place, cashOut: 0, sb: 0, bb: 0,
                notes: cashed && place <= 3 ? 'Deep run — final table' : '',
            });
        } else {
            const t = stakesTable[Math.min(3, Math.floor(Math.pow(rnd(), 1.7) * 4))];
            const hours = +(3 + rnd() * 6).toFixed(1);
            const { sb, bb } = parseStakes(t.stakes);
            // Win rate scales with hours; variance scales with sqrt(hours).
            const profit = Math.round(
                (t.bbPerHr * bb * hours) + gauss() * t.sd * Math.sqrt(hours)
            );
            const buyIn = t.buyIn;
            out.push({
                id: uid(), date, type: 'cash', game: rnd() < 0.12 ? 'PLO' : 'NLH',
                stakes: t.stakes, location: venues[Math.floor(rnd() * venues.length)],
                hours, buyIn, cashOut: Math.max(0, buyIn + profit), sb, bb,
                fee: 0, prize: 0, entrants: 0, place: 0, notes: '',
            });
        }
    }
    return out;
}

export function loadDemo() {
    sessions = demoSessions();
    settings.demo = true;
    persist();
    return sessions;
}

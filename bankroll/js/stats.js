/* ============================================================
   stats.js — all derived metrics. Pure functions over sessions.
   ============================================================ */

import { profitOf, investedOf } from './session.js';

export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);
const mean = (arr, f = (x) => x) => (arr.length ? sum(arr, f) / arr.length : 0);

/** Sample standard deviation (n-1). Needs >= 2 points to mean anything. */
export function stdev(values) {
    const n = values.length;
    if (n < 2) return 0;
    const m = values.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1));
}

export const byDateAsc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/* ---------------- filtering ---------------- */

export function applyFilters(sessions, f) {
    const now = new Date();
    let from = null;
    if (f.range && f.range !== 'all') {
        from = new Date(now);
        if (f.range === 'ytd') from = new Date(now.getFullYear(), 0, 1);
        else if (f.range === '30d') from.setDate(now.getDate() - 30);
        else if (f.range === '90d') from.setDate(now.getDate() - 90);
        else if (f.range === '365d') from.setFullYear(now.getFullYear() - 1);
    }
    const fromStr = from ? from.toISOString().slice(0, 10) : null;

    return sessions.filter((s) => {
        if (fromStr && s.date < fromStr) return false;
        if (f.type && f.type !== 'all' && s.type !== f.type) return false;
        if (f.stakes && f.stakes !== 'all' && s.stakes !== f.stakes) return false;
        if (f.location && f.location !== 'all' && s.location !== f.location) return false;
        if (f.q) {
            const q = f.q.toLowerCase();
            const hay = `${s.location} ${s.stakes} ${s.game} ${s.notes} ${s.date}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

/* ---------------- headline metrics ---------------- */

export function summary(sessions) {
    const n = sessions.length;
    const profits = sessions.map(profitOf);
    const net = sum(profits);
    const hours = sum(sessions, (s) => s.hours);
    const invested = sum(sessions, investedOf);
    const wins = profits.filter((p) => p > 0).length;
    const losses = profits.filter((p) => p < 0).length;

    const cash = sessions.filter((s) => s.type === 'cash');
    const mtt = sessions.filter((s) => s.type === 'tournament');

    // bb/hr only counts cash sessions that have both blinds and clocked hours.
    const bbEligible = cash.filter((s) => s.bb > 0 && s.hours > 0);
    const bbWon = sum(bbEligible, (s) => profitOf(s) / s.bb);
    const bbHours = sum(bbEligible, (s) => s.hours);

    const sd = stdev(profits);
    // Standard error of the mean session result, scaled to an hourly figure.
    const hourly = hours > 0 ? net / hours : 0;
    const seSession = n > 1 ? sd / Math.sqrt(n) : 0;
    const avgHours = n ? hours / n : 0;
    const hourlyMargin = avgHours > 0 ? (1.96 * seSession) / avgHours : 0;

    return {
        n, net, hours, invested, wins, losses,
        winRate: n ? wins / n : 0,
        hourly,
        hourlyLow: hourly - hourlyMargin,
        hourlyHigh: hourly + hourlyMargin,
        hourlyMargin,
        avgSession: mean(profits),
        avgHours,
        best: n ? Math.max(...profits) : 0,
        worst: n ? Math.min(...profits) : 0,
        sd,
        roi: invested > 0 ? net / invested : 0,
        bbPerHr: bbHours > 0 ? bbWon / bbHours : null,
        cashNet: sum(cash, profitOf),
        mttNet: sum(mtt, profitOf),
        cashCount: cash.length,
        mttCount: mtt.length,
        maxDrawdown: maxDrawdown(sessions),
        streak: currentStreak(sessions),
        longest: longestStreaks(sessions),
    };
}

/** Cumulative profit after each session, in date order. */
export function cumulative(sessions) {
    const sorted = sessions.slice().sort(byDateAsc);
    let run = 0;
    return sorted.map((s) => {
        run += profitOf(s);
        return { date: s.date, value: run, session: s };
    });
}

/** Largest peak-to-trough decline on the cumulative curve. */
export function maxDrawdown(sessions) {
    const curve = cumulative(sessions);
    let peak = 0, worst = 0, peakDate = null, troughDate = null, curPeakDate = null;
    for (const p of curve) {
        if (p.value > peak) { peak = p.value; curPeakDate = p.date; }
        const dd = peak - p.value;
        if (dd > worst) { worst = dd; peakDate = curPeakDate; troughDate = p.date; }
    }
    return { amount: worst, from: peakDate, to: troughDate };
}

function currentStreak(sessions) {
    const sorted = sessions.slice().sort(byDateAsc);
    let count = 0, dir = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = profitOf(sorted[i]);
        const d = p > 0 ? 1 : p < 0 ? -1 : 0;
        if (d === 0) break;
        if (dir === 0) { dir = d; count = 1; }
        else if (d === dir) count++;
        else break;
    }
    return { dir, count };
}

function longestStreaks(sessions) {
    const sorted = sessions.slice().sort(byDateAsc);
    let win = 0, loss = 0, cw = 0, cl = 0;
    for (const s of sorted) {
        const p = profitOf(s);
        if (p > 0) { cw++; cl = 0; win = Math.max(win, cw); }
        else if (p < 0) { cl++; cw = 0; loss = Math.max(loss, cl); }
        else { cw = 0; cl = 0; }
    }
    return { win, loss };
}

/* ---------------- groupings ---------------- */

/** Generic group-and-aggregate. Returns [{key, net, hours, n, hourly, ...}]. */
export function groupBy(sessions, keyFn) {
    const map = new Map();
    for (const s of sessions) {
        const k = keyFn(s);
        if (k == null || k === '') continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(s);
    }
    return [...map.entries()].map(([key, rows]) => {
        const net = sum(rows, profitOf);
        const hours = sum(rows, (s) => s.hours);
        const wins = rows.filter((s) => profitOf(s) > 0).length;
        return {
            key, rows, net, hours, n: rows.length,
            hourly: hours > 0 ? net / hours : 0,
            winRate: rows.length ? wins / rows.length : 0,
            invested: sum(rows, investedOf),
        };
    });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym) => {
    const [y, m] = ym.split('-');
    return `${MONTHS[+m - 1]} ${String(y).slice(2)}`;
};

/** Every month between the first and last session, so gaps show as zero. */
export function byMonth(sessions) {
    if (!sessions.length) return [];
    const groups = groupBy(sessions, (s) => s.date.slice(0, 7));
    const map = new Map(groups.map((g) => [g.key, g]));
    const keys = groups.map((g) => g.key).sort();
    const out = [];
    const [sy, sm] = keys[0].split('-').map(Number);
    const [ey, em] = keys[keys.length - 1].split('-').map(Number);
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em);) {
        const k = `${y}-${String(m).padStart(2, '0')}`;
        out.push(map.get(k) || { key: k, rows: [], net: 0, hours: 0, n: 0, hourly: 0, winRate: 0 });
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function byDayOfWeek(sessions) {
    const groups = groupBy(sessions, (s) => DOW[new Date(s.date + 'T12:00:00').getDay()]);
    const map = new Map(groups.map((g) => [g.key, g]));
    return DOW.map((d) => map.get(d) || { key: d, rows: [], net: 0, hours: 0, n: 0, hourly: 0, winRate: 0 });
}

const quantile = (sorted, q) => {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** Histogram of session results into signed buckets.
 *  Bucket width comes from the 5th–95th percentile spread, not the extremes —
 *  one huge tournament score would otherwise stretch the scale until every
 *  ordinary session piled into a single bar. Anything beyond the range is
 *  clamped into an overflow bucket at that end and flagged, so no session is
 *  dropped from the count.
 */
export function distribution(sessions, bucketCount = 15) {
    const profits = sessions.map(profitOf);
    if (!profits.length) return [];
    const sorted = profits.slice().sort((a, b) => a - b);

    const spread = Math.max(
        Math.abs(quantile(sorted, 0.05)),
        Math.abs(quantile(sorted, 0.95)),
        1
    );
    const raw = (spread * 2) / bucketCount;
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
    const width = nice.find((w) => w >= raw) || Math.ceil(raw / 10000) * 10000;
    const half = Math.max(1, Math.ceil(spread / width));

    const buckets = [];
    for (let i = -half; i < half; i++) {
        buckets.push({ lo: i * width, hi: i * width + width, count: 0, overflow: 0 });
    }
    const first = buckets[0], last = buckets[buckets.length - 1];
    for (const p of profits) {
        if (p < first.lo) { first.count++; first.overflow = -1; continue; }
        if (p >= last.hi) { last.count++; last.overflow = 1; continue; }
        const idx = Math.floor((p - first.lo) / width);
        buckets[Math.min(buckets.length - 1, Math.max(0, idx))].count++;
    }

    // trim empty tails, but never drop a bucket that absorbed outliers
    let start = 0, end = buckets.length - 1;
    while (start < end && buckets[start].count === 0) start++;
    while (end > start && buckets[end].count === 0) end--;
    return buckets.slice(start, end + 1);
}

/** Unique non-empty values for a field, for the filter dropdowns. */
export const uniqueValues = (sessions, key) =>
    [...new Set(sessions.map((s) => s[key]).filter(Boolean))].sort();

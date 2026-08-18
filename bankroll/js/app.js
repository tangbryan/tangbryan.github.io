/* ============================================================
   app.js — READ-ONLY public view.

   Renders a static data.json. There is deliberately no add / edit / delete,
   no import, and no localStorage write anywhere in this file. The editable
   tracker lives at github.com/tangbryan/poker-bankroll-tracker.
   ============================================================ */

import * as data from './data.js';
import { profitOf, toCSV } from './session.js';
import * as stats from './stats.js';
import {
    cumulativeChart, columnChart, barChart, histogram, sparkline,
    money, pct, signColor, hideTip,
} from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const VIEWS = ['dashboard', 'sessions', 'analytics'];

const state = {
    view: 'dashboard',
    filters: { range: 'all', type: 'all', stakes: 'all', location: 'all', q: '' },
    sort: { key: 'date', dir: -1 },
};

/* ---------------- boot ---------------- */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await data.load();
    } catch (err) {
        showLoadError(err);
        return;
    }

    if (!data.all().length) {
        $('#load-state').innerHTML =
            `<h1>No sessions yet.</h1><p>This tracker has no data published to it yet.</p>`;
        return;
    }

    $('#load-state').classList.add('hidden');
    $('#app-body').classList.remove('hidden');

    const meta = data.getMeta();
    $('#placeholder-banner').classList.toggle('hidden', !meta.placeholder);
    if (meta.updated) {
        $('#updated-stamp').textContent = `Updated ${shortDate(meta.updated.slice(0, 10))}`;
    }

    wireNav();
    wireFilters();
    wireExport();
    wireTableToggles();
});

function showLoadError(err) {
    $('#load-state').innerHTML = `
        <h1>Couldn't load the data.</h1>
        <p>${escapeHTML(err.message)}</p>
        <p class="dim">If you're opening this file directly, serve it over HTTP instead —
        <code>python3 -m http.server</code> — since <code>fetch</code> is blocked on <code>file://</code>.</p>`;
    console.error(err);
}

/* ---------------- navigation ---------------- */

function wireNav() {
    $$('.view-tab').forEach((btn) => {
        btn.addEventListener('click', () => { location.hash = btn.dataset.view; });
    });
    window.addEventListener('hashchange', applyHash);
    applyHash();
}

function applyHash() {
    const want = location.hash.replace('#', '');
    state.view = VIEWS.includes(want) ? want : 'dashboard';
    $$('.view-tab').forEach((b) => {
        const on = b.dataset.view === state.view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
    });
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${state.view}`));
    hideTip();
    render();
}

/* ---------------- filters ---------------- */

function wireFilters() {
    $('#f-range').addEventListener('change', (e) => { state.filters.range = e.target.value; render(); });
    $('#f-type').addEventListener('change', (e) => { state.filters.type = e.target.value; render(); });
    $('#f-stakes').addEventListener('change', (e) => { state.filters.stakes = e.target.value; render(); });
    $('#f-location').addEventListener('change', (e) => { state.filters.location = e.target.value; render(); });

    const q = $('#f-search');
    let t;
    q.addEventListener('input', (e) => {
        clearTimeout(t);
        t = setTimeout(() => { state.filters.q = e.target.value.trim(); render(); }, 160);
    });

    $('#f-reset').addEventListener('click', () => {
        state.filters = { range: 'all', type: 'all', stakes: 'all', location: 'all', q: '' };
        $('#f-range').value = 'all'; $('#f-type').value = 'all';
        $('#f-stakes').value = 'all'; $('#f-location').value = 'all'; $('#f-search').value = '';
        render();
    });

    // populated once — the dataset never changes at runtime
    const fill = (sel, values) => {
        const node = $(sel);
        node.innerHTML = ['all', ...values].map((v) =>
            `<option value="${escapeHTML(v)}">${v === 'all' ? node.dataset.allLabel : escapeHTML(v)}</option>`).join('');
    };
    fill('#f-stakes', stats.uniqueValues(data.all(), 'stakes'));
    fill('#f-location', stats.uniqueValues(data.all(), 'location'));
}

const filtered = () => stats.applyFilters(data.all(), state.filters);

/* ---------------- render ---------------- */

function render() {
    const rows = filtered();
    renderHero(rows);
    if (state.view === 'dashboard') renderDashboard(rows);
    else if (state.view === 'sessions') renderSessions(rows);
    else renderAnalytics(rows);
}

function renderHero(rows) {
    const s = stats.summary(rows);
    const hero = $('#hero-value');
    hero.textContent = money(s.net, { sign: true });
    hero.style.color = signColor(s.net);
    $('#hero-sub').innerHTML = s.n
        ? `across <b>${s.n}</b> sessions · <b>${s.hours.toFixed(0)}</b> hours played`
        : 'no sessions in this range';
    sparkline($('#hero-spark'), stats.cumulative(rows).map((p) => p.value).slice(-40), { width: 160, height: 40 });
}

/* ---------------- dashboard ---------------- */

function renderDashboard(rows) {
    const s = stats.summary(rows);

    tiles($('#dash-tiles'), [
        {
            label: 'Hourly rate', value: `${money(s.hourly, { sign: true })}/hr`, tone: s.hourly,
            meta: s.n > 1
                ? `95% CI ${money(s.hourlyLow, { sign: true })} to ${money(s.hourlyHigh, { sign: true })}`
                : 'need more sessions',
        },
        {
            label: 'Win rate', value: pct(s.winRate, 1),
            meta: `${s.wins}W · ${s.losses}L${s.n - s.wins - s.losses ? ` · ${s.n - s.wins - s.losses}E` : ''}`,
        },
        s.bbPerHr != null
            ? { label: 'Big blinds / hour', value: `${s.bbPerHr >= 0 ? '+' : ''}${s.bbPerHr.toFixed(2)} bb/hr`, tone: s.bbPerHr, meta: 'cash games only' }
            : { label: 'Avg session', value: money(s.avgSession, { sign: true }), tone: s.avgSession, meta: `${s.avgHours.toFixed(1)}h average` },
        { label: 'Best session', value: money(s.best, { sign: true }), tone: 1, meta: 'single-session high' },
        { label: 'Worst session', value: money(s.worst, { sign: true }), tone: -1, meta: 'single-session low' },
        {
            label: 'Max drawdown', value: money(-Math.abs(s.maxDrawdown.amount)), tone: -1,
            meta: s.maxDrawdown.from ? `${shortDate(s.maxDrawdown.from)} → ${shortDate(s.maxDrawdown.to)}` : '—',
        },
    ]);

    const cum = stats.cumulative(rows);
    cumulativeChart($('#chart-cumulative'), cum, { height: 320 });
    tableTwin('#table-cumulative', ['Date', 'Session', 'Running total'],
        cum.slice().reverse().slice(0, 60).map((p) => [
            shortDate(p.date), money(profitOf(p.session), { sign: true }), money(p.value, { sign: true }),
        ]));

    const months = stats.byMonth(rows);
    columnChart($('#chart-monthly'), months.map((m) => ({
        label: stats.monthLabel(m.key), value: m.net,
        meta: `${m.n} session${m.n === 1 ? '' : 's'} · ${m.hours.toFixed(1)}h`,
    })), { height: 260 });
    tableTwin('#table-monthly', ['Month', 'Sessions', 'Hours', 'Profit'],
        months.map((m) => [stats.monthLabel(m.key), m.n, m.hours.toFixed(1), money(m.net, { sign: true })]));

    const dist = stats.distribution(rows);
    histogram($('#chart-dist'), dist, { height: 240 });
    tableTwin('#table-dist', ['Session result', 'Count'],
        dist.map((b) => [
            b.overflow === -1 ? `worse than ${money(b.hi, { sign: true })}`
                : b.overflow === 1 ? `better than ${money(b.lo, { sign: true })}`
                : `${money(b.lo, { sign: true })} to ${money(b.hi, { sign: true })}`,
            b.count,
        ]));
}

function tiles(container, items) {
    container.innerHTML = items.map((t) => `
        <div class="tile">
            <span class="tile-label">${escapeHTML(t.label)}</span>
            <span class="tile-value"${t.tone != null ? ` style="color:${signColor(t.tone)}"` : ''}>${escapeHTML(t.value)}</span>
            ${t.meta ? `<span class="tile-meta">${escapeHTML(t.meta)}</span>` : ''}
        </div>`).join('');
}

/* ---------------- analytics ---------------- */

function renderAnalytics(rows) {
    const s = stats.summary(rows);

    const mk = (groups) => groups
        .filter((g) => g.n > 0).sort((a, b) => b.net - a.net)
        .map((g) => ({
            label: g.key, value: g.net,
            meta: `${g.n} session${g.n === 1 ? '' : 's'} · ${g.hours.toFixed(1)}h · ${money(g.hourly, { sign: true })}/hr · ${pct(g.winRate)} win`,
        }));
    const tbl = (groups) => groups.sort((a, b) => b.net - a.net)
        .map((g) => [g.key, g.n, g.hours.toFixed(1), money(g.hourly, { sign: true }), money(g.net, { sign: true })]);

    barChart($('#chart-stakes'), mk(stats.groupBy(rows, (x) => x.stakes || '—')));
    tableTwin('#table-stakes', ['Stakes', 'Sessions', 'Hours', '$/hr', 'Profit'],
        tbl(stats.groupBy(rows, (x) => x.stakes || '—')));

    barChart($('#chart-location'), mk(stats.groupBy(rows, (x) => x.location || '—')));
    tableTwin('#table-location', ['Venue', 'Sessions', 'Hours', '$/hr', 'Profit'],
        tbl(stats.groupBy(rows, (x) => x.location || '—')));

    const dow = stats.byDayOfWeek(rows);
    columnChart($('#chart-dow'), dow.map((g) => ({
        label: g.key, value: g.net,
        meta: `${g.n} session${g.n === 1 ? '' : 's'} · ${g.hours.toFixed(1)}h`,
    })), { height: 240 });
    tableTwin('#table-dow', ['Day', 'Sessions', 'Hours', '$/hr', 'Profit'],
        dow.map((g) => [g.key, g.n, g.hours.toFixed(1), money(g.hourly, { sign: true }), money(g.net, { sign: true })]));

    const cashS = stats.summary(rows.filter((r) => r.type === 'cash'));
    const mttS = stats.summary(rows.filter((r) => r.type === 'tournament'));
    $('#format-compare').innerHTML = `
        <table class="data-table">
            <thead><tr><th>Metric</th><th>Cash</th><th>Tournament</th></tr></thead>
            <tbody>
                ${fmtRow('Sessions', cashS.n, mttS.n)}
                ${fmtRow('Hours', cashS.hours.toFixed(1), mttS.hours.toFixed(1))}
                ${fmtRow('Net profit', money(cashS.net, { sign: true }), money(mttS.net, { sign: true }), true)}
                ${fmtRow('$ / hour', money(cashS.hourly, { sign: true }), money(mttS.hourly, { sign: true }), true)}
                ${fmtRow('Win / cash rate', pct(cashS.winRate, 1), pct(mttS.winRate, 1))}
                ${fmtRow('ROI', pct(cashS.roi, 1), pct(mttS.roi, 1), true)}
                ${fmtRow('Std deviation', money(cashS.sd), money(mttS.sd))}
            </tbody>
        </table>`;

    const streakTxt = s.streak.count
        ? `${s.streak.count} ${s.streak.dir > 0 ? 'winning' : 'losing'} session${s.streak.count === 1 ? '' : 's'}`
        : '—';
    tiles($('#risk-tiles'), [
        { label: 'Std deviation / session', value: money(s.sd), meta: 'spread of results' },
        { label: 'Current streak', value: streakTxt, tone: s.streak.count ? s.streak.dir : null, meta: 'most recent run' },
        { label: 'Longest win streak', value: `${s.longest.win} sessions`, tone: 1 },
        { label: 'Longest losing streak', value: `${s.longest.loss} sessions`, tone: -1 },
        { label: 'Total invested', value: money(s.invested), meta: 'sum of buy-ins' },
        { label: 'Return on investment', value: pct(s.roi, 1), tone: s.roi, meta: 'profit / buy-ins' },
    ]);

    $('#variance-note').innerHTML = s.n > 1
        ? `Over <b>${s.n}</b> sessions the observed rate is <b style="color:${signColor(s.hourly)}">${money(s.hourly, { sign: true })}/hr</b>.
           Accounting for variance, the 95% confidence interval runs from
           <b>${money(s.hourlyLow, { sign: true })}</b> to <b>${money(s.hourlyHigh, { sign: true })}</b> per hour —
           ${s.hourlyLow > 0
            ? 'the whole interval is above zero, so this is a statistically meaningful win rate.'
            : s.hourlyHigh < 0
                ? 'the whole interval is below zero, which is a genuine losing rate rather than bad luck.'
                : 'the interval still straddles zero, so this sample cannot yet distinguish skill from variance.'}`
        : 'At least two sessions are needed to estimate a confidence interval.';
}

const fmtRow = (label, a, b, tone = false) => `
    <tr><td>${label}</td>
    <td${tone ? ` style="color:${signColor(parseFloat(String(a).replace(/[^0-9.-]/g, '')) || 0)}"` : ''}>${a}</td>
    <td${tone ? ` style="color:${signColor(parseFloat(String(b).replace(/[^0-9.-]/g, '')) || 0)}"` : ''}>${b}</td></tr>`;

/* ---------------- sessions table (read-only) ---------------- */

function renderSessions(rows) {
    const { key, dir } = state.sort;
    const val = (s) => key === 'profit' ? profitOf(s)
        : key === 'hourly' ? (s.hours ? profitOf(s) / s.hours : 0)
        : s[key];
    const sorted = rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        return x === y ? 0 : (x > y ? 1 : -1) * dir;
    });

    const total = data.all().length;
    $('#sessions-count').textContent =
        `${sorted.length} session${sorted.length === 1 ? '' : 's'}${sorted.length !== total ? ` of ${total}` : ''}`;

    const head = [
        ['date', 'Date'], ['type', 'Type'], ['stakes', 'Stakes'], ['location', 'Venue'],
        ['hours', 'Hours'], ['profit', 'Profit'], ['hourly', '$/hr'],
    ];

    $('#sessions-table').innerHTML = `
        <table class="data-table sessions">
            <thead><tr>
                ${head.map(([k, label]) =>
                    `<th class="sortable${key === k ? ' sorted' : ''}" data-sort="${k}">${label}${key === k ? `<span class="caret">${dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}
            </tr></thead>
            <tbody>
                ${sorted.length ? sorted.map((s) => {
                    const p = profitOf(s);
                    return `<tr>
                        <td>${shortDate(s.date)}</td>
                        <td><span class="pill pill-${s.type}">${s.type === 'cash' ? 'Cash' : 'MTT'}</span></td>
                        <td>${escapeHTML(s.stakes || '—')}</td>
                        <td>${escapeHTML(s.location || '—')}</td>
                        <td class="num">${s.hours ? s.hours.toFixed(1) : '—'}</td>
                        <td class="num" style="color:${signColor(p)};font-weight:600">${money(p, { sign: true })}</td>
                        <td class="num">${s.hours ? money(p / s.hours, { sign: true }) : '—'}</td>
                    </tr>`;
                }).join('') : `<tr><td colspan="7" class="empty-row">No sessions match these filters.</td></tr>`}
            </tbody>
        </table>`;

    $$('#sessions-table .sortable').forEach((th) => th.addEventListener('click', () => {
        const k = th.dataset.sort;
        state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
        renderSessions(filtered());
    }));
}

/* ---------------- export (of already-public data) ---------------- */

function wireExport() {
    $('#btn-export-csv').addEventListener('click', () => {
        const csv = toCSV(filtered());
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bankroll-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

function wireTableToggles() {
    $$('.table-toggle').forEach((btn) => btn.addEventListener('click', () => {
        const panel = $(btn.dataset.target);
        const open = panel.classList.toggle('open');
        btn.textContent = open ? 'Hide table' : 'Table view';
        btn.setAttribute('aria-expanded', String(open));
    }));
}

/* ---------------- helpers ---------------- */

function tableTwin(sel, headers, rows) {
    $(sel).innerHTML = `
        <table class="data-table">
            <thead><tr>${headers.map((h) => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHTML(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
}

const shortDate = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

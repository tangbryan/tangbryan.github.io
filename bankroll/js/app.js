/* ============================================================
   app.js — views, filters, forms, tables
   ============================================================ */

import * as store from './store.js';
import { profitOf } from './store.js';
import * as stats from './stats.js';
import {
    cumulativeChart, columnChart, barChart, histogram, sparkline,
    money, pct, signColor, COLORS, hideTip,
} from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
    view: 'dashboard',
    filters: { range: 'all', type: 'all', stakes: 'all', location: 'all', q: '' },
    sort: { key: 'date', dir: -1 },
    editing: null,
};

/* ---------------- boot ---------------- */

store.load();
if (!store.all().length && !localStorage.getItem('bt_bankroll_seen')) {
    // First visit with nothing saved: show the sample history so the charts mean something.
    store.loadDemo();
    localStorage.setItem('bt_bankroll_seen', '1');
}

document.addEventListener('DOMContentLoaded', () => {
    wireNav();
    wireFilters();
    wireForm();
    wireData();
    store.subscribe(render);
    render();
});

/* ---------------- navigation ---------------- */

const VIEWS = ['dashboard', 'sessions', 'analytics'];

function wireNav() {
    $$('.view-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            location.hash = btn.dataset.view;   // routing drives the view
        });
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
}

function refreshFilterOptions() {
    const all = store.all();
    const fill = (sel, values, current) => {
        const node = $(sel);
        const opts = ['all', ...values];
        node.innerHTML = opts.map((v) =>
            `<option value="${escapeAttr(v)}">${v === 'all' ? node.dataset.allLabel : escapeHTML(v)}</option>`).join('');
        node.value = opts.includes(current) ? current : 'all';
        if (node.value !== current) state.filters[node.dataset.key] = node.value;
    };
    fill('#f-stakes', stats.uniqueValues(all, 'stakes'), state.filters.stakes);
    fill('#f-location', stats.uniqueValues(all, 'location'), state.filters.location);
}

const filtered = () => stats.applyFilters(store.all(), state.filters);

/* ---------------- render ---------------- */

function render() {
    refreshFilterOptions();
    const rows = filtered();
    const hasAny = store.all().length > 0;

    $('#empty-state').classList.toggle('hidden', hasAny);
    $('#app-body').classList.toggle('hidden', !hasAny);
    $('#demo-banner').classList.toggle('hidden', !store.getSettings().demo);
    if (!hasAny) return;

    renderHero(rows);   // the hero sits above the tabs, so every view keeps it current

    if (state.view === 'dashboard') renderDashboard(rows);
    else if (state.view === 'sessions') renderSessions(rows);
    else renderAnalytics(rows);
}

/* ---------------- dashboard ---------------- */

function renderHero(rows) {
    const s = stats.summary(rows);
    const hero = $('#hero-value');
    hero.textContent = money(s.net, { sign: true });
    hero.style.color = signColor(s.net);
    $('#hero-sub').innerHTML = s.n
        ? `across <b>${s.n}</b> sessions · <b>${s.hours.toFixed(0)}</b> hours played`
        : 'no sessions in this range';

    const trend = stats.cumulative(rows).map((p) => p.value);
    sparkline($('#hero-spark'), trend.slice(-40), { width: 160, height: 40 });
}

function renderDashboard(rows) {
    const s = stats.summary(rows);

    // stat tiles
    tiles($('#dash-tiles'), [
        {
            label: 'Hourly rate', value: `${money(s.hourly, { sign: true })}/hr`,
            tone: s.hourly,
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

    // charts
    cumulativeChart($('#chart-cumulative'), stats.cumulative(rows), { height: 320 });
    tableTwin('#table-cumulative', ['Date', 'Session', 'Running total'],
        stats.cumulative(rows).slice().reverse().slice(0, 60).map((p) => [
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

    const mk = (groups, sortFn = (a, b) => b.net - a.net) => groups
        .filter((g) => g.n > 0).sort(sortFn)
        .map((g) => ({
            label: g.key, value: g.net,
            meta: `${g.n} session${g.n === 1 ? '' : 's'} · ${g.hours.toFixed(1)}h · ${money(g.hourly, { sign: true })}/hr · ${pct(g.winRate)} win`,
        }));

    const byStakes = mk(stats.groupBy(rows, (x) => x.stakes || '—'));
    barChart($('#chart-stakes'), byStakes);
    tableTwin('#table-stakes', ['Stakes', 'Sessions', 'Hours', '$/hr', 'Profit'],
        stats.groupBy(rows, (x) => x.stakes || '—').sort((a, b) => b.net - a.net)
            .map((g) => [g.key, g.n, g.hours.toFixed(1), money(g.hourly, { sign: true }), money(g.net, { sign: true })]));

    const byLoc = mk(stats.groupBy(rows, (x) => x.location || '—'));
    barChart($('#chart-location'), byLoc);
    tableTwin('#table-location', ['Location', 'Sessions', 'Hours', '$/hr', 'Profit'],
        stats.groupBy(rows, (x) => x.location || '—').sort((a, b) => b.net - a.net)
            .map((g) => [g.key, g.n, g.hours.toFixed(1), money(g.hourly, { sign: true }), money(g.net, { sign: true })]));

    const dow = stats.byDayOfWeek(rows);
    columnChart($('#chart-dow'), dow.map((g) => ({
        label: g.key, value: g.net,
        meta: `${g.n} session${g.n === 1 ? '' : 's'} · ${g.hours.toFixed(1)}h`,
    })), { height: 240 });
    tableTwin('#table-dow', ['Day', 'Sessions', 'Hours', '$/hr', 'Profit'],
        dow.map((g) => [g.key, g.n, g.hours.toFixed(1), money(g.hourly, { sign: true }), money(g.net, { sign: true })]));

    // format-level comparison
    const cash = rows.filter((r) => r.type === 'cash');
    const mtt = rows.filter((r) => r.type === 'tournament');
    const cashS = stats.summary(cash), mttS = stats.summary(mtt);
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

    // risk & consistency
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
        ? `Over <b>${s.n}</b> sessions your observed rate is <b style="color:${signColor(s.hourly)}">${money(s.hourly, { sign: true })}/hr</b>.
           Accounting for variance, the 95% confidence interval runs from
           <b>${money(s.hourlyLow, { sign: true })}</b> to <b>${money(s.hourlyHigh, { sign: true })}</b> per hour —
           ${s.hourlyLow > 0
            ? 'the whole interval is above zero, so this is a statistically meaningful win rate.'
            : s.hourlyHigh < 0
                ? 'the whole interval is below zero, which is a genuine losing rate rather than bad luck.'
                : 'the interval still straddles zero, so this sample cannot yet distinguish skill from variance.'}`
        : 'Log at least two sessions to estimate a confidence interval.';
}

const fmtRow = (label, a, b, tone = false) => `
    <tr><td>${label}</td>
    <td${tone ? ` style="color:${signColor(parseFloat(String(a).replace(/[^0-9.-]/g, '')) || 0)}"` : ''}>${a}</td>
    <td${tone ? ` style="color:${signColor(parseFloat(String(b).replace(/[^0-9.-]/g, '')) || 0)}"` : ''}>${b}</td></tr>`;

/* ---------------- sessions table ---------------- */

function renderSessions(rows) {
    const { key, dir } = state.sort;
    const val = (s) => key === 'profit' ? profitOf(s)
        : key === 'hourly' ? (s.hours ? profitOf(s) / s.hours : 0)
        : s[key];
    const sorted = rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === y) return 0;
        return (x > y ? 1 : -1) * dir;
    });

    $('#sessions-count').textContent =
        `${sorted.length} session${sorted.length === 1 ? '' : 's'}${sorted.length !== store.all().length ? ` of ${store.all().length}` : ''}`;

    const head = [
        ['date', 'Date'], ['type', 'Type'], ['stakes', 'Stakes'], ['location', 'Location'],
        ['hours', 'Hours'], ['profit', 'Profit'], ['hourly', '$/hr'],
    ];

    $('#sessions-table').innerHTML = `
        <table class="data-table sessions">
            <thead><tr>
                ${head.map(([k, label]) =>
                    `<th class="sortable${key === k ? ' sorted' : ''}" data-sort="${k}">${label}${key === k ? `<span class="caret">${dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}
                <th class="col-actions"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
                ${sorted.length ? sorted.map((s) => {
                    const p = profitOf(s);
                    return `<tr data-id="${s.id}">
                        <td>${shortDate(s.date)}</td>
                        <td><span class="pill pill-${s.type}">${s.type === 'cash' ? 'Cash' : 'MTT'}</span></td>
                        <td>${escapeHTML(s.stakes || '—')}</td>
                        <td>${escapeHTML(s.location || '—')}</td>
                        <td class="num">${s.hours ? s.hours.toFixed(1) : '—'}</td>
                        <td class="num" style="color:${signColor(p)};font-weight:600">${money(p, { sign: true })}</td>
                        <td class="num">${s.hours ? money(p / s.hours, { sign: true }) : '—'}</td>
                        <td class="col-actions">
                            <button class="icon-btn" data-act="edit" data-id="${s.id}" title="Edit session" aria-label="Edit session">✎</button>
                            <button class="icon-btn danger" data-act="del" data-id="${s.id}" title="Delete session" aria-label="Delete session">✕</button>
                        </td>
                    </tr>`;
                }).join('') : `<tr><td colspan="8" class="empty-row">No sessions match these filters.</td></tr>`}
            </tbody>
        </table>`;

    $$('#sessions-table .sortable').forEach((th) => th.addEventListener('click', () => {
        const k = th.dataset.sort;
        state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'date' ? -1 : -1) };
        renderSessions(filtered());
    }));

    $$('#sessions-table [data-act]').forEach((btn) => btn.addEventListener('click', () => {
        const s = store.byId(btn.dataset.id);
        if (!s) return;
        if (btn.dataset.act === 'edit') openForm(s);
        else if (confirm(`Delete the ${shortDate(s.date)} session (${money(profitOf(s), { sign: true })})?`)) {
            store.remove(s.id);
        }
    }));
}

/* ---------------- add / edit form ---------------- */

function wireForm() {
    $('#btn-add').addEventListener('click', () => openForm(null));
    $('#btn-add-empty').addEventListener('click', () => openForm(null));
    $('#form-cancel').addEventListener('click', closeForm);
    $('#session-modal').addEventListener('click', (e) => {
        if (e.target.id === 'session-modal') closeForm();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#session-modal').classList.contains('hidden')) closeForm();
    });
    $$('input[name="type"]').forEach((r) => r.addEventListener('change', syncFormType));
    $('#session-form').addEventListener('submit', onSubmit);
}

function syncFormType() {
    const type = $('input[name="type"]:checked').value;
    const isCash = type === 'cash';
    $('#cash-fields').classList.toggle('hidden', !isCash);
    $('#mtt-fields').classList.toggle('hidden', isCash);
    $('#f-stakes-label').textContent = isCash ? 'Stakes (e.g. 1/2)' : 'Event (e.g. $240 MTT)';
    $('#in-stakes').placeholder = isCash ? '1/2' : '$240 MTT';
}

function openForm(session) {
    state.editing = session ? session.id : null;
    const f = $('#session-form');
    f.reset();
    $('#form-title').textContent = session ? 'Edit session' : 'Log a session';
    $('#form-submit').textContent = session ? 'Save changes' : 'Add session';

    const s = session || {
        date: new Date().toISOString().slice(0, 10), type: 'cash',
        game: 'NLH', stakes: '', location: '', hours: '',
    };
    $(`input[name="type"][value="${s.type}"]`).checked = true;
    f.date.value = s.date;
    f.game.value = s.game || 'NLH';
    f.stakes.value = s.stakes || '';
    f.location.value = s.location || '';
    f.hours.value = s.hours || '';
    // cash and tournament keep separate buy-in inputs so the form can hold both
    f.buyIn.value = s.type === 'cash' ? (s.buyIn || '') : '';
    f.mttBuyIn.value = s.type === 'tournament' ? (s.buyIn || '') : '';
    f.cashOut.value = s.cashOut || '';
    f.fee.value = s.fee || '';
    f.prize.value = s.prize || '';
    f.entrants.value = s.entrants || '';
    f.place.value = s.place || '';
    f.notes.value = s.notes || '';
    syncFormType();

    $('#session-modal').classList.remove('hidden');
    setTimeout(() => f.date.focus(), 30);
}

function closeForm() {
    $('#session-modal').classList.add('hidden');
    state.editing = null;
}

function onSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const type = $('input[name="type"]:checked').value;
    const data = {
        date: f.date.value,
        type,
        game: f.game.value,
        stakes: f.stakes.value,
        location: f.location.value,
        hours: f.hours.value,
        buyIn: type === 'tournament' ? f.mttBuyIn.value : f.buyIn.value,
        cashOut: f.cashOut.value,
        fee: f.fee.value,
        prize: f.prize.value,
        entrants: f.entrants.value,
        place: f.place.value,
        notes: f.notes.value,
    };
    if (!data.date) return;
    if (state.editing) store.update(state.editing, data);
    else store.add(data);
    closeForm();
}

/* ---------------- data management ---------------- */

function wireData() {
    $('#btn-export').addEventListener('click', () => {
        download(`bankroll-${todayStr()}.json`, store.exportJSON(), 'application/json');
    });
    $('#btn-export-csv').addEventListener('click', () => {
        download(`bankroll-${todayStr()}.csv`, store.exportCSV(filtered()), 'text/csv');
    });
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const { added, skipped } = store.importJSON(await file.text());
            alert(`Imported ${added} session${added === 1 ? '' : 's'}.${skipped ? ` Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.` : ''}`);
        } catch (err) {
            alert(`Could not import that file: ${err.message}`);
        }
        e.target.value = '';
    });
    $('#btn-demo').addEventListener('click', () => {
        if (store.all().length && !confirm('Replace your current sessions with the sample history?')) return;
        store.loadDemo();
    });
    $('#btn-demo-empty').addEventListener('click', () => store.loadDemo());
    $('#btn-clear').addEventListener('click', () => {
        if (confirm('Delete every saved session? Export first if you want a backup — this cannot be undone.')) {
            store.clearAll();
        }
    });
    $('#banner-clear').addEventListener('click', () => store.clearAll());

    // chart table-view toggles
    $$('.table-toggle').forEach((btn) => btn.addEventListener('click', () => {
        const panel = $(btn.dataset.target);
        const open = panel.classList.toggle('open');
        btn.textContent = open ? 'Hide table' : 'Table view';
        btn.setAttribute('aria-expanded', String(open));
    }));
}

function download(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- small helpers ---------------- */

function tableTwin(sel, headers, rows) {
    $(sel).innerHTML = `
        <table class="data-table">
            <thead><tr>${headers.map((h) => `<th>${escapeHTML(h)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHTML(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
}

const shortDate = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

const todayStr = () => new Date().toISOString().slice(0, 10);

function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHTML;

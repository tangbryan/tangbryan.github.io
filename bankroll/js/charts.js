/* ============================================================
   charts.js — hand-rolled SVG charts.

   Palette and mark specs are validated, not eyeballed:
     win  #22b06b / loss #b33a30  — diverging (polarity), OKLab CVD ΔE 13.8,
       normal-vision ΔE 31.6, both inside the dark lightness band, >= 3:1 on
       the #15151d surface. The conventional green/red pair only clears CVD
       because the two are separated in *lightness*, which deuteranopia keeps.
     series #b169ff #15a7b9 #c58702 #ff2d9c — categorical, fixed order.

   Marks: bars <= 24px with a 4px rounded data-end (square at the baseline),
   2px surface gap between neighbours, 2px lines, >= 8px markers with a 2px
   surface ring, ~10% area washes, solid hairline grid.
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg';

export const COLORS = {
    win: '#22b06b',
    loss: '#b33a30',
    series: ['#b169ff', '#15a7b9', '#c58702', '#ff2d9c'],
    grid: '#242430',
    axis: '#2f2f3d',
    surface: '#15151d',
    muted: '#6b6b7b',
    dim: '#a3a3b2',
};

export const signColor = (v) => (v >= 0 ? COLORS.win : COLORS.loss);

/* ---------------- formatting ---------------- */

export function money(v, { compact = false, sign = false } = {}) {
    const n = Math.abs(v);
    const s = v < 0 ? '-' : sign && v > 0 ? '+' : '';
    if (compact && n >= 1000) {
        const k = n / 1000;
        return `${s}$${k >= 100 ? Math.round(k) : k.toFixed(k >= 10 ? 0 : 1)}k`;
    }
    return `${s}$${Math.round(n).toLocaleString()}`;
}

export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

const fmtDate = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/* ---------------- tiny SVG helpers ---------------- */

const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) {
        if (v != null) n.setAttribute(k, v);
    }
    return n;
};

const text = (str, attrs) => {
    const t = el('text', attrs);
    t.textContent = str;
    return t;
};

/** Accessible name for a chart. Must be an SVG <title>, not a visually-hidden
 *  <text> — CSS positioning doesn't apply inside SVG, so a styled <text> paints
 *  a stray glyph in the corner instead of hiding. */
const titled = (svg, label) => {
    const t = el('title');
    t.textContent = label;
    svg.appendChild(t);
    svg.setAttribute('aria-label', label);
    return svg;
};

/** "Nice" axis ticks around a domain that always includes zero. */
function niceTicks(min, max, count = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
}

/** A rect whose *data end* is rounded and whose baseline end stays square. */
function barPath(x, y, w, h, r, dir) {
    const rad = Math.max(0, Math.min(r, w / 2, h));
    if (h <= 0.5) return `M${x} ${y}h${w}`;
    switch (dir) {
        case 'up':    return `M${x} ${y + h}V${y + rad}a${rad} ${rad} 0 0 1 ${rad} ${-rad}h${w - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}V${y + h}Z`;
        case 'down':  return `M${x} ${y}V${y + h - rad}a${rad} ${rad} 0 0 0 ${rad} ${rad}h${w - 2 * rad}a${rad} ${rad} 0 0 0 ${rad} ${-rad}V${y}Z`;
        case 'right': return `M${x} ${y}h${w - rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${h - 2 * rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}h${-(w - rad)}Z`;
        case 'left':  return `M${x + w} ${y}h${-(w - rad)}a${rad} ${rad} 0 0 0 ${-rad} ${rad}v${h - 2 * rad}a${rad} ${rad} 0 0 0 ${rad} ${rad}h${w - rad}Z`;
    }
}

/* ---------------- shared tooltip ---------------- */

let tipEl = null;
function tooltip() {
    if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'chart-tip';
        tipEl.setAttribute('role', 'status');
        document.body.appendChild(tipEl);
    }
    return tipEl;
}

function showTip(html, evt) {
    const t = tooltip();
    t.innerHTML = html;
    t.classList.add('visible');
    const pad = 14;
    const r = t.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY - r.height - pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y < 8) y = evt.clientY + pad;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
}
export function hideTip() { if (tipEl) tipEl.classList.remove('visible'); }

/** Re-render a chart when its container resizes. */
function responsive(container, draw) {
    const run = () => {
        const w = container.clientWidth;
        if (w > 0) draw(w);
    };
    run();
    if (container._ro) container._ro.disconnect();
    container._ro = new ResizeObserver(() => run());
    container._ro.observe(container);
}

function emptyState(container, msg) {
    container.innerHTML = `<div class="chart-empty">${msg}</div>`;
}

/* ============================================================
   Cumulative profit — line + polarity-washed area, zero baseline
   ============================================================ */

export function cumulativeChart(container, points, opts = {}) {
    if (!points.length) return emptyState(container, 'No sessions in this range yet.');

    responsive(container, (width) => {
        const H = opts.height || 320;
        const m = { top: 16, right: 58, bottom: 30, left: 8 };
        const iw = Math.max(40, width - m.left - m.right);
        const ih = H - m.top - m.bottom;

        const values = points.map((p) => p.value);
        const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 5);
        const yMin = ticks[0], yMax = ticks[ticks.length - 1];
        const x = (i) => m.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
        const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
        const y0 = y(0);

        container.innerHTML = '';
        const svg = titled(
            el('svg', { viewBox: `0 0 ${width} ${H}`, width: '100%', height: H, role: 'img' }),
            opts.title || 'Cumulative profit over time'
        );

        // gridlines + right-hand value axis
        for (const t of ticks) {
            svg.appendChild(el('line', {
                x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t),
                stroke: t === 0 ? COLORS.axis : COLORS.grid, 'stroke-width': 1,
            }));
            svg.appendChild(text(money(t, { compact: true }), {
                x: m.left + iw + 8, y: y(t) + 4, class: 'axis-label', 'text-anchor': 'start',
            }));
        }

        // area wash split at zero, so the sign reads even before the line does
        const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.value)}`).join('');
        const areaId = `clip-${Math.random().toString(36).slice(2)}`;
        const defs = el('defs');
        const clipPos = el('clipPath', { id: `${areaId}-p` });
        clipPos.appendChild(el('rect', { x: 0, y: m.top, width, height: Math.max(0, y0 - m.top) }));
        const clipNeg = el('clipPath', { id: `${areaId}-n` });
        clipNeg.appendChild(el('rect', { x: 0, y: y0, width, height: Math.max(0, m.top + ih - y0) }));
        defs.append(clipPos, clipNeg);
        svg.appendChild(defs);

        const areaD = `${line}L${x(points.length - 1)} ${y0}L${x(0)} ${y0}Z`;
        svg.appendChild(el('path', { d: areaD, fill: COLORS.win, opacity: 0.1, 'clip-path': `url(#${areaId}-p)` }));
        svg.appendChild(el('path', { d: areaD, fill: COLORS.loss, opacity: 0.1, 'clip-path': `url(#${areaId}-n)` }));

        // the line itself, coloured by where it ends up
        const last = points[points.length - 1].value;
        svg.appendChild(el('path', {
            d: line, fill: 'none', stroke: signColor(last), 'stroke-width': 2,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        }));

        // x-axis: a few evenly spaced dates
        const xTickCount = Math.max(2, Math.min(6, Math.floor(iw / 90)));
        for (let i = 0; i < xTickCount; i++) {
            const idx = Math.round((i / (xTickCount - 1)) * (points.length - 1));
            const d = new Date(points[idx].date + 'T12:00:00');
            svg.appendChild(text(d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), {
                x: x(idx), y: H - 10, class: 'axis-label',
                'text-anchor': i === 0 ? 'start' : i === xTickCount - 1 ? 'end' : 'middle',
            }));
        }

        // end marker with a surface ring + a single direct label (the endpoint)
        const ex = x(points.length - 1), ey = y(last);
        svg.appendChild(el('circle', { cx: ex, cy: ey, r: 5, fill: signColor(last), stroke: COLORS.surface, 'stroke-width': 2 }));

        // crosshair layer
        const cross = el('line', { y1: m.top, y2: m.top + ih, stroke: COLORS.axis, 'stroke-width': 1, opacity: 0 });
        const dot = el('circle', { r: 4.5, fill: signColor(last), stroke: COLORS.surface, 'stroke-width': 2, opacity: 0 });
        svg.append(cross, dot);

        const hit = el('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
        hit.addEventListener('pointermove', (evt) => {
            const box = svg.getBoundingClientRect();
            const px = ((evt.clientX - box.left) / box.width) * width;
            const i = Math.max(0, Math.min(points.length - 1,
                Math.round(((px - m.left) / iw) * (points.length - 1))));
            const p = points[i];
            cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
            dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.value));
            dot.setAttribute('fill', signColor(p.value)); dot.setAttribute('opacity', 1);
            const s = p.session;
            const sp = s ? (s.type === 'tournament' ? (+s.prize || 0) - ((+s.buyIn || 0) + (+s.fee || 0)) : (+s.cashOut || 0) - (+s.buyIn || 0)) : 0;
            showTip(
                `<strong>${fmtDate(p.date)}</strong>
                 <span class="tip-row"><span>Session</span><b style="color:${signColor(sp)}">${money(sp, { sign: true })}</b></span>
                 <span class="tip-row"><span>Running total</span><b>${money(p.value, { sign: true })}</b></span>
                 ${s ? `<span class="tip-meta">${s.stakes || s.game} · ${s.location || '—'} · ${s.hours}h</span>` : ''}`,
                evt
            );
        });
        hit.addEventListener('pointerleave', () => {
            cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip();
        });
        svg.appendChild(hit);
        container.appendChild(svg);
    });
}

/* ============================================================
   Columns — profit per period, diverging around a zero baseline
   ============================================================ */

export function columnChart(container, rows, opts = {}) {
    if (!rows.length) return emptyState(container, 'No data in this range yet.');

    responsive(container, (width) => {
        const H = opts.height || 260;
        const m = { top: 18, right: 54, bottom: 34, left: 8 };
        const iw = Math.max(40, width - m.left - m.right);
        const ih = H - m.top - m.bottom;

        const values = rows.map((r) => r.value);
        const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
        const yMin = ticks[0], yMax = ticks[ticks.length - 1];
        const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
        const y0 = y(0);

        const band = iw / rows.length;
        const GAP = 2;                                   // the surface gap
        const bw = Math.min(24, Math.max(3, band - GAP));

        container.innerHTML = '';
        const svg = titled(
            el('svg', { viewBox: `0 0 ${width} ${H}`, width: '100%', height: H, role: 'img' }),
            opts.title || 'Profit by period'
        );

        for (const t of ticks) {
            svg.appendChild(el('line', {
                x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t),
                stroke: t === 0 ? COLORS.axis : COLORS.grid, 'stroke-width': 1,
            }));
            svg.appendChild(text(money(t, { compact: true }), {
                x: m.left + iw + 8, y: y(t) + 4, class: 'axis-label', 'text-anchor': 'start',
            }));
        }

        rows.forEach((r, i) => {
            const cx = m.left + i * band + band / 2;
            const x = cx - bw / 2;
            const h = Math.abs(y(r.value) - y0);
            const top = r.value >= 0 ? y(r.value) : y0;
            const g = el('g');
            g.appendChild(el('path', {
                d: barPath(x, top, bw, h, 4, r.value >= 0 ? 'up' : 'down'),
                fill: signColor(r.value),
            }));
            // generous hit target, independent of how thin the bar is
            const hit = el('rect', { x: cx - band / 2, y: m.top, width: band, height: ih, fill: 'transparent' });
            hit.addEventListener('pointerenter', (e) => showTip(
                `<strong>${r.label}</strong>
                 <span class="tip-row"><span>Profit</span><b style="color:${signColor(r.value)}">${money(r.value, { sign: true })}</b></span>
                 ${r.meta ? `<span class="tip-meta">${r.meta}</span>` : ''}`, e));
            hit.addEventListener('pointermove', (e) => showTip(tooltip().innerHTML, e));
            hit.addEventListener('pointerleave', hideTip);
            g.appendChild(hit);
            svg.appendChild(g);
        });

        // label every nth column so text never collides
        const every = Math.ceil(rows.length / Math.max(2, Math.floor(iw / 54)));
        rows.forEach((r, i) => {
            if (i % every) return;
            svg.appendChild(text(r.label, {
                x: m.left + i * band + band / 2, y: H - 12, class: 'axis-label', 'text-anchor': 'middle',
            }));
        });

        container.appendChild(svg);
    });
}

/* ============================================================
   Horizontal bars — one row per category, diverging around zero
   ============================================================ */

export function barChart(container, rows, opts = {}) {
    if (!rows.length) return emptyState(container, 'No data in this range yet.');

    responsive(container, (width) => {
        const rowH = 34;
        const m = { top: 8, right: 8, bottom: 22, left: Math.min(110, Math.max(64, width * 0.26)) };
        const H = m.top + rows.length * rowH + m.bottom;
        const iw = Math.max(40, width - m.left - m.right);

        const values = rows.map((r) => r.value);
        const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
        const xMin = ticks[0], xMax = ticks[ticks.length - 1];
        const x = (v) => m.left + ((v - xMin) / (xMax - xMin || 1)) * iw;
        const x0 = x(0);
        const bh = Math.min(24, rowH - 12);

        container.innerHTML = '';
        const svg = titled(
            el('svg', { viewBox: `0 0 ${width} ${H}`, width: '100%', height: H, role: 'img' }),
            opts.title || 'Profit by category'
        );

        ticks.forEach((t, ti) => {
            svg.appendChild(el('line', {
                x1: x(t), x2: x(t), y1: m.top, y2: m.top + rows.length * rowH,
                stroke: t === 0 ? COLORS.axis : COLORS.grid, 'stroke-width': 1,
            }));
            // edge ticks anchor inward so they can't overflow the plot
            svg.appendChild(text(money(t, { compact: true }), {
                x: x(t), y: H - 6, class: 'axis-label',
                'text-anchor': ti === 0 ? 'start' : ti === ticks.length - 1 ? 'end' : 'middle',
            }));
        });

        rows.forEach((r, i) => {
            const cy = m.top + i * rowH + rowH / 2;
            const w = Math.abs(x(r.value) - x0);
            const bx = r.value >= 0 ? x0 : x(r.value);
            const g = el('g');
            g.appendChild(el('path', {
                d: barPath(bx, cy - bh / 2, Math.max(w, 1.5), bh, 4, r.value >= 0 ? 'right' : 'left'),
                fill: signColor(r.value),
            }));
            const label = text(r.label, {
                x: m.left - 12, y: cy + 4, class: 'axis-label bar-cat', 'text-anchor': 'end',
            });
            g.appendChild(label);
            const hit = el('rect', { x: 0, y: cy - rowH / 2, width, height: rowH, fill: 'transparent' });
            hit.addEventListener('pointerenter', (e) => showTip(
                `<strong>${r.label}</strong>
                 <span class="tip-row"><span>Profit</span><b style="color:${signColor(r.value)}">${money(r.value, { sign: true })}</b></span>
                 ${r.meta ? `<span class="tip-meta">${r.meta}</span>` : ''}`, e));
            hit.addEventListener('pointermove', (e) => showTip(tooltip().innerHTML, e));
            hit.addEventListener('pointerleave', hideTip);
            g.appendChild(hit);
            svg.appendChild(g);
        });

        container.appendChild(svg);

        // Measure once mounted: a category name wider than the gutter gets
        // ellipsised rather than clipped. The full name stays in the tooltip
        // and the table view, so nothing is lost.
        const maxLabel = m.left - 18;
        for (const label of svg.querySelectorAll('.bar-cat')) {
            const full = label.textContent;
            if (label.getComputedTextLength() <= maxLabel) continue;
            let lo = 1, hi = full.length;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                label.textContent = full.slice(0, mid) + '…';
                if (label.getComputedTextLength() <= maxLabel) lo = mid; else hi = mid - 1;
            }
            label.textContent = full.slice(0, lo) + '…';
        }
    });
}

/* ============================================================
   Histogram — session outcomes, coloured by which side of zero
   ============================================================ */

export function histogram(container, buckets, opts = {}) {
    if (!buckets.length) return emptyState(container, 'No sessions in this range yet.');

    responsive(container, (width) => {
        const H = opts.height || 240;
        const m = { top: 16, right: 34, bottom: 34, left: 8 };
        const iw = Math.max(40, width - m.left - m.right);
        const ih = H - m.top - m.bottom;

        const maxCount = Math.max(...buckets.map((b) => b.count), 1);
        const ticks = niceTicks(0, maxCount, 3);
        const yMax = ticks[ticks.length - 1];
        const y = (v) => m.top + ih - (v / (yMax || 1)) * ih;

        const band = iw / buckets.length;
        const bw = Math.min(24, Math.max(3, band - 2));   // cap: never a fat block

        container.innerHTML = '';
        const svg = titled(
            el('svg', { viewBox: `0 0 ${width} ${H}`, width: '100%', height: H, role: 'img' }),
            opts.title || 'Distribution of session results'
        );

        for (const t of ticks) {
            svg.appendChild(el('line', {
                x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t), stroke: COLORS.grid, 'stroke-width': 1,
            }));
            svg.appendChild(text(String(t), {
                x: m.left + iw + 8, y: y(t) + 4, class: 'axis-label', 'text-anchor': 'start',
            }));
        }

        buckets.forEach((b, i) => {
            const x = m.left + i * band + (band - bw) / 2;
            const h = ih - (y(b.count) - m.top);
            const g = el('g');
            if (b.count > 0) {
                g.appendChild(el('path', {
                    d: barPath(x, y(b.count), bw, h, 4, 'up'),
                    fill: b.lo >= 0 ? COLORS.win : COLORS.loss,
                }));
            }
            const hit = el('rect', { x: m.left + i * band, y: m.top, width: band, height: ih, fill: 'transparent' });
            const range = b.overflow === -1 ? `worse than ${money(b.hi, { sign: true })}`
                : b.overflow === 1 ? `better than ${money(b.lo, { sign: true })}`
                : `${money(b.lo, { sign: true })} to ${money(b.hi, { sign: true })}`;
            hit.addEventListener('pointerenter', (e) => showTip(
                `<strong>${range}</strong>
                 <span class="tip-row"><span>Sessions</span><b>${b.count}</b></span>`, e));
            hit.addEventListener('pointermove', (e) => showTip(tooltip().innerHTML, e));
            hit.addEventListener('pointerleave', hideTip);
            g.appendChild(hit);
            svg.appendChild(g);
        });

        // only label the zero crossing and the two ends — never every bar.
        // The end labels anchor inward so they can't be clipped by the plot edge.
        const zeroIdx = buckets.findIndex((b) => b.lo >= 0);
        const marks = [
            { i: 0, v: buckets[0].lo, anchor: 'start' },
            ...(zeroIdx > 0 ? [{ i: zeroIdx, v: 0, anchor: 'middle' }] : []),
            { i: buckets.length, v: buckets[buckets.length - 1].hi, anchor: 'end' },
        ];
        for (const mk of marks) {
            svg.appendChild(text(money(mk.v, { compact: true, sign: true }), {
                x: m.left + mk.i * band, y: H - 12, class: 'axis-label', 'text-anchor': mk.anchor,
            }));
        }

        container.appendChild(svg);
    });
}

/* ============================================================
   Sparkline — 12-point trend for a stat tile (no axes, no tooltip)
   ============================================================ */

export function sparkline(container, values, opts = {}) {
    const w = opts.width || 120, h = opts.height || 32;
    container.innerHTML = '';
    if (values.length < 2) return;
    const min = Math.min(...values), max = Math.max(...values);
    const x = (i) => (i / (values.length - 1)) * w;
    const y = (v) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' });
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join('');
    const last = values[values.length - 1];
    svg.appendChild(el('path', { d, fill: 'none', stroke: signColor(last), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    svg.appendChild(el('circle', { cx: x(values.length - 1), cy: y(last), r: 2.5, fill: signColor(last) }));
    container.appendChild(svg);
}

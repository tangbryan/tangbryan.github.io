/* ============================================================
   chart.js — the running-score chart. Hand-rolled SVG, three series, one per
   seat, with a crosshair that reads out the table after any round.

   Series colour is the seat colour, but the crosshair readout also names each
   player, so a reader who cannot separate the lines still gets the numbers.
   ============================================================ */

import { runningScores } from './scoring.js';
import { signed } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, props = {}, children = []) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(props).forEach(([k, v]) => { if (v != null && v !== false) n.setAttribute(k, v === true ? '' : String(v)); });
    (Array.isArray(children) ? children : [children]).filter((c) => c != null).forEach((c) => n.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return n;
};

const W = 720, H = 260;
const PAD = { top: 18, right: 58, bottom: 30, left: 46 };

export function renderChart(container, { match, players }) {
    const series = runningScores(match.rounds || [], match.playerIds, match.rules);
    container.replaceChildren();

    if (series.length < 2) {
        container.append(Object.assign(document.createElement('p'), {
            className: 'empty small', textContent: 'The chart appears once the first round is recorded.',
        }));
        return;
    }

    const values = series.flatMap((pt) => Object.values(pt.byId));
    let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    if (lo === hi) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.12;
    lo -= padY; hi += padY;

    const iw = W - PAD.left - PAD.right, ih = H - PAD.top - PAD.bottom;
    const X = (i) => PAD.left + (i / (series.length - 1)) * iw;
    const Y = (v) => PAD.top + ih - ((v - lo) / (hi - lo)) * ih;

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dd-chart', role: 'img',
        'aria-label': `Running score over ${series.length - 1} rounds.` });

    // horizontal guides, with zero drawn solid because crossing it is the
    // only line on this chart that means something
    const ticks = niceTicks(lo, hi, 4);
    ticks.forEach((t) => {
        svg.append(s('line', { x1: PAD.left, x2: W - PAD.right, y1: Y(t), y2: Y(t),
            class: t === 0 ? 'dd-axis-zero' : 'dd-grid' }));
        svg.append(s('text', { x: PAD.left - 9, y: Y(t) + 4, 'text-anchor': 'end', class: 'dd-tick' }, signed(t)));
    });

    players.forEach((p) => {
        const pts = series.map((pt, i) => `${X(i)},${Y(pt.byId[p.id])}`).join(' ');
        svg.append(s('polyline', { points: pts, fill: 'none', class: 'dd-series',
            stroke: p.color, 'stroke-width': 2.25, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = series.at(-1).byId[p.id];
        svg.append(s('circle', { cx: X(series.length - 1), cy: Y(last), r: 3.5, fill: p.color }));
        // Label the end of each line so the legend is the chart itself.
        svg.append(s('text', { x: W - PAD.right + 8, y: Y(last) + 4, class: 'dd-series-label', fill: p.color }, signed(last)));
    });

    // round numbers along the bottom, thinned so they never collide
    const step = Math.max(1, Math.ceil((series.length - 1) / 10));
    for (let i = 0; i < series.length; i += step) {
        svg.append(s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'dd-tick' }, String(i)));
    }

    /* crosshair */
    const hair = s('g', { class: 'dd-hair', opacity: 0 });
    const hairLine = s('line', { y1: PAD.top, y2: PAD.top + ih, class: 'dd-hair-line' });
    hair.append(hairLine);
    const dots = players.map((p) => s('circle', { r: 4.5, fill: p.color, stroke: '#0b0b0f', 'stroke-width': 1.5 }));
    dots.forEach((d) => hair.append(d));
    svg.append(hair);

    const readout = document.createElement('div');
    readout.className = 'dd-readout';
    const wrap = document.createElement('div');
    wrap.className = 'dd-chart-wrap';
    wrap.append(svg, readout);
    container.append(wrap);

    const move = (evt) => {
        const box = svg.getBoundingClientRect();
        const cx = evt.touches ? evt.touches[0].clientX : evt.clientX;
        const rel = ((cx - box.left) / box.width) * W;
        const i = Math.max(0, Math.min(series.length - 1, Math.round(((rel - PAD.left) / iw) * (series.length - 1))));
        hair.setAttribute('opacity', 1);
        hairLine.setAttribute('x1', X(i));
        hairLine.setAttribute('x2', X(i));
        players.forEach((p, k) => {
            dots[k].setAttribute('cx', X(i));
            dots[k].setAttribute('cy', Y(series[i].byId[p.id]));
        });
        readout.replaceChildren(
            Object.assign(document.createElement('span'), { className: 'dd-readout-round', textContent: i === 0 ? 'Start' : `Round ${i}` }),
            ...players.map((p) => {
                const el = document.createElement('span');
                el.className = 'dd-readout-item';
                el.style.setProperty('--c', p.color);
                el.textContent = `${p.name} ${signed(series[i].byId[p.id])}`;
                return el;
            }),
        );
    };
    const leave = () => { hair.setAttribute('opacity', 0); readout.replaceChildren(); };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('touchmove', move, { passive: true });
}

/** Ticks on round numbers, and always including zero — the line that matters. */
function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) || mag * 10;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(Math.round(t * 100) / 100);
    if (!out.includes(0) && lo <= 0 && hi >= 0) out.push(0);
    return out.sort((a, b) => a - b);
}

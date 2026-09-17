/* ============================================================
   chart.js — the running-score chart.

   One line per seat, drawn as inline SVG. Four series, so a legend is always
   present and every line is also labelled directly at its end: seat identity
   is carried by the wind glyph and the player's name, never by colour alone.

   A crosshair reads out every seat's score at the hovered hand, because the
   question a player actually asks of this chart is "where was I after hand
   six", not "what shape is the orange line".
   ============================================================ */

import { el } from './dom.js';
import { seatColor, SEAT_WIND_GLYPH } from './store.js';
import { runningScores } from './stats.js';
import { signed } from './stats.js';

const PAD = { top: 18, right: 62, bottom: 28, left: 44 };

export function scoreChart(session, names) {
    const series = runningScores(session);
    const hands = (session.hands ?? []).length;

    if (hands === 0) {
        return el('div', { class: 'chart-empty' },
            'The chart appears once the first hand is recorded.');
    }

    const W = 720;
    const H = 260;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const all = series.flat();
    let lo = Math.min(...all, 0);
    let hi = Math.max(...all, 0);
    if (lo === hi) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.12;
    lo -= padY; hi += padY;

    const x = (i) => PAD.left + (hands === 0 ? 0 : (i / hands) * innerW);
    const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    const ticks = niceTicks(lo, hi, 4);

    const svg = svgEl('svg', {
        viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img',
        'aria-label': `Running score over ${hands} hands`,
    });

    // Grid and the zero line, which is the only one that means anything.
    for (const t of ticks) {
        svg.append(svgEl('line', {
            x1: PAD.left, x2: W - PAD.right, y1: y(t), y2: y(t),
            class: t === 0 ? 'chart-zero' : 'chart-grid',
        }));
        svg.append(svgEl('text', {
            x: PAD.left - 8, y: y(t) + 4, class: 'chart-tick', 'text-anchor': 'end',
        }, String(t)));
    }

    svg.append(svgEl('text', {
        x: PAD.left, y: H - 8, class: 'chart-tick',
    }, 'start'));
    // With a single hand played, both ends would read "hand 1".
    if (hands > 1) {
        svg.append(svgEl('text', {
            x: W - PAD.right, y: H - 8, class: 'chart-tick', 'text-anchor': 'end',
        }, `hand ${hands}`));
    }

    series.forEach((vals, seat) => {
        const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        svg.append(svgEl('path', { d, class: 'chart-line', stroke: seatColor(seat), fill: 'none' }));
        const last = vals[vals.length - 1];
        svg.append(svgEl('circle', {
            cx: x(vals.length - 1), cy: y(last), r: 4.5,
            fill: seatColor(seat), class: 'chart-dot',
        }));
    });

    /*
     * Direct labels, nudged apart. Seats tie constantly — everyone starts at
     * zero and two players level on the night is the normal case — and a label
     * hidden underneath another one is the same as no label, which would leave
     * that line identified by colour alone.
     */
    const MIN_GAP = 13;
    const labels = series
        .map((vals, seat) => ({ seat, value: vals[vals.length - 1], y: y(vals[vals.length - 1]) }))
        .sort((a, b) => a.y - b.y);
    labels.forEach((lab, i) => {
        if (i > 0) lab.y = Math.max(lab.y, labels[i - 1].y + MIN_GAP);
    });
    // Push back up if the stack overflowed the plot.
    const overflow = labels[labels.length - 1].y - (PAD.top + innerH);
    if (overflow > 0) labels.forEach((lab) => { lab.y -= overflow; });

    labels.forEach((lab) => {
        svg.append(svgEl('text', {
            x: W - PAD.right + 8, y: lab.y + 4, class: 'chart-label', fill: seatColor(lab.seat),
        }, `${SEAT_WIND_GLYPH[lab.seat]} ${signed(lab.value)}`));
    });

    const crosshair = svgEl('line', { class: 'chart-cross', y1: PAD.top, y2: PAD.top + innerH });
    crosshair.style.opacity = '0';
    svg.append(crosshair);

    const readout = el('div', { class: 'chart-readout' });
    const hit = svgEl('rect', {
        x: PAD.left, y: PAD.top, width: innerW, height: innerH,
        fill: 'transparent', class: 'chart-hit',
    });
    svg.append(hit);

    const move = (ev) => {
        const box = svg.getBoundingClientRect();
        const px = ((ev.clientX - box.left) / box.width) * W;
        const i = Math.max(0, Math.min(hands, Math.round(((px - PAD.left) / innerW) * hands)));
        crosshair.setAttribute('x1', x(i));
        crosshair.setAttribute('x2', x(i));
        crosshair.style.opacity = '1';
        readout.innerHTML = '';
        readout.append(el('span', { class: 'chart-readout-hand', text: i === 0 ? 'start' : `hand ${i}` }));
        series.forEach((vals, seat) => {
            readout.append(el('span', { class: 'chart-readout-seat' },
                el('i', { style: { background: seatColor(seat) } }),
                `${names[seat] ?? SEAT_WIND_GLYPH[seat]} ${signed(vals[i])}`));
        });
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => {
        crosshair.style.opacity = '0';
        readout.innerHTML = '';
    });

    return el('div', { class: 'chart-wrap' }, svg, readout);
}

function svgEl(tag, attrs = {}, text = null) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
}

function niceTicks(lo, hi, count) {
    const span = hi - lo;
    const raw = span / count;
    const mag = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
        out.push(Math.round(t * 100) / 100);
    }
    if (!out.includes(0) && lo < 0 && hi > 0) out.push(0);
    return out.sort((a, b) => a - b);
}

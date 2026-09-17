/* ============================================================
   render.js — tile faces, drawn.

   Tiles are inline SVG. Not the Unicode mahjong block (U+1F000), which renders
   as a different typeface on every platform, cannot be coloured, and collapses
   to an illegible smudge at the sizes a drill needs; not images, which would
   mean a build step and a network round trip for the one thing this app cannot
   afford to get wrong.

   Recognition is the documented wall for beginners. Everything here exists to
   make a tile unmistakable at a glance and still correct up close: real
   arrangements for the dots and bamboo, real glyphs for honours, the bird on
   1s, and the traditional ink colours.

   Colours come from CSS custom properties, so the tiles follow the theme and
   a single palette edit moves every face at once.
   ============================================================ */

import { suitOf, rankOf, isHonor, tileName, honorGlyph, isBonus } from './tiles.js';

const W = 60;
const H = 84;

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/* ---------------- tile body ---------------- */

/* A real tile is bone laid into bamboo: a bright face, a recessed panel where
   the design is carved, and a darker edge where the light does not reach. */
function body() {
    return `
    <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="7.5"
          fill="var(--tile-edge)"/>
    <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 4.5}" rx="7.5"
          fill="var(--tile-face)" stroke="var(--tile-line)" stroke-width="0.75"/>
    <rect x="4" y="3.5" width="${W - 8}" height="${H - 12}" rx="4.5"
          fill="var(--tile-inset)"/>`;
}

/* ---------------- dots (筒) ---------------- */

/* Concentric rings, the way a real dot tile is carved. The colour pattern is
   traditional: ones and nines lean red, the middle of a five is red, and the
   rest alternate ink and jade so a player can tell 4 from 6 by colour before
   they have learned to count them by shape. */
function dot(cx, cy, fill, r = 5.4) {
    return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="var(--tile-inset)"/>`;
}

const DOT_LAYOUT = {
    1: [[30, 42]],
    2: [[30, 27], [30, 57]],
    3: [[17, 25], [30, 42], [43, 59]],
    4: [[20, 28], [40, 28], [20, 56], [40, 56]],
    5: [[19, 26], [41, 26], [30, 42], [19, 58], [41, 58]],
    6: [[20, 24], [40, 24], [20, 42], [40, 42], [20, 60], [40, 60]],
    7: [[17, 22], [30, 29], [43, 36], [20, 54], [40, 54], [20, 68], [40, 68]],
    8: [[20, 20], [40, 20], [20, 35], [40, 35], [20, 50], [40, 50], [20, 65], [40, 65]],
    9: [[18, 24], [30, 24], [42, 24], [18, 42], [30, 42], [42, 42], [18, 60], [30, 60], [42, 60]],
};

const DOT_COLORS = {
    1: ['red'],
    2: ['jade', 'ink'],
    3: ['ink', 'jade', 'red'],
    4: ['jade', 'ink', 'ink', 'jade'],
    5: ['ink', 'jade', 'red', 'jade', 'ink'],
    6: ['jade', 'jade', 'red', 'red', 'jade', 'jade'],
    7: ['jade', 'jade', 'jade', 'red', 'red', 'red', 'red'],
    8: ['ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink'],
    9: ['red', 'red', 'red', 'jade', 'jade', 'jade', 'ink', 'ink', 'ink'],
};

const INK = { red: 'var(--cinnabar)', jade: 'var(--jade)', ink: 'var(--ink)' };

function dotsFace(n) {
    const pts = DOT_LAYOUT[n];
    const cols = DOT_COLORS[n];
    // The single dot is carved large and ornate on a real tile; shrinking it to
    // match the others makes the most distinctive face in the suit forgettable.
    if (n === 1) {
        return `
        <circle cx="30" cy="42" r="14" fill="var(--cinnabar)"/>
        <circle cx="30" cy="42" r="10" fill="var(--tile-inset)"/>
        <circle cx="30" cy="42" r="7" fill="var(--ink)"/>
        <circle cx="30" cy="42" r="3.4" fill="var(--tile-inset)"/>`;
    }
    const r = n >= 8 ? 4.6 : n >= 6 ? 5 : 5.4;
    return pts.map((p, i) => dot(p[0], p[1], INK[cols[i]], r)).join('');
}

/* ---------------- bamboo (索) ---------------- */

/*
 * One node, not two. A stalk is only about six units wide on this face, and
 * cutting it twice leaves three fragments that read as a dashed line rather
 * than as bamboo — which matters most on the high-count tiles, where the
 * player is trying to count stalks at a glance.
 */
function stalk(cx, cy, color, h = 15) {
    const w = 6;
    const top = cy - h / 2;
    return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="2.6" fill="${color}"/>
    <rect x="${cx - w / 2}" y="${top + h * 0.46}" width="${w}" height="${Math.max(1, h * 0.09)}"
          fill="var(--tile-inset)"/>
    <rect x="${cx - w / 2 - 1.2}" y="${top + h * 0.42}" width="${w + 2.4}" height="${Math.max(1.4, h * 0.1)}"
          rx="0.6" fill="${color}"/>`;
}

const BAM_LAYOUT = {
    2: [[30, 28], [30, 56]],
    3: [[30, 24], [21, 56], [39, 56]],
    4: [[20, 28], [40, 28], [20, 56], [40, 56]],
    5: [[19, 25], [41, 25], [30, 42], [19, 59], [41, 59]],
    6: [[20, 24], [40, 24], [20, 42], [40, 42], [20, 60], [40, 60]],
    7: [[30, 20], [20, 40], [40, 40], [20, 56], [40, 56], [20, 70], [40, 70]],
    8: [[20, 20], [40, 20], [20, 36], [40, 36], [20, 52], [40, 52], [20, 68], [40, 68]],
    9: [[18, 24], [30, 24], [42, 24], [18, 42], [30, 42], [42, 42], [18, 60], [30, 60], [42, 60]],
};

/* 5 has a red heart and 7 a red crown — both traditional, and both give a
   learner a shape to hang the number on rather than a count to make. */
const BAM_RED = { 5: [2], 7: [0], 9: [0, 1, 2] };

function bambooFace(n) {
    if (n === 1) return birdFace();
    const pts = BAM_LAYOUT[n];
    const red = BAM_RED[n] ?? [];
    const h = n >= 7 ? 12 : n >= 4 ? 14 : 16;
    return pts.map((p, i) => stalk(p[0], p[1], red.includes(i) ? 'var(--cinnabar)' : 'var(--jade)', h)).join('');
}

/*
 * 一索 — the bird. Drawn rather than abbreviated to a single stalk because in
 * the house variant this tile is the wild, and a player has to pick it out of
 * a rack instantly. It is the one face in the set that is a picture.
 */
function birdFace() {
    return `
    <g>
      <path d="M30 20 C38 20 43 26 43 33 C43 40 38 47 31 52 L29 52 C22 47 17 40 17 33 C17 26 22 20 30 20 Z"
            fill="var(--jade)"/>
      <path d="M30 22 C36 22 40 27 40 33 C40 38 36 44 30 48 C24 44 20 38 20 33 C20 27 24 22 30 22 Z"
            fill="var(--jade-light)"/>
      <circle cx="30" cy="30" r="7.5" fill="var(--jade)"/>
      <circle cx="32.4" cy="28.4" r="1.7" fill="var(--tile-inset)"/>
      <path d="M37.5 30.5 L44 33 L37.5 35 Z" fill="var(--cinnabar)"/>
      <path d="M30 50 L24 64 L30 60 L36 64 Z" fill="var(--cinnabar)"/>
      <path d="M22 60 L30 57 L38 60" stroke="var(--jade)" stroke-width="2.4"
            fill="none" stroke-linecap="round"/>
      <rect x="19" y="66" width="22" height="2.6" rx="1.3" fill="var(--ink)"/>
    </g>`;
}

/* ---------------- characters (萬) ---------------- */

/* The rank as a Chinese numeral in ink over 萬 in cinnabar — the layout every
   real characters tile uses, and the reason this suit is the one beginners
   report as unreadable. Showing the Arabic rank in the corner would make the
   tile easy and the player no better at tables that do not have it. */
function charsFace(n) {
    return `
    <text x="30" y="35" text-anchor="middle" fill="var(--ink)"
          font-family="var(--font-cn)" font-size="26" font-weight="500">${CN_NUM[n - 1]}</text>
    <text x="30" y="68" text-anchor="middle" fill="var(--cinnabar)"
          font-family="var(--font-cn)" font-size="27" font-weight="600">萬</text>`;
}

/* ---------------- honours ---------------- */

function honorFace(code) {
    const r = rankOf(code);
    const glyph = honorGlyph(code);

    // 白, the white dragon: a carved frame and nothing inside it.
    if (r === 5) {
        return `
        <rect x="13" y="19" width="34" height="47" rx="3"
              fill="none" stroke="var(--ink)" stroke-width="2.6"/>
        <rect x="17.5" y="23.5" width="25" height="38" rx="2"
              fill="none" stroke="var(--ink)" stroke-width="1"/>`;
    }
    const color = r === 7 ? 'var(--cinnabar)' : r === 6 ? 'var(--jade)' : 'var(--ink)';
    return `
    <text x="30" y="55" text-anchor="middle" fill="${color}"
          font-family="var(--font-cn)" font-size="36" font-weight="600">${glyph}</text>`;
}

/* ---------------- bonus tiles ---------------- */

function bonusFace(code) {
    const n = rankOf(code);
    const isFlower = suitOf(code) === 'f';
    const color = isFlower ? 'var(--cinnabar)' : 'var(--jade)';
    const glyph = (isFlower ? ['梅', '蘭', '菊', '竹'] : ['春', '夏', '秋', '冬'])[n - 1];
    return `
    <text x="30" y="52" text-anchor="middle" fill="${color}"
          font-family="var(--font-cn)" font-size="30" font-weight="600">${glyph}</text>
    <text x="30" y="70" text-anchor="middle" fill="var(--ink)"
          font-family="var(--font-cn)" font-size="13">${CN_NUM[n - 1]}</text>`;
}

/* ---------------- assembly ---------------- */

function face(code) {
    if (isBonus(code)) return bonusFace(code);
    if (isHonor(code)) return honorFace(code);
    const n = rankOf(code);
    if (suitOf(code) === 'p') return dotsFace(n);
    if (suitOf(code) === 's') return bambooFace(n);
    return charsFace(n);
}

/*
 * One tile as an SVG string. `back` draws the bamboo side for wall and
 * opponent-hand illustrations.
 */
export function tileSVG(code, { back = false } = {}) {
    const inner = back
        ? `<rect x="4" y="3.5" width="${W - 8}" height="${H - 12}" rx="4.5" fill="var(--tile-back)"/>
           <path d="M12 14 H48 M12 26 H48 M12 38 H48 M12 50 H48 M12 62 H48"
                 stroke="var(--tile-back-line)" stroke-width="2" stroke-linecap="round"/>`
        : face(code);
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 class="tile-svg" aria-hidden="true">${body()}${inner}</svg>`;
}

/*
 * A tile as an interactive element. Buttons when they do something, plain
 * figures when they do not — a drill option must be reachable by keyboard, and
 * a tile that only illustrates a lesson must not be.
 */
export function tileEl(code, {
    size = 'md', back = false, action = null, state = '', title = null, disabled = false,
} = {}) {
    const el = document.createElement(action ? 'button' : 'span');
    el.className = `tile tile-${size}${state ? ` is-${state}` : ''}`;
    el.innerHTML = tileSVG(code, { back });
    const label = back ? 'Face-down tile' : tileName(code);
    if (action) {
        el.type = 'button';
        el.disabled = disabled;
        el.setAttribute('aria-label', label);
        el.addEventListener('click', () => action(code, el));
    } else {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', label);
    }
    if (title) el.title = title;
    el.dataset.tile = code;
    return el;
}

export function handEl(tiles, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = `hand hand-${opts.size ?? 'md'}`;
    tiles.forEach((t) => wrap.appendChild(tileEl(t, opts)));
    return wrap;
}

/* A meld sits slightly apart and reads as a unit; a claimed tile is rotated,
   the way it is laid on a real table to show where it came from. */
export function meldEl(meld, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'meld';
    meld.tiles.forEach((t, i) => {
        const el = tileEl(t, { size: opts.size ?? 'sm', ...opts });
        if (meld.claimedIndex === i) el.classList.add('is-claimed');
        wrap.appendChild(el);
    });
    return wrap;
}

export const TILE_ASPECT = W / H;

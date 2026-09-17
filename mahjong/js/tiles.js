/* ============================================================
   tiles.js — the tile model.

   Codes are riichi-standard two-character pairs: a rank digit and a suit
   letter. Uniform width, contiguous indices per suit, and chow detection
   becomes rank arithmetic inside one suit. Chosen over ad-hoc letters
   (E, S, W, C, F, P) precisely so no special case is needed to read a tile.

     1m..9m  characters 萬   index  0..8
     1p..9p  dots 筒         index  9..17
     1s..9s  bamboo 索       index 18..26
     1z..4z  E S W N         index 27..30
     5z..7z  白 發 中        index 31..33

   Bonus tiles (Hong Kong only) sit outside the 34 and never meld:
     1f..4f  flowers    1g..4g  seasons
   ============================================================ */

const SUITS = ['m', 'p', 's'];
export const SUIT_ORDER = ['m', 'p', 's', 'z'];

export const TILES = [
    ...SUITS.flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${r}${s}`)),
    ...[1, 2, 3, 4, 5, 6, 7].map((r) => `${r}z`),
];

const INDEX = new Map(TILES.map((t, i) => [t, i]));

/* 一索, the bird. Wild for hairs in the house variant: it satisfies the
   distinctness requirement in any pile and grows any pile. It is also an
   ordinary bamboo tile and an ordinary terminal — nothing here treats it
   specially, the hair rules do. */
export const WILD = '1s';

export const BONUS_TILES = [
    ...[1, 2, 3, 4].map((r) => `${r}f`),
    ...[1, 2, 3, 4].map((r) => `${r}g`),
];

export const isBonus = (code) => BONUS_TILES.includes(code);

export function tileIndex(code) {
    const i = INDEX.get(code);
    if (i === undefined) throw new Error(`not a tile: ${code}`);
    return i;
}

export function tileFromIndex(i) {
    const t = TILES[i];
    if (t === undefined) throw new Error(`no tile at index ${i}`);
    return t;
}

export const suitOf = (code) => code[1];
export const rankOf = (code) => Number(code[0]);

export const isHonor = (code) => suitOf(code) === 'z';
export const isWind = (code) => isHonor(code) && rankOf(code) <= 4;
export const isDragon = (code) => isHonor(code) && rankOf(code) >= 5;
export const isTerminal = (code) => !isHonor(code) && (rankOf(code) === 1 || rankOf(code) === 9);
export const isSimple = (code) => !isHonor(code) && !isTerminal(code);
export const isTerminalOrHonor = (code) => isHonor(code) || isTerminal(code);

/* The three groups that can form a hair pile. A tile belongs to at most one. */
export function hairGroupOf(code) {
    if (isWind(code)) return 'winds';
    if (isDragon(code)) return 'dragons';
    if (isTerminal(code)) return 'terminals';
    return null;
}

export const HAIR_GROUPS = ['winds', 'dragons', 'terminals'];

export const HAIR_GROUP_LABEL = {
    winds: 'Winds',
    dragons: 'Dragons',
    terminals: 'Terminals',
};

const SUIT_NAME = { m: 'Characters', p: 'Dots', s: 'Bamboo' };
const HONOR_NAME = [
    'East Wind', 'South Wind', 'West Wind', 'North Wind',
    'White Dragon', 'Green Dragon', 'Red Dragon',
];
const HONOR_GLYPH = ['東', '南', '西', '北', '白', '發', '中'];

export function tileName(code) {
    if (isBonus(code)) return bonusName(code);
    if (isHonor(code)) return HONOR_NAME[rankOf(code) - 1];
    return `${rankOf(code)} ${SUIT_NAME[suitOf(code)]}`;
}

export function honorGlyph(code) {
    return isHonor(code) ? HONOR_GLYPH[rankOf(code) - 1] : null;
}

const FLOWER_NAME = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
const SEASON_NAME = ['Spring', 'Summer', 'Autumn', 'Winter'];
function bonusName(code) {
    const list = suitOf(code) === 'f' ? FLOWER_NAME : SEASON_NAME;
    return list[rankOf(code) - 1];
}

const suitRank = (code) => SUIT_ORDER.indexOf(suitOf(code));

export function sortTiles(tiles) {
    return [...tiles].sort((a, b) => suitRank(a) - suitRank(b) || rankOf(a) - rankOf(b));
}

/* Compact notation: digits accumulate until a suit letter closes them.
   "11m99p1z" → 1m 1m 9p 9p 1z. Trailing digits with no suit are a typo, and
   silently dropping them would turn a mistyped hand into a valid-looking one. */
export function parseTiles(text) {
    const tiles = [];
    let pending = '';
    for (const ch of String(text).replace(/\s/g, '')) {
        if (ch >= '0' && ch <= '9') { pending += ch; continue; }
        if (!pending) throw new Error(`suit letter '${ch}' with no ranks before it`);
        for (const r of pending) tiles.push(`${r}${ch}`);
        pending = '';
    }
    if (pending) throw new Error(`ranks '${pending}' with no suit letter after them`);
    tiles.forEach((t) => tileIndex(t));
    return tiles;
}

export const formatTiles = (tiles) => {
    let out = '';
    let run = [];
    let suit = null;
    for (const t of sortTiles(tiles)) {
        if (suitOf(t) !== suit) {
            if (run.length) out += run.join('') + suit;
            suit = suitOf(t);
            run = [];
        }
        run.push(rankOf(t));
    }
    if (run.length) out += run.join('') + suit;
    return out;
};

/* A 34-slot histogram. Every hand algorithm downstream works on this shape
   rather than on arrays of codes, because decomposition and shanten both walk
   the tile order and need O(1) access to "how many of this kind". */
export function toCounts(tiles) {
    const counts = new Array(34).fill(0);
    for (const t of tiles) {
        const i = tileIndex(t);
        if (++counts[i] > 4) throw new Error(`five copies of ${t}: only four exist`);
    }
    return counts;
}

export function fromCounts(counts) {
    const tiles = [];
    counts.forEach((n, i) => { for (let k = 0; k < n; k++) tiles.push(TILES[i]); });
    return tiles;
}

export const countsTotal = (counts) => counts.reduce((a, b) => a + b, 0);

export function buildWall({ flowers = false } = {}) {
    const wall = TILES.flatMap((t) => [t, t, t, t]);
    return flowers ? [...wall, ...BONUS_TILES] : wall;
}

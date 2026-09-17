/* ============================================================
   rules.js — variant definitions and the house-rule toggles.

   Two variants ship. They share tiles, hands and win detection and differ
   only in how a win converts to points, which is why scoring.js branches on
   `variant` and nothing else does.

   Rules are copied into a session when it starts. Retuning them in October
   must never re-score a night played in March.
   ============================================================ */

export const VARIANTS = {
    hkos: {
        id: 'hkos',
        name: 'Hong Kong Old Style',
        blurb: 'The common Chinese-family game. Faan patterns, a 3-faan minimum, flowers, and the dealer paying double.',
        tiles: 144,
        flowers: true,
    },
    hairs: {
        id: 'hairs',
        name: 'Hairs',
        blurb: 'House rules. No flowers, no faan: a win is worth one, seven pairs two, and every tile past the seed of a declared pile is another point.',
        tiles: 136,
        flowers: false,
    },
};

export const DEFAULT_RULES = {
    hkos: {
        variant: 'hkos',
        minFaan: 3,
        limitFaan: 13,
        flowerFaan: 1,
        dealerDouble: true,
    },
    hairs: {
        variant: 'hairs',
        baseWin: 1,
        sevenPairsWin: 2,
        /* additive — score = base + hairs. multiplicative — score = base × 2^hairs.
           The owner described the additive form; the other is here because house
           rules of this kind drift and a neighbouring table may double instead. */
        hairMode: 'additive',
        /* The three tiles a pile is declared with are its seed and score nothing.
           Whether a second pile brings its own seed was not specified; per-pile
           is the reading that matches "the number of hairs you have minus the
           initial three". */
        hairSeedPerPile: true,
        /* Only the winner's piles pay. Some tables settle everyone's. */
        losersScoreHairs: false,
        dealerDouble: false,
    },
};

export const rulesFor = (variant) => ({ ...DEFAULT_RULES[variant] });

export function withDefaults(rules = {}) {
    const variant = rules.variant && DEFAULT_RULES[rules.variant] ? rules.variant : 'hairs';
    return { ...DEFAULT_RULES[variant], ...rules, variant };
}

/* The knobs the rules panel renders, so the UI never hard-codes this list. */
export const RULE_CONTROLS = {
    hkos: [
        { key: 'minFaan', label: 'Minimum faan to win', type: 'number', min: 0, max: 13,
          help: 'Most tables require 3. A hand worth less cannot be declared.' },
        { key: 'limitFaan', label: 'Limit', type: 'number', min: 5, max: 20,
          help: 'Faan above this pay the same as this.' },
        { key: 'flowerFaan', label: 'Faan per flower', type: 'number', min: 0, max: 2 },
        { key: 'dealerDouble', label: 'Dealer pays and collects double', type: 'bool' },
    ],
    hairs: [
        { key: 'baseWin', label: 'A win is worth', type: 'number', min: 1, max: 10 },
        { key: 'sevenPairsWin', label: 'Seven pairs is worth', type: 'number', min: 1, max: 10 },
        { key: 'hairMode', label: 'Hairs are', type: 'choice',
          options: [
              { value: 'additive', label: 'added to the score' },
              { value: 'multiplicative', label: 'doublings of the score' },
          ] },
        { key: 'hairSeedPerPile', label: 'Each pile has its own seed of three', type: 'bool',
          help: 'Off: three is subtracted once across all your piles.' },
        { key: 'losersScoreHairs', label: "Losers settle their hairs too", type: 'bool' },
        { key: 'dealerDouble', label: 'Dealer pays and collects double', type: 'bool' },
    ],
};

/* ============================================================
   rules.js — house rules.

   Spades has no single rulebook: bag limits, nil values and what happens
   to a failed nil bidder's tricks all vary by table. Everything the scoring
   engine branches on lives here, so a match can snapshot the rules it was
   played under and still re-score correctly years later.
   ============================================================ */

export const DEFAULT_RULES = {
    target: 500,          // first team to reach this wins
    bust: null,           // score at or below which a team is out (null = off)
    bagLimit: 10,         // bags that trigger the penalty
    bagPenalty: -100,     // points applied when the limit is hit
    bagsCarry: true,      // keep the remainder after a penalty (vs. reset to 0)
    nil: 100,             // successful nil; failed nil costs the same
    blindNil: 200,
    failedNilBags: true,  // a failed nil bidder's tricks count as team bags
    handSize: 13,         // tricks per hand — 13 for the 4-player game
};

export const RULE_FIELDS = [
    { key: 'target', label: 'Play to', hint: 'First team to reach this score wins.', min: 50, max: 2000, step: 50 },
    { key: 'bagLimit', label: 'Bag limit', hint: 'Bags that trigger the penalty.', min: 1, max: 20, step: 1 },
    { key: 'bagPenalty', label: 'Bag penalty', hint: 'Points applied when the limit is hit.', min: -500, max: 0, step: 10 },
    { key: 'nil', label: 'Nil', hint: 'Won if the bidder takes no tricks, lost otherwise.', min: 0, max: 500, step: 25 },
    { key: 'blindNil', label: 'Blind nil', hint: 'Nil declared before looking at the hand.', min: 0, max: 1000, step: 25 },
];

export const RULE_TOGGLES = [
    { key: 'bagsCarry', label: 'Bags carry over', hint: 'Keep the remainder after a penalty instead of resetting to zero.' },
    { key: 'failedNilBags', label: 'Failed nil tricks are bags', hint: "Tricks taken by a busted nil bidder count toward the team's bags." },
];

/** Fill in anything a stored rule set is missing, so old matches keep scoring. */
export function withDefaults(rules) {
    return { ...DEFAULT_RULES, ...(rules || {}) };
}

/** Preset rule sets for the tables people actually play at. */
export const PRESETS = {
    standard: { label: 'Standard 500', rules: { ...DEFAULT_RULES } },
    quick: { label: 'Quick 200', rules: { ...DEFAULT_RULES, target: 200, bagLimit: 5, bagPenalty: -50 } },
    tournament: { label: 'Tournament 300', rules: { ...DEFAULT_RULES, target: 300, bust: -200 } },
    cutthroat: { label: 'Cutthroat (solo)', rules: { ...DEFAULT_RULES, target: 500, bagLimit: 10 } },
};

/* ============================================================
   rules.js — house rules, and the only things the engine branches on.

   The landlord is always decided by 叫分 (calling 1, 2 or 3 points), and the
   call is the base score. That part is fixed. What genuinely differs table to
   table is how the multiplier chain is built — whether a rocket counts as an
   ordinary bomb or as double one, whether spring is played at all, and whether
   the chain is capped before it runs away — so those are the knobs.

   A match copies these at kickoff. Changing them in October must not re-score
   a night played in September.
   ============================================================ */

export const DEFAULT_RULES = {
    bombMultiplier: 2,      // each 炸弹 multiplies the stake by this
    rocketMultiplier: 2,    // 王炸; some tables run it at 4
    springEnabled: true,    // 春天 — landlord wins, peasants never played a card
    antiSpringEnabled: true,// 反春 — peasants win, landlord played only once
    springMultiplier: 2,    // applies to both spring and anti-spring
    capEnabled: false,      // clamp a runaway chain
    maxMultiplier: 64,
};

/** Every field is numeric or boolean, so a bad import degrades to the default
 *  rather than poisoning the fold that derives every score in the store. */
export function withDefaults(rules) {
    const r = { ...DEFAULT_RULES, ...(rules || {}) };
    const num = (v, d, min) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= min ? n : d;
    };
    return {
        bombMultiplier: num(r.bombMultiplier, DEFAULT_RULES.bombMultiplier, 1),
        rocketMultiplier: num(r.rocketMultiplier, DEFAULT_RULES.rocketMultiplier, 1),
        springMultiplier: num(r.springMultiplier, DEFAULT_RULES.springMultiplier, 1),
        maxMultiplier: num(r.maxMultiplier, DEFAULT_RULES.maxMultiplier, 1),
        springEnabled: !!r.springEnabled,
        antiSpringEnabled: !!r.antiSpringEnabled,
        capEnabled: !!r.capEnabled,
    };
}

/** The three legal calls. A round where nobody called is a redeal, not a 0. */
export const CALLS = [1, 2, 3];

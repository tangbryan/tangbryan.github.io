/* ============================================================
   ranges.js — 6-max NLHE, 100bb cash. Standard published GTO
   baselines (Upswing free charts / GTO Wizard solver defaults /
   PokerCoaching cheat sheets), transcribed in range shorthand.
   See README for methodology + sources.
   ============================================================ */
(function (global) {
  "use strict";

  // Seat order around a 6-max table, UTG acts first preflop.
  // angle = position on the oval table (degrees, 0 = right, going CCW).
  const POSITIONS = {
    UTG: { name: "UTG", label: "Under the Gun", angle: 198, blurb: "First to act. Tightest opening range." },
    HJ:  { name: "HJ",  label: "Hijack",        angle: 145, blurb: "One off the cutoff. Range opens up." },
    CO:  { name: "CO",  label: "Cutoff",        angle: 90,  blurb: "Late position. Wide, profitable opens." },
    BTN: { name: "BTN", label: "Button",        angle: 35,  blurb: "Best seat. Widest range, acts last postflop." },
    SB:  { name: "SB",  label: "Small Blind",   angle: 342, blurb: "Out of position vs BB. Raise-or-fold." },
    BB:  { name: "BB",  label: "Big Blind",     angle: 270, blurb: "Last to act preflop. Defends a wide range." },
  };
  const SEAT_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

  // ---- Raise First In (open-raise) ranges -------------------------
  const RFI = {
    UTG: "22+, ATs+, A5s, KTs+, QTs+, JTs, T9s, 98s, 76s, AJo+, KQo",
    HJ:  "22+, A9s+, A5s-A4s, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, 65s, ATo+, KJo+, QJo",
    CO:  "22+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, 54s, A9o+, KTo+, QTo+, JTo",
    BTN: "22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o, 87o",
    SB:  "22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, A2o+, K9o+, Q9o+, J9o+, T9o, 98o",
  };

  // ---- Facing a single raise: call + 3-bet ranges -----------------
  // Key = "HERO_v_RAISER". SB defends 3-bet-or-fold (no flat).
  const VS_RFI = {
    BBvUTG: { threeBet: "QQ+, AKs, A5s-A4s, AKo", call: "22-JJ, A2s-ATs, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo-AQo, KJo+, QJo" },
    BBvHJ:  { threeBet: "QQ+, AKs, AJs, A5s-A4s, AKo, AQo", call: "22-JJ, A2s-ATs, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, ATo-AJo, KJo+, QJo, JTo" },
    BBvCO:  { threeBet: "TT+, AQs+, A5s-A3s, KJs, AKo, AQo", call: "22-99, A2s-AJs, K8s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, A8o-AJo, KTo+, QTo+, JTo" },
    BBvBTN: { threeBet: "99+, ATs+, A5s-A2s, KTs+, QTs+, JTs, AJo+, KQo", call: "22-88, A2s-A9s, K2s-K9s, Q4s-Q9s, J7s+, T6s+, 96s+, 85s+, 74s+, 64s+, 53s+, A2o-ATo, K8o+, Q8o+, J8o+, T8o+, 98o, 87o, 76o" },
    BBvSB:  { threeBet: "99+, ATs+, A5s-A2s, KTs+, QTs+, JTs, AJo+, KQo", call: "22-88, A2s-A9s, K3s-K9s, Q5s-Q9s, J7s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o-ATo, K8o+, Q9o+, J9o+, T9o, 98o, 87o" },
    SBvUTG: { threeBet: "TT+, AQs+, A5s-A4s, KQs, AKo", call: "" },
    SBvCO:  { threeBet: "99+, AJs+, A5s-A3s, KJs+, QJs, AQo+", call: "" },
    SBvBTN: { threeBet: "55+, A9s+, A5s-A2s, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo", call: "" },
    BTNvUTG:{ threeBet: "QQ+, AKs, A5s, AKo", call: "22-JJ, ATs+, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo, KQo" },
    BTNvCO: { threeBet: "TT+, AJs+, A5s-A4s, KJs+, AKo, AQo", call: "22-99, A8s-ATs, A5s, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AJo, KQo" },
    COvUTG: { threeBet: "QQ+, AKs, A5s-A4s, AKo", call: "22-JJ, A9s-ATs, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo, KQo" },
  };

  const SOURCES = [
    "Upswing Poker — Free 6-Max Cash Preflop Charts",
    "GTO Wizard — 6-max 100bb cash solver defaults",
    "PokerCoaching.com — GTO Preflop Cheat Sheets",
    "Red Chip Poker — 6-max preflop ranges",
  ];

  global.Ranges = { POSITIONS, SEAT_ORDER, RFI, VS_RFI, SOURCES };
})(window);

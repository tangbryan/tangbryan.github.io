/* ============================================================
   poker.js — core poker utilities + range-shorthand parser
   No dependencies. Exposes a global `Poker` object.
   ============================================================ */
(function (global) {
  "use strict";

  // Ranks high -> low. Index 0 = Ace (strongest).
  const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const SUITS = ["s", "h", "d", "c"]; // spade, heart, diamond, club
  const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const SUIT_COLOR = { s: "spade", h: "heart", d: "diamond", c: "club" };

  const rankIndex = (r) => RANKS.indexOf(r);
  // 2 -> 2 ... T ->10, J->11, Q->12, K->13, A->14
  const rankValue = (r) => 14 - RANKS.indexOf(r);

  /* ---------- 169-hand canonical ids ----------
     pair:    "AA"          (6 combos)
     suited:  "AKs" hi+lo+s (4 combos)
     offsuit: "AKo" hi+lo+o (12 combos)
     For non-pairs the higher rank is always written first.            */

  function handId(a, b, suited) {
    if (a === b) return a + b; // pair
    const hi = rankValue(a) >= rankValue(b) ? a : b;
    const lo = hi === a ? b : a;
    return hi + lo + (suited ? "s" : "o");
  }

  function handCombos(id) {
    if (id.length === 2) return 6; // pair
    return id.endsWith("s") ? 4 : 12;
  }

  // Grid coords for the standard 13x13 chart.
  // pair -> diagonal; suited -> upper-right; offsuit -> lower-left.
  function handToCell(id) {
    if (id.length === 2) {
      const i = rankIndex(id[0]);
      return { row: i, col: i };
    }
    const hi = rankIndex(id[0]);
    const lo = rankIndex(id[1]);
    return id.endsWith("s") ? { row: hi, col: lo } : { row: lo, col: hi };
  }

  function cellToHand(row, col) {
    if (row === col) return RANKS[row] + RANKS[row];
    if (col > row) return RANKS[row] + RANKS[col] + "s"; // upper triangle
    return RANKS[col] + RANKS[row] + "o"; // lower triangle
  }

  /* ---------- Range shorthand parser ----------
     Accepts comma-separated tokens:
       pairs:   "22+", "77+", "JJ", "22-JJ", "55-88"
       suited:  "ATs+", "A5s-A2s", "K2s-K9s", "T9s"
       offsuit: "AJo+", "K9o+", "QJo"
     "+" fixes the higher card and walks the kicker up to one below it.
     Returns a Set of canonical hand ids.                               */

  function expandToken(tokRaw, out) {
    const tok = tokRaw.trim();
    if (!tok) return;

    // Pair forms ---------------------------------------------------
    // "22+", "JJ", "22-JJ"
    const pairPlus = /^([2-9TJQKA])\1\+$/.exec(tok);
    if (pairPlus) {
      const start = rankValue(pairPlus[1]);
      for (let v = start; v <= 14; v++) out.add(rankFromValue(v).repeat(2));
      return;
    }
    const pairRange = /^([2-9TJQKA])\1-([2-9TJQKA])\2$/.exec(tok);
    if (pairRange) {
      let a = rankValue(pairRange[1]);
      let b = rankValue(pairRange[2]);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let v = lo; v <= hi; v++) out.add(rankFromValue(v).repeat(2));
      return;
    }
    const pairOne = /^([2-9TJQKA])\1$/.exec(tok);
    if (pairOne) {
      out.add(pairOne[1].repeat(2));
      return;
    }

    // Suited / offsuit forms --------------------------------------
    const suited = tok.includes("s");
    const type = suited ? "s" : "o";

    // "ATs+"  -> fix high, kicker from low up to (high-1)
    const plus = new RegExp("^([2-9TJQKA])([2-9TJQKA])" + type + "\\+$").exec(tok);
    if (plus) {
      const hi = plus[1], loStart = plus[2];
      const hiV = rankValue(hi);
      for (let v = rankValue(loStart); v < hiV; v++) {
        out.add(handId(hi, rankFromValue(v), suited));
      }
      return;
    }

    // "A5s-A2s" or "K2s-K9s" -> same high card, kicker walks between bounds
    const range = new RegExp(
      "^([2-9TJQKA])([2-9TJQKA])" + type + "-([2-9TJQKA])([2-9TJQKA])" + type + "$"
    ).exec(tok);
    if (range) {
      const hi = range[1];
      let a = rankValue(range[2]);
      let b = rankValue(range[4]);
      const lo = Math.min(a, b), top = Math.max(a, b);
      for (let v = lo; v <= top; v++) {
        if (v < rankValue(hi)) out.add(handId(hi, rankFromValue(v), suited));
      }
      return;
    }

    // single "T9s" / "QJo"
    const one = new RegExp("^([2-9TJQKA])([2-9TJQKA])" + type + "$").exec(tok);
    if (one) {
      out.add(handId(one[1], one[2], suited));
      return;
    }

    console.warn("Unparsed range token:", tokRaw);
  }

  function rankFromValue(v) {
    return RANKS[14 - v];
  }

  function expandRange(shorthand) {
    const out = new Set();
    if (!shorthand) return out;
    shorthand.split(",").forEach((t) => expandToken(t, out));
    return out;
  }

  // Fraction of all 1326 starting combos covered by a hand-id set.
  function rangePercent(idSet) {
    let combos = 0;
    idSet.forEach((id) => (combos += handCombos(id)));
    return (combos / 1326) * 100;
  }

  /* ---------- Cards / deck ---------- */

  function fullDeck() {
    const d = [];
    for (const r of RANKS) for (const s of SUITS) d.push(r + s);
    return d;
  }

  // Deterministic-friendly shuffle (Fisher-Yates using Math.random by default).
  function draw(n, exclude) {
    const used = new Set(exclude || []);
    const deck = fullDeck().filter((c) => !used.has(c));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, n);
  }

  // Given two specific cards (e.g. "Ah","Kd") return the 169-hand id.
  function holeToId(c1, c2) {
    const r1 = c1[0], s1 = c1[1], r2 = c2[0], s2 = c2[1];
    if (r1 === r2) return r1 + r2;
    return handId(r1, r2, s1 === s2);
  }

  // Deal two specific cards that match a given 169-hand id (random suits).
  function dealHandFromId(id, exclude) {
    const used = new Set(exclude || []);
    const free = (r) => SUITS.filter((s) => !used.has(r + s));
    if (id.length === 2) {
      const r = id[0];
      const opts = free(r);
      return [r + opts[0], r + opts[1]];
    }
    const hi = id[0], lo = id[1], suited = id.endsWith("s");
    if (suited) {
      const s = free(hi).filter((x) => free(lo).includes(x));
      const suit = s[Math.floor(Math.random() * s.length)];
      return [hi + suit, lo + suit];
    }
    const sh = free(hi);
    const s1 = sh[Math.floor(Math.random() * sh.length)];
    const sl = free(lo).filter((x) => x !== s1);
    const s2 = sl[Math.floor(Math.random() * sl.length)];
    return [hi + s1, lo + s2];
  }

  global.Poker = {
    RANKS, SUITS, SUIT_SYMBOL, SUIT_COLOR,
    rankIndex, rankValue, rankFromValue,
    handId, handCombos, handToCell, cellToHand,
    expandRange, rangePercent,
    fullDeck, draw, holeToId, dealHandFromId,
  };
})(window);

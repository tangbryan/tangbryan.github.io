/* ============================================================
   postflop.js — flop / turn / river spot generator + a
   heuristic c-bet / barrel "baseline" model. This is a concept
   coach (texture + hand strength + position), NOT a solver.
   Honestly labeled as such in the UI.
   ============================================================ */
(function (global) {
  "use strict";
  const P = global.Poker;
  const R = global.Ranges;

  /* ---------- board texture ---------- */
  function classifyBoard(flop) {
    const vals = flop.map((c) => P.rankValue(c[0]));
    const suits = flop.map((c) => c[1]);
    const top = Math.max(...vals);
    const paired = new Set(vals).size < 3;

    const suitCounts = {};
    suits.forEach((s) => (suitCounts[s] = (suitCounts[s] || 0) + 1));
    const maxSuit = Math.max(...Object.values(suitCounts));
    const suitedness = maxSuit === 3 ? "monotone" : maxSuit === 2 ? "two-tone" : "rainbow";

    const distinct = [...new Set(vals)].sort((a, b) => a - b);
    const span = distinct[distinct.length - 1] - distinct[0];
    const connected = distinct.length === 3 && span <= 4;

    let wet = 0;
    if (suitedness === "monotone") wet += 2;
    else if (suitedness === "two-tone") wet += 1;
    if (connected) wet += span <= 2 ? 2 : 1;
    if (top <= 11 && !paired) wet += 1; // middling boards are dynamic

    const texture = wet >= 3 ? "wet" : wet >= 1 ? "semi-wet" : "dry";
    const highCard = top >= 13; // K or A high
    const aggressorFavored =
      texture === "dry" ||
      (highCard && suitedness !== "monotone" && !connected) ||
      (paired && top >= 12);

    return {
      top, paired, suitedness, connected, texture, aggressorFavored,
      highCardName: P.rankFromValue(top),
      label: describeBoard(texture, suitedness, paired, connected),
    };
  }

  function describeBoard(texture, suitedness, paired, connected) {
    const bits = [texture];
    if (paired) bits.push("paired");
    if (connected) bits.push("connected");
    if (suitedness !== "rainbow") bits.push(suitedness);
    else bits.push("rainbow");
    return bits.join(", ");
  }

  /* ---------- made-hand classification ---------- */
  function hasFlush(suits) {
    const c = {};
    suits.forEach((s) => (c[s] = (c[s] || 0) + 1));
    return Object.values(c).some((n) => n >= 5);
  }
  function hasStraight(valsArr) {
    const set = new Set(valsArr);
    if (set.has(14)) set.add(1); // wheel
    for (let lo = 1; lo <= 10; lo++) {
      let run = 0;
      for (let k = 0; k < 5; k++) if (set.has(lo + k)) run++;
      if (run === 5) return true;
    }
    return false;
  }

  function evalMade(hole, board) {
    const cards = hole.concat(board);
    const vals = cards.map((c) => P.rankValue(c[0]));
    const suits = cards.map((c) => c[1]);
    const boardVals = board.map((c) => P.rankValue(c[0]));
    const holeVals = hole.map((c) => P.rankValue(c[0]));
    const top = Math.max(...boardVals);
    const isPP = holeVals[0] === holeVals[1];

    const count = {};
    vals.forEach((v) => (count[v] = (count[v] || 0) + 1));
    const trips = Object.keys(count).filter((v) => count[v] >= 3).map(Number);
    const pairs = Object.keys(count).filter((v) => count[v] === 2).map(Number);

    if (hasFlush(suits) && hasStraight(vals)) return mk("straight/flush", "value");
    if (hasFlush(suits)) return mk("flush", "value");
    if (hasStraight(vals)) return mk("straight", "value");
    if (trips.length) {
      const t = Math.max(...trips);
      return mk(isPP && holeVals[0] === t ? "set" : "trips", "value");
    }
    if (pairs.length >= 2) return mk("two pair", "value");
    if (pairs.length === 1) {
      const p = pairs[0];
      if (isPP && holeVals[0] === p) {
        return p > top ? mk("overpair", "value") : mk("underpair", "medium");
      }
      const usesHole = holeVals.includes(p);
      if (!usesHole) return mk("no pair", "air"); // board paired, hero whiffed
      const board3 = [...new Set(boardVals)].sort((a, b) => b - a);
      if (p === board3[0]) {
        const kicker = Math.max(...holeVals.filter((v) => v !== p));
        return mk("top pair", kicker >= 12 ? "value" : "medium");
      }
      if (p === board3[board3.length - 1]) return mk("bottom pair", "medium");
      return mk("middle pair", "medium");
    }
    // overcards bonus
    const over = holeVals.filter((v) => v > top).length;
    return mk(over === 2 ? "two overcards" : "no pair", "air");

    function mk(category, bucket) { return { category, bucket }; }
  }

  /* ---------- draw classification ---------- */
  function evalDraws(hole, board) {
    const cards = hole.concat(board);
    const suitCount = {};
    cards.forEach((c) => (suitCount[c[1]] = (suitCount[c[1]] || 0) + 1));
    const flushDraw = Object.values(suitCount).some((n) => n === 4);

    const set = new Set(cards.map((c) => P.rankValue(c[0])));
    if (set.has(14)) set.add(1);
    let oesd = false, gut = false, made = false;
    for (let lo = 1; lo <= 10; lo++) {
      let present = 0, missing = [];
      for (let k = 0; k < 5; k++) {
        if (set.has(lo + k)) present++;
        else missing.push(lo + k);
      }
      if (present === 5) made = true;
      if (present === 4) {
        const m = missing[0];
        if (m === lo || m === lo + 4) oesd = true;
        else gut = true;
      }
    }
    if (made) return { flushDraw, straightDraw: null };
    return { flushDraw, straightDraw: oesd ? "oesd" : gut ? "gutshot" : null };
  }

  // Combine made + draws into a decision bucket. Draws only matter pre-river.
  function combineBucket(made, draws, isRiver) {
    const strongDraw = !isRiver && (draws.flushDraw || draws.straightDraw === "oesd");
    if (made.bucket === "value") return "value";
    if (strongDraw) return "draw";
    if (made.bucket === "medium") return "medium";
    return "air";
  }

  /* ---------- recommendation engine ---------- */
  function act(action, reason, concept) { return { action, reason, concept }; }

  function recommend(street, bucket, board, heroIP) {
    if (street === "flop") return recommendFlop(bucket, board, heroIP);
    if (street === "turn") return recommendTurn(bucket, board, heroIP);
    return recommendRiver(bucket, board, heroIP);
  }

  function recommendFlop(bucket, board, ip) {
    if (bucket === "value") {
      return board.texture === "dry"
        ? act("betSmall", "Strong made hand on a dry, static board. A small bet extracts thin value and denies equity while keeping villain's worse hands in.", "Value + range advantage")
        : act("betBig", "Strong hand on a dynamic board — bet big to charge flush/straight draws and build the pot before scary cards arrive.", "Value & protection");
    }
    if (bucket === "draw") {
      return act("betBig", "Semi-bluff. With this much equity you bet big: you have fold equity now and a strong hand when you complete.", "Semi-bluff");
    }
    if (bucket === "medium") {
      if (board.aggressorFavored && ip) {
        return act("betSmall", "A small range c-bet works your entire range on an aggressor-favored board. In position this marginal pair can bet thinly.", "Range bet");
      }
      return act("check", "Pot control. This marginal made hand checks to realize equity cheaply and avoid being blown off it — especially out of position.", "Pot control");
    }
    // air
    if (board.aggressorFavored) {
      return act("betSmall", "Range c-bet bluff. On a dry, high-card board you hold the range advantage — a cheap stab folds out villain's many air hands.", "Range advantage");
    }
    return act("check", "Give up. This wet board hits the caller's range hard; bluffing pure air just burns chips. Check and reassess.", "Give up the bluff");
  }

  function recommendTurn(bucket, board, ip) {
    if (bucket === "value")
      return act("betBig", "Keep barreling for value. Your hand is well ahead — build the pot now so you can get stacks in by the river.", "Value barrel");
    if (bucket === "draw")
      return act("betBig", "Double-barrel semi-bluff. You still have strong equity and fold equity; betting denies villain a free river card.", "Semi-bluff barrel");
    if (bucket === "medium")
      return act("check", "Pot control on the turn. Showdown value plays better as a check-back than as a thin bet that only gets called by better.", "Pot control");
    return act("check", "Shut it down. Without equity or a clear bluff story, a second barrel is too expensive. Check and give up.", "Give up");
  }

  function recommendRiver(bucket, board, ip) {
    if (bucket === "value")
      return act("betBig", "Bet for value. You beat enough of villain's calling range to size up and get paid by worse hands.", "Thin/strong value");
    if (bucket === "medium")
      return act("check", "Showdown value. Betting only folds out worse and gets called by better — check and try to win at showdown.", "Showdown value");
    return act("check", "No showdown value and no clean bluff story here — checking is the baseline. (With the right blockers, a polar bluff can be a mix.)", "Check / give up");
  }

  /* ---------- spot generation ---------- */
  // Hero is always the preflop raiser (PFR). Scenarios pair a PFR seat
  // with a BB caller; vs BB the PFR is in position, except SB (OOP).
  const SCENARIOS = [
    { pfr: "BTN", caller: "BB", heroIP: true },
    { pfr: "CO", caller: "BB", heroIP: true },
    { pfr: "HJ", caller: "BB", heroIP: true },
    { pfr: "UTG", caller: "BB", heroIP: true },
    { pfr: "SB", caller: "BB", heroIP: false },
  ];

  const STREET_BOARD = { flop: 3, turn: 4, river: 5 };
  const PRIOR_LINE = {
    flop: "You open-raised preflop and the BB called. Heads-up to the flop.",
    turn: "You open-raised pre, c-bet the flop, and the BB called. On to the turn.",
    river: "You raised pre and barreled flop + turn; the BB called both. River.",
  };

  function sizeLabels(street) {
    if (street === "flop") return { betSmall: "Bet 33% pot", betBig: "Bet 75% pot", check: "Check" };
    if (street === "turn") return { betSmall: "Bet 60% pot", betBig: "Bet 100% pot", check: "Check" };
    return { betSmall: "Bet 60% pot", betBig: "Bet 125% pot", check: "Check" };
  }

  function generate(street) {
    const scn = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
    const ids = [...P.expandRange(R.RFI[scn.pfr])];
    const heroId = ids[Math.floor(Math.random() * ids.length)];
    const hero = P.dealHandFromId(heroId);
    const board = P.draw(STREET_BOARD[street], hero);

    const boardInfo = classifyBoard(board.slice(0, 3));
    const made = evalMade(hero, board);
    const draws = evalDraws(hero, board);
    const bucket = combineBucket(made, draws, street === "river");
    const rec = recommend(street, bucket, boardInfo, scn.heroIP);

    const labels = sizeLabels(street);
    const options = ["check", "betSmall", "betBig"].map((k) => ({ key: k, label: labels[k] }));

    const drawText = [];
    if (draws.flushDraw) drawText.push("flush draw");
    if (draws.straightDraw === "oesd") drawText.push("open-ended straight draw");
    if (draws.straightDraw === "gutshot") drawText.push("gutshot");

    return {
      street,
      heroId,
      hero,
      board,
      scenario: scn,
      boardInfo,
      made,
      draws,
      drawText,
      bucket,
      recommendation: rec,
      options,
      priorLine: PRIOR_LINE[street],
    };
  }

  global.Postflop = { generate, classifyBoard, evalMade, evalDraws };
})(window);

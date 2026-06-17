/* ============================================================
   app.js — UI + trainer loop. Depends on poker.js, ranges.js,
   postflop.js (loaded before this file).
   ============================================================ */
(function () {
  "use strict";
  const P = window.Poker, R = window.Ranges, PF = window.Postflop;
  const $ = (sel, el = document) => el.querySelector(sel);
  const make = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };

  /* ---------- modes ---------- */
  const MODES = {
    rfi:   { label: "Preflop · Open", short: "Open Raise", desc: "You're first to enter the pot (Raise First In). Should you open-raise or fold?" },
    vsrfi: { label: "Preflop · vs Raise", short: "vs Raise", desc: "Someone open-raised before you. Fold, flat-call, or 3-bet?" },
    flop:  { label: "Flop", short: "Flop", desc: "You're the preflop raiser on the flop. Pick the baseline c-bet line." },
    turn:  { label: "Turn", short: "Turn", desc: "You c-bet the flop and got called. What's the turn play?" },
    river: { label: "River", short: "River", desc: "Two streets of betting called. Value, give up, or check back?" },
    charts:{ label: "Charts", short: "Charts", desc: "Browse the underlying GTO ranges. No quiz — just reference." },
  };

  let mode = "rfi";
  let spot = null;       // current question
  let answered = false;
  const score = loadScore();

  /* ---------- card rendering (4-color deck) ---------- */
  function cardEl(card) {
    const r = card[0], s = card[1];
    const el = make("div", "card suit-" + P.SUIT_COLOR[s]);
    el.innerHTML =
      `<span class="card-rank">${r === "T" ? "10" : r}</span>` +
      `<span class="card-suit">${P.SUIT_SYMBOL[s]}</span>`;
    return el;
  }
  function cardRow(cards, cls) {
    const row = make("div", "card-row " + (cls || ""));
    cards.forEach((c) => row.appendChild(cardEl(c)));
    return row;
  }
  function cardBack() {
    const el = make("div", "card card-back");
    return el;
  }

  /* ---------- table diagram ---------- */
  function renderTable(highlight) {
    const wrap = $("#table");
    wrap.innerHTML = "";
    const felt = make("div", "felt");
    felt.appendChild(make("div", "felt-logo", "♠ ♥ ♦ ♣"));
    wrap.appendChild(felt);

    R.SEAT_ORDER.forEach((pos) => {
      const info = R.POSITIONS[pos];
      const theta = (info.angle * Math.PI) / 180;
      const x = 50 + 44 * Math.cos(theta);
      const y = 50 - 38 * Math.sin(theta);
      const seat = make("div", "seat");
      seat.style.left = x + "%";
      seat.style.top = y + "%";

      const tag = highlight[pos];
      if (tag) seat.classList.add("seat-" + tag.role);
      seat.appendChild(make("div", "seat-pos", pos));
      if (tag && tag.note) seat.appendChild(make("div", "seat-note", tag.note));
      wrap.appendChild(seat);
    });
  }

  /* ---------- 13x13 range grid ---------- */
  function renderGrid(container, colorFor, highlightId) {
    container.innerHTML = "";
    const grid = make("div", "grid");
    for (let row = 0; row < 13; row++) {
      for (let col = 0; col < 13; col++) {
        const id = P.cellToHand(row, col);
        const cell = make("div", "gcell " + colorFor(id));
        cell.textContent = gridLabel(id);
        if (id === highlightId) cell.classList.add("gcell-hi");
        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);
  }
  function gridLabel(id) {
    return id.replace("T", "T"); // keep as-is; labels like "AKs"
  }

  /* ---------- build a preflop OPEN spot ---------- */
  function buildRFI() {
    const positions = ["UTG", "HJ", "CO", "BTN", "SB"];
    const pos = positions[Math.floor(Math.random() * positions.length)];
    const [c1, c2] = P.draw(2);
    const id = P.holeToId(c1, c2);
    const set = P.expandRange(R.RFI[pos]);
    const inRange = set.has(id);
    const pct = Math.round(P.rangePercent(set));

    const highlight = {};
    // earlier seats folded
    const order = R.SEAT_ORDER;
    for (const p of order) {
      if (p === pos) { highlight[p] = { role: "hero", note: "YOU" }; break; }
      highlight[p] = { role: "fold", note: "fold" };
    }

    return {
      mode: "rfi",
      context: `<strong>${R.POSITIONS[pos].label} (${pos})</strong> — folded to you. ${R.POSITIONS[pos].blurb}`,
      highlight,
      heroCards: [c1, c2],
      board: null,
      options: [
        { key: "raise", label: "Open-Raise" },
        { key: "fold", label: "Fold" },
      ],
      correct: inRange ? "raise" : "fold",
      accept: [inRange ? "raise" : "fold"],
      explain: () =>
        `<b>${prettyHand(id)}</b> is ${inRange ? "<span class='ok'>in</span>" : "<span class='no'>not in</span>"} ${pos}'s opening range (≈${pct}% of hands). ${
          inRange
            ? "Open-raise to ~2.2–2.5bb."
            : "Fold — it's below the threshold for this position."
        }`,
      reveal: (el) => {
        renderGrid(el, (h) => (set.has(h) ? "g-raise" : "g-fold"), id);
        legend(el, [["g-raise", "Open-raise"], ["g-fold", "Fold"]]);
      },
    };
  }

  /* ---------- build a preflop vs-RAISE spot ---------- */
  function buildVsRFI() {
    const keys = Object.keys(R.VS_RFI);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const [hero, raiser] = key.split("v");
    const data = R.VS_RFI[key];
    const threeBet = P.expandRange(data.threeBet);
    const call = P.expandRange(data.call);
    const callOnly = data.call !== "";

    const [c1, c2] = P.draw(2);
    const id = P.holeToId(c1, c2);
    const inTB = threeBet.has(id), inCall = call.has(id);
    const isMix = inTB && inCall;
    let correct, accept;
    if (isMix) { correct = "3bet"; accept = ["3bet", "call"]; }
    else if (inTB) { correct = "3bet"; accept = ["3bet"]; }
    else if (inCall) { correct = "call"; accept = ["call"]; }
    else { correct = "fold"; accept = ["fold"]; }

    const highlight = {};
    highlight[raiser] = { role: "raiser", note: "RAISE" };
    highlight[hero] = { role: "hero", note: "YOU" };

    const options = [{ key: "fold", label: "Fold" }];
    if (callOnly) options.push({ key: "call", label: "Call" });
    options.push({ key: "3bet", label: "3-Bet" });

    return {
      mode: "vsrfi",
      context: `<strong>${R.POSITIONS[raiser].label} (${raiser})</strong> open-raises. You're in the <strong>${R.POSITIONS[hero].label} (${hero})</strong>.${
        callOnly ? "" : " <em>Out of the blinds vs an open, the baseline is 3-bet-or-fold — no flatting.</em>"
      }`,
      highlight,
      heroCards: [c1, c2],
      board: null,
      note: callOnly ? null : "3-bet or fold",
      options,
      correct,
      accept,
      acceptLabel: isMix ? "3-Bet or Call (mix)" : null,
      explain: () => {
        if (isMix)
          return `<b>${prettyHand(id)}</b> is a <span class='ok'>mixed-frequency</span> hand vs a ${raiser} open — solvers both 3-bet and flat it. Either is fine; only folding is a leak here.`;
        const verb = { "3bet": "3-bet for value/as a bluff", call: "flat-call", fold: "fold" }[correct];
        return `<b>${prettyHand(id)}</b> → <span class='ok'>${verb}</span> vs a ${raiser} open. ${
          correct === "fold" ? "It's not strong/playable enough to continue here." : ""
        }`;
      },
      reveal: (el) => {
        renderGrid(
          el,
          (h) => (threeBet.has(h) && call.has(h) ? "g-mix" : threeBet.has(h) ? "g-3bet" : call.has(h) ? "g-call" : "g-fold"),
          id
        );
        const items = [["g-3bet", "3-Bet"]];
        if (callOnly) { items.push(["g-call", "Call"]); items.push(["g-mix", "Mix"]); }
        items.push(["g-fold", "Fold"]);
        legend(el, items);
      },
    };
  }

  /* ---------- build a postflop spot ---------- */
  function buildPostflop(street) {
    const s = PF.generate(street);
    const highlight = {};
    highlight[s.scenario.pfr] = { role: "hero", note: "YOU (PFR)" };
    highlight[s.scenario.caller] = { role: "caller", note: "called" };

    const handDesc = [s.made.category];
    if (s.drawText.length) handDesc.push("+ " + s.drawText.join(" + "));

    return {
      mode: street,
      context: `${s.priorLine} You hold <b>${prettyHand(s.heroId)}</b> ${
        s.scenario.heroIP ? "<em>in position</em>" : "<em>out of position</em>"
      }.`,
      highlight,
      heroCards: s.hero,
      board: s.board,
      heuristic: true,
      options: s.options,
      correct: s.recommendation.action,
      accept: [s.recommendation.action],
      explain: () =>
        `Board: <b>${s.boardInfo.label}</b>. Your hand: <b>${handDesc.join(" ")}</b>. ` +
        `<span class='concept'>${s.recommendation.concept}</span><br>${s.recommendation.reason}`,
      reveal: (el) => {
        const box = make("div", "concept-box");
        const grid = [
          ["Texture", s.boardInfo.label],
          ["Your hand", handDesc.join(" ")],
          ["Range edge", s.boardInfo.aggressorFavored ? "Aggressor favored" : "Caller catches up"],
          ["Position", s.scenario.heroIP ? "In position" : "Out of position"],
        ];
        grid.forEach(([k, v]) => {
          const r = make("div", "concept-row");
          r.appendChild(make("span", "concept-k", k));
          r.appendChild(make("span", "concept-v", v));
          box.appendChild(r);
        });
        el.appendChild(box);
      },
    };
  }

  /* ---------- shared helpers ---------- */
  function prettyHand(id) {
    if (id.length === 2) return id; // pair
    return id; // e.g. AKs / AKo
  }
  function legend(el, items) {
    const lg = make("div", "legend");
    items.forEach(([cls, label]) => {
      const it = make("span", "legend-item");
      it.appendChild(make("span", "legend-swatch " + cls));
      it.appendChild(make("span", null, label));
      lg.appendChild(it);
    });
    el.appendChild(lg);
  }

  /* ---------- render current spot ---------- */
  function newSpot() {
    answered = false;
    if (mode === "rfi") spot = buildRFI();
    else if (mode === "vsrfi") spot = buildVsRFI();
    else spot = buildPostflop(mode);
    paint();
  }

  function paint() {
    renderTable(spot.highlight);
    $("#context").innerHTML = spot.context;

    // hole + board
    const stage = $("#stage");
    stage.innerHTML = "";
    const holeWrap = make("div", "hole-wrap");
    holeWrap.appendChild(make("div", "hole-label", "Your hand"));
    holeWrap.appendChild(cardRow(spot.heroCards, "hole"));
    stage.appendChild(holeWrap);

    if (spot.board) {
      const bWrap = make("div", "board-wrap");
      bWrap.appendChild(make("div", "hole-label", streetLabel()));
      const brow = cardRow(spot.board, "board");
      // pad with backs to 5 for visual consistency
      for (let i = spot.board.length; i < 5; i++) brow.appendChild(cardBack());
      bWrap.appendChild(brow);
      stage.appendChild(bWrap);
    }

    // actions
    const act = $("#actions");
    act.innerHTML = "";
    spot.options.forEach((o, i) => {
      const b = make("button", "act-btn", o.label);
      b.dataset.key = o.key;
      const hk = make("span", "hotkey", String(i + 1));
      b.appendChild(hk);
      b.addEventListener("click", () => answer(o.key));
      act.appendChild(b);
    });
    if (spot.note) {
      const n = make("div", "spot-note", spot.note);
      act.appendChild(n);
    }

    // reset feedback
    $("#feedback").className = "feedback";
    $("#feedback").innerHTML = "";
    $("#reveal").innerHTML = "";
    $("#next-btn").classList.add("hidden");
    if (spot.heuristic) $("#heuristic-badge").classList.remove("hidden");
    else $("#heuristic-badge").classList.add("hidden");
  }

  function streetLabel() {
    if (mode === "flop") return "Flop";
    if (mode === "turn") return "Turn (flop + turn)";
    if (mode === "river") return "River (full board)";
    return "Board";
  }

  function answer(key) {
    if (answered) return;
    answered = true;
    const accept = spot.accept || [spot.correct];
    const correct = accept.includes(key);
    const correctLabel = spot.acceptLabel || (spot.options.find((o) => o.key === spot.correct) || {}).label;

    // score
    score.total++;
    score[mode] = score[mode] || { c: 0, t: 0 };
    score[mode].t++;
    if (correct) {
      score.correct++;
      score[mode].c++;
      score.streak++;
      if (score.streak > score.best) score.best = score.streak;
    } else {
      score.streak = 0;
    }
    saveScore(score);
    refreshScore();

    // highlight buttons
    $$(".act-btn").forEach((b) => {
      if (accept.includes(b.dataset.key)) b.classList.add("btn-correct");
      if (b.dataset.key === key && !correct) b.classList.add("btn-wrong");
      b.disabled = true;
    });

    const fb = $("#feedback");
    fb.className = "feedback " + (correct ? "feedback-ok" : "feedback-no");
    fb.innerHTML =
      `<div class="fb-head">${correct ? "✓ Correct" : "✗ Not the baseline"}${
        correct ? "" : ` — best: <b>${correctLabel}</b>`
      }</div>` +
      `<div class="fb-body">${spot.explain()}</div>`;

    const rev = $("#reveal");
    rev.innerHTML = "";
    if (spot.reveal) spot.reveal(rev);

    $("#next-btn").classList.remove("hidden");
    $("#next-btn").focus();
  }

  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /* ---------- charts mode ---------- */
  function renderCharts() {
    const host = $("#chart-host");
    host.innerHTML = "";
    const controls = make("div", "chart-controls");

    const tabs = make("div", "chart-tabs");
    const sets = [
      ...["UTG", "HJ", "CO", "BTN", "SB"].map((p) => ({ kind: "rfi", key: p, label: p })),
      ...Object.keys(R.VS_RFI).map((k) => ({ kind: "vs", key: k, label: k.replace("v", " v ") })),
    ];
    let active = sets[0];
    sets.forEach((s) => {
      const b = make("button", "chip-tab", s.label);
      if (s === active) b.classList.add("active");
      b.addEventListener("click", () => {
        active = s;
        $$(".chip-tab", tabs).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        drawChart();
      });
      tabs.appendChild(b);
    });
    controls.appendChild(make("div", "chart-cap", "Open ranges"));
    host.appendChild(controls);
    host.appendChild(tabs);

    const gridHost = make("div", "chart-grid-host");
    host.appendChild(gridHost);

    function drawChart() {
      gridHost.innerHTML = "";
      if (active.kind === "rfi") {
        const set = P.expandRange(R.RFI[active.key]);
        gridHost.appendChild(make("div", "chart-title",
          `${R.POSITIONS[active.key].label} — Open-Raise · ${Math.round(P.rangePercent(set))}% of hands`));
        const g = make("div");
        renderGrid(g, (h) => (set.has(h) ? "g-raise" : "g-fold"), null);
        gridHost.appendChild(g);
        legend(gridHost, [["g-raise", "Open-raise"], ["g-fold", "Fold"]]);
      } else {
        const d = R.VS_RFI[active.key];
        const tb = P.expandRange(d.threeBet), ca = P.expandRange(d.call);
        const [hero, raiser] = active.key.split("v");
        gridHost.appendChild(make("div", "chart-title",
          `${hero} defending vs ${raiser} open${d.call === "" ? " · 3-bet-or-fold" : ""}`));
        const g = make("div");
        renderGrid(g, (h) => (tb.has(h) && ca.has(h) ? "g-mix" : tb.has(h) ? "g-3bet" : ca.has(h) ? "g-call" : "g-fold"), null);
        gridHost.appendChild(g);
        const items = [["g-3bet", "3-Bet"]];
        if (d.call !== "") { items.push(["g-call", "Call"]); items.push(["g-mix", "Mix"]); }
        items.push(["g-fold", "Fold"]);
        legend(gridHost, items);
      }
    }
    drawChart();
  }

  /* ---------- score persistence ---------- */
  function loadScore() {
    try {
      const s = JSON.parse(localStorage.getItem("pt_score") || "{}");
      return Object.assign({ correct: 0, total: 0, streak: 0, best: 0 }, s);
    } catch (e) {
      return { correct: 0, total: 0, streak: 0, best: 0 };
    }
  }
  function saveScore(s) {
    try { localStorage.setItem("pt_score", JSON.stringify(s)); } catch (e) {}
  }
  function refreshScore() {
    $("#s-correct").textContent = score.correct;
    $("#s-total").textContent = score.total;
    const acc = score.total ? Math.round((score.correct / score.total) * 100) : 0;
    $("#s-acc").textContent = acc + "%";
    $("#s-streak").textContent = score.streak;
    $("#s-best").textContent = score.best;
  }

  /* ---------- mode switching ---------- */
  function setMode(m) {
    mode = m;
    if (location.hash !== "#" + m) history.replaceState(null, "", "#" + m);
    $$(".mode-tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
    $("#mode-desc").textContent = MODES[m].desc;
    const quiz = $("#quiz-view"), chart = $("#chart-view");
    if (m === "charts") {
      quiz.classList.add("hidden");
      chart.classList.remove("hidden");
      renderCharts();
    } else {
      chart.classList.add("hidden");
      quiz.classList.remove("hidden");
      newSpot();
    }
  }

  /* ---------- init ---------- */
  function init() {
    const tabHost = $("#mode-tabs");
    Object.keys(MODES).forEach((m) => {
      const b = make("button", "mode-tab", MODES[m].label);
      b.dataset.mode = m;
      b.addEventListener("click", () => setMode(m));
      tabHost.appendChild(b);
    });
    $("#next-btn").addEventListener("click", newSpot);

    document.addEventListener("keydown", (e) => {
      if (mode === "charts") return;
      if (!answered && /[1-9]/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (spot && spot.options[idx]) answer(spot.options[idx].key);
      } else if (answered && (e.key === "Enter" || e.key === " " || e.key.toLowerCase() === "n")) {
        e.preventDefault();
        newSpot();
      }
    });

    refreshScore();
    const initial = (location.hash || "").replace("#", "");
    setMode(MODES[initial] ? initial : "rfi");
    window.addEventListener("hashchange", () => {
      const m = (location.hash || "").replace("#", "");
      if (MODES[m] && m !== mode) setMode(m);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

# ♠ GTO Poker Trainer

A fast, no-build web app for drilling **6-max No-Limit Hold'em** decisions across every
street — preflop opens, 3-bet defense, and flop / turn / river c-bet spots — with clear
table positioning, instant feedback, and a built-in range explorer.

**Live:** [tangbryan.github.io/poker-trainer](https://tangbryan.github.io/poker-trainer/)

---

## What it trains

| Mode | What you drill |
|------|----------------|
| **Preflop · Open** | Raise-first-in (RFI) decisions for every seat (UTG → SB). Open or fold? |
| **Preflop · vs Raise** | Facing an open from the blinds / late position. Fold, flat, or 3-bet? Mixed-strategy hands accept either action. |
| **Flop / Turn / River** | You're the preflop raiser. Pick the baseline c-bet / barrel line for the spot. |
| **Charts** | Browse every underlying range as an interactive 13×13 grid. |

Each spot shows the table with positions highlighted (you, the raiser, the caller, who
folded), your hole cards in a clean four-color deck, the board, and — after you answer —
the full reasoning plus the relevant range grid with your hand pinpointed. Score, accuracy,
and streak persist in `localStorage`.

Keyboard: `1`–`3` to answer, `Enter` for the next spot. Deep-link any mode via the URL
hash, e.g. `#charts`, `#flop`.

## The data

Preflop ranges are **standard, widely-published 100bb 6-max GTO baselines**, transcribed
into a compact range-shorthand and parsed at runtime. They are cross-consistent with the
commonly-cited free chart sets:

- Upswing Poker — free 6-max cash preflop charts
- GTO Wizard — 6-max 100bb cash solver defaults
- PokerCoaching.com — GTO preflop cheat sheets
- Red Chip Poker — 6-max preflop ranges

Ranges live in [`js/ranges.js`](js/ranges.js) as readable shorthand
(e.g. `"22+, ATs+, A5s, KTs+, QTs+, JTs, T9s, 98s, 76s, AJo+, KQo"`) and are expanded to
the 169 starting hands by the parser in [`js/poker.js`](js/poker.js). Swapping in your own
solver output is a one-line edit per range — no code changes required.

> **Postflop is a teaching model, not a solver.** Flop/turn/river answers come from a
> transparent board-texture + hand-strength + position heuristic
> ([`js/postflop.js`](js/postflop.js)), surfaced honestly in the UI with a *“heuristic
> baseline”* badge. It encodes real concepts — range/nut advantage, polarization on wet
> boards, range-betting dry boards, semi-bluffing, pot control, showdown value — but it is
> for learning, not for claiming GTO-exact lines.

## How it works

Plain HTML/CSS/JS, zero dependencies, zero build step — GitHub Pages just serves the files.

```
poker-trainer/
├── index.html        # page shell
├── styles.css        # theme (matches tangbryan.github.io)
└── js/
    ├── poker.js      # cards, deck, range-shorthand parser, 13×13 grid helpers
    ├── ranges.js     # the preflop range data (RFI + vs-RFI)
    ├── postflop.js   # board-texture classifier + c-bet/barrel heuristic
    └── app.js        # UI, table diagram, trainer loop, scoring
```

### Range shorthand

The parser in `poker.js` accepts standard notation so charts read the way they're written:

- Pairs — `22+`, `77+`, `JJ`, `22-JJ`
- Suited — `ATs+`, `A5s-A2s`, `T9s`
- Offsuit — `AJo+`, `K9o+`, `QJo`

`+` fixes the higher card and walks the kicker up to one below it.

## Run locally

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/poker-trainer/
```

## Disclaimer

For educational use only. Ranges are baselines, not exploitative/population-specific
strategies, and the postflop coach is a simplified model. No gambling, no real money.

# Spades Scoreboard

A scoreboard for partnership spades: bids, tricks, bags, nils, running score and
the win condition, plus a persistent team roster so records and head-to-heads
build up across a season.

Live at **[tangbryan.github.io/spades](https://tangbryan.github.io/spades/)**.

No build step, no dependencies, no server — plain ES modules and a stylesheet.
Copy the folder into the site and it works.

## What it tracks

**Per hand** — each player's bid (including nil and blind nil) and tricks taken.
Tricks are validated to total 13 before a hand can be recorded, and the projected
score swing for every team is shown live while the hand is being typed.

**Per match** — running score, bags with the penalty coming into view, contract
rate, average bid delta, nil record, best and worst hand, and a running-score
chart with a crosshair readout.

**Per team, across matches** — win/loss record, current and longest streak,
recent form, lifetime contract rate, bags per hand, nil success, and a
head-to-head matrix against every other team.

**Per player** — average bid, average tricks, and nil record, which is the actual
case for or against letting someone bid nil again.

The three numbers that matter most in spades are surfaced everywhere:

| Metric | Reads as |
|---|---|
| Contract rate | how often the team makes the bid it took |
| Bid delta | average (tricks won − tricks bid); positive means chronic underbidding |
| Bags per hand | the sandbagging rate — the slow way teams lose |

## Scoring

Standard partnership rules, with the variants that differ table to table exposed
as house rules:

- Making the bid scores `10 × bid`, plus one point per overtrick (a bag).
- Missing it scores `−10 × bid`.
- Bags accumulate; hitting the limit (default 10) applies a penalty (default
  −100) and carries the remainder. Landing on 23 bags takes the penalty twice.
- Nil is a **player** contract settled separately: the nil bidder contributes 0
  to the partnership bid, and their tricks never help their partner make it.
  A busted nil's tricks become team bags (configurable).
- The match ends when one team alone is past the target. Two teams tied at the
  top keep playing.

Presets ship for Standard 500, Quick 200, Tournament 300 and Cutthroat; every
field is editable. Rules are **copied into a match when it starts**, so changing
them later never re-scores a game already in progress.

Solo/cutthroat works: a team with one player scores through the same engine.

## Design notes

**Score is derived, never stored.** `standings()` folds the hand list from zero
every time. Bag penalties depend on the order hands were played, so this is the
only correct approach — and it means editing or deleting hand 3 of 12 is a
re-fold rather than a patch, and a fix in `scoring.js` retroactively corrects
every match in the store.

**A match snapshots its own lineup and rules.** Renaming a team in September
must not rewrite what happened in March, and deleting one must not corrupt a
finished match — a team that appears in any match is archived rather than
deleted.

**Team colours are computed, not chosen.** They double as the series colours on
the chart, so the six were found by searching OKLCH for hues that clear
all-pairs colour-vision separation (worst ΔE 10.6 against a target of 8) and 3:1
contrast on the card surface. Reorder them freely; don't add a seventh by eye.

## Files

```
index.html        shell — the views are rendered by app.js
styles.css        theme, matching the parent site
js/rules.js       house rules and presets; everything the engine branches on
js/scoring.js     the engine: scoreHand, applyBags, standings, validateHand
js/store.js       localStorage persistence for the roster and match history
js/stats.js       derived analytics — per match, lifetime, head-to-head, player
js/dom.js         element builder, modal, toast
js/app.js         views and wiring
```

`scoring.js` and `stats.js` are pure and have no DOM or storage imports, so they
can be exercised directly under Node.

## Data

Everything lives in `localStorage`, per browser. Nothing is uploaded. **Export**
on the History tab writes a JSON file; **Import** merges it by default, so
restoring a backup never wipes matches played since it was taken.

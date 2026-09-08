# Doudizhu Scoreboard

A scoreboard for three-handed 斗地主: the call, the bombs, the springs and the
multiplier chain they build, plus a persistent roster so landlord and peasant
records accumulate across every night you play with the same people.

Live at **[tangbryan.github.io/doudizhu](https://tangbryan.github.io/doudizhu/)**.

No build step, no dependencies, no server — plain ES modules and a stylesheet.
Copy the folder into the site and it works.

## What it tracks

**Per round** — who took the landlord seat, what they called, which side won,
how many bombs and rockets went off, and whether it was a spring or an
anti-spring. The multiplier and everyone's exposure update as you type, so you
see what a round is worth before you commit to it. A round nobody called is
recorded as a redeal: it scores nothing and is excluded from every rate.

**Per match** — running score, landlord conversion rate, bombs per round,
springs, the biggest single-round swing, and a running-score chart with a
crosshair readout.

**Per player, across matches** — lifetime score, match record, how often they
take the landlord seat, what they win from it, and what they win as a peasant.

The three numbers that matter most in doudizhu are surfaced everywhere:

| Metric | Reads as |
|---|---|
| Landlord win rate | how often you convert the seat you paid for |
| Peasant win rate | how often you beat the landlord |
| Net per round, by side | which seat actually makes you points |

A high average call next to a low landlord win rate is someone buying the seat
and losing it, and the running score alone will never say so.

**Against the landlord** — three-handed, the two peasants are allies rather than
opponents, so a player-versus-player matrix would be measuring nothing. The
matrix here is landlord → peasant: when a given person takes the seat, this is
how each peasant fares against them.

## Scoring

The landlord is decided by 叫分 — calling 1, 2 or 3 — and the call is the base
score:

```
stake = call × 2^bombs × rocket × spring
landlord wins → landlord +2·stake, each peasant −stake
peasants win  → landlord −2·stake, each peasant +stake
```

Every round sums to zero. What differs table to table is the multiplier chain,
so that part is exposed as house rules: the bomb and rocket factors (some tables
run 王炸 at 4), whether spring and 反春 are played at all, and an optional cap
for a chain that runs away. Rules are **copied into a match when it starts**, so
changing them later never re-scores a game already played.

## Design notes

**Score is derived, never stored.** `standings()` folds the round list from zero
every time. That makes editing or deleting round 3 of 20 a re-fold rather than a
patch, and it means a fix in `scoring.js` retroactively corrects every match in
the store.

**A match snapshots its own lineup and rules.** Renaming someone in October must
not rewrite a night played in March, and removing them must not corrupt a
finished match — a player who appears in any match is archived rather than
deleted. Records key off the player id, so fixing a spelling keeps every round
they have played.

**Seat colours are positional, not per-player.** Only three people sit at a
table, so fixing the triad by seat guarantees the players on screen are always
maximally separable no matter how large the roster grows; a colour chosen per
player could not promise that. The three were found by searching HSL under a
restrained saturation and lightness band for the largest worst-case pairwise ΔE
across normal, protan, deutan and tritan vision — worst case 54.8 against a
target of 8, at least 3.5 contrast on both the card and the felt, and 30.7 clear
of the nearest reserved hue. The site's violet/cyan gradient and the 地主 gold
are excluded on purpose, so identity never reads as decoration and the role
badge never reads as a person. Don't substitute one by eye.

**The players are drawn, not sourced.** Public-domain farmer clipart exists, but
none of it can tint to a seat colour, swap its hat when the role changes, or
raise its arms on a win — those SVGs carry hardcoded fills. There is also no
public-domain 地主 to pair with a public-domain peasant, so found art would have
put two artists' styles at the same table. The hat is the role: nobody wears one
until a landlord is picked, then it is a gold-banded cap or a straw hat. A
raised arm is a different path rather than a CSS rotation of the hanging one,
because `transform` on a nested SVG group resolves its origin against the
viewBox rather than the shoulder and so never pivots at the joint. Redrawing is
free here anyway — the table is a pure render. The winning side's pose previews
with the rest of the draft; the hop is held back until the round is recorded.

**The table is a render of the round being typed**, not a picture drawn after
the fact. It takes the same engine call that will score the round, which is why
the projected deltas on the felt and the number in the form can never disagree.
Its labels are SVG text rather than an HTML overlay, so the whole graphic scales
as one piece and stays selectable and readable to a screen reader.

## Files

```
index.html        shell — the views are rendered by app.js
styles.css        theme, matching the parent site
js/rules.js       house rules; everything the engine branches on
js/scoring.js     the engine: multiplier, scoreRound, standings, validateRound
js/store.js       localStorage persistence for the roster and match history
js/stats.js       derived analytics — per match, lifetime, landlord matrix
js/table.js       the table graphic
js/chart.js       the running-score chart
js/dom.js         element builder, modal, toast
js/app.js         views and wiring
```

`scoring.js` and `stats.js` are pure — no DOM and no storage imports — so they
run directly under Node.

## Tests

```
npm test
```

61 tests over the engine and the analytics: the multiplier chain and its house
rules, the zero-sum invariant on every round shape, standings folds and ranking
with ties, redeal exclusion, validation, and the lifetime and matrix
aggregations. `package.json` exists only so Node reads `js/` as ES modules; the
browser needs nothing.

## Data

Everything lives in `localStorage`, per browser. Nothing is uploaded. **Export**
on the History tab writes a JSON file; **Import** merges it by default, so
restoring a backup never wipes matches played since it was taken.

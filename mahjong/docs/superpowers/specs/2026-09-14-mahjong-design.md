# Mahjong Tutor — Design

A teaching tool, play aid and score tracker for new mahjong players, covering
Hong Kong Old Style and one undocumented house variant ("Hairs").

## Why this exists

Published mahjong resources are rule references. They explain the game in the
order a rulebook is organised, not the order a person learns it. Research into
beginner instruction is consistent on three points:

1. **Tile recognition is the wall.** Not the rules. Winds, dragons and the
   character suit read as noise until drilled.
2. **Pace is the second wall.** Claims interrupt turn order, and beginners lose
   the thread of whose turn it is and what outranks what.
3. **Scoring is a separate body of knowledge** and should come last.

So the curriculum is ordered recognition → sets → hands → turn → claims →
reading → scoring, and every module is drilled rather than read.

## Variants

### Hong Kong Old Style

The documented baseline. Included because it is the variant a beginner is most
likely to meet outside their own family, and the standard faan table is the
lingua franca of Chinese-family mahjong.

- 144 tiles with flowers and seasons (flowers score 1 each, 2 for own-seat).
- Faan patterns summed, converted by the doubling table below.
- 3-faan minimum to declare a win (configurable).
- Dealer pays and collects double.

Faan → points (the "half-double" table):

| Faan | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Points | 1 | 2 | 4 | 8 | 16 | 24 | 32 | 48 | 64 | 96 | 128 | 192 | 256 | 384 |

Odd faan from 5 up are 1.5x the preceding power of two. Above 13 the score is
capped at the limit (configurable).

### Hairs (house rules)

Undocumented. Recorded here from the owner's description because no published
ruleset contains it.

Research note: the closest documented relatives are Filipino mahjong, which
sets winds and dragons aside as bonus tiles that pay per tile on a win, and the
Hong Kong flower rule (補花), which is structurally identical — set the tile
aside, draw a replacement from the back of the wall, score one point each. The
most likely origin is that this *is* a flower rule, invented for a set that has
no flower tiles. "Hairs" is probably 毛, Chinese slang for a dime — the pile is
called hairs because each tile is a point.

**Tiles.** 136 tiles. No flowers, no seasons. 13-tile hands.

**Groups.** Three groups can form hairs:

- winds — E S W N
- dragons — 中 發 白
- terminals — 1 and 9 of each suit

**Declaring.** A pile is declared face up from the dealt hand, before that
player's first discard, peng or chi. It needs three tiles of one group, all
distinct. A player may declare more than one pile. Once the player has acted,
no new pile may be declared.

**Growing.** After a pile is live, any drawn tile belonging to that pile's group
joins it, and the player draws a replacement from the back of the wall —
exactly as a flower is replaced. Tiles in a pile are out of the hand, so the
hand remains 13.

**The wild.** 1s (一索, 幺鸡, the bird) is wild for hairs. It satisfies the
distinctness requirement in any pile and may grow any pile. It is also a
terminal in its own right, and it may instead be played as an ordinary bamboo
tile in the hand.

**Scoring.**

```
base  = sevenPairs ? 2 : 1
hairs = Σ over each declared pile: max(0, pileSize − 3)
score = base + hairs
```

**Payment.**

- self-draw — each of the three losers pays `score`
- discard — the discarder alone pays `score`; the other two pay nothing

No faan. No minimum. The dealer has no payment multiplier.

**Configurable, because house rules vary.** These three were not specified by
the owner and are inferred; each is a toggle, defaulted to the reading above:

| Toggle | Default | Alternative |
|---|---|---|
| `hairMode` | additive (`base + hairs`) | multiplicative (`base × 2^hairs`) |
| `hairSeedPerPile` | subtract 3 per pile | subtract 3 once overall |
| `losersScoreHairs` | no — only the winner's hairs pay | yes |

Rules are snapshotted into a session when it starts. Retuning them later never
re-scores a night already played.

## Architecture

No build step. Plain ES modules and a stylesheet, matching the Spades and
Doudizhu trackers. `package.json` exists only so Node reads `js/` as modules
when running tests.

| Module | Responsibility |
|---|---|
| `tiles.js` | tile model, encoding, ordering, grouping, display names |
| `render.js` | inline SVG tile faces, hands, melds, piles |
| `rules.js` | variant definitions and house-rule toggles |
| `hand.js` | decomposition, win detection, seven pairs, shanten |
| `scoring.js` | faan detection and payment, per variant |
| `drills.js` | drill generators and spaced-repetition scheduling |
| `lessons.js` | curriculum content |
| `store.js` | localStorage persistence |
| `stats.js` | derived statistics |
| `chart.js` | running-score chart |
| `dom.js` | DOM helpers |
| `app.js` | wiring, routing, rendering |

### Tile encoding

Riichi-standard two-character codes, uniform and sortable:

```
1m..9m  characters (萬)      index 0..8
1p..9p  dots (筒)            index 9..17
1s..9s  bamboo (索)          index 18..26
1z..4z  E S W N              index 27..30
5z..7z  白 發 中             index 31..33
```

Chosen over ad-hoc letters because every tile is two characters, indices are
contiguous per suit, and suit arithmetic for chow detection is trivial.

### Tiles are SVG

Tile faces are drawn as inline SVG, not Unicode mahjong characters (U+1F000
block) and not images. Unicode tiles render inconsistently across platforms,
cannot be themed, and are illegible at drill sizes. SVG scales, themes, and
keeps the project dependency-free. Recognition is the primary beginner wall, so
the tiles must be the most carefully made thing in the app.

### `hand.js` is the risk

Decomposition and shanten are the engine that win detection, the drills and the
scoring assistant all sit on, and shanten is easy to get subtly wrong. It is
built test-first, before any consumer.

Shanten covers standard form (4 sets + pair), seven pairs, and thirteen orphans.

## The three pillars

### Learn

Eight modules. Each is a short lesson followed by drills; a module unlocks when
the one before it is passed. Per-tile accuracy is tracked so the recognition
drill re-serves the tiles a player keeps missing.

0. The set — tile identification, timed
1. Sets — pung, chow, kong, pair
2. The hand — 4 sets + a pair
3. The turn — the deal, the wall, draw and discard
4. Claims — who may take a discard, and what outranks what
5. Reading a hand — what to discard, backed by the shanten engine
6. Scoring — faan, then hairs
7. Table flow and etiquette

### Play Aid

For use at a live table, on a phone.

- dealer and prevailing-wind tracker with rotation
- claim-priority reference
- tile lookup
- score-this-hand calculator for both variants

### Track

- standing roster with stable ids; renaming preserves history
- sessions snapshot their players and rules at kickoff
- per-hand entry, running-score chart, lifetime per-player statistics
- export/import as JSON

## Testing

`node --test test/*.test.js`. Covered: tile encoding and ordering, hand
decomposition, win detection, seven pairs, shanten across known positions, HKOS
faan detection, the faan table, hair pile validation, hair scoring under every
toggle combination, and payment resolution for self-draw and discard.

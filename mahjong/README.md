# Mahjong Tutor

A teaching tool, play aid and score tracker for people who have never played
mahjong — built around Hong Kong Old Style and one house variant that appears
in no published ruleset.

No build step, no dependencies, no server: plain ES modules and a stylesheet.
Copy the folder onto any static host and it works.

## Why it is shaped this way

Most mahjong resources are rule references organised the way a rulebook is
organised. Research into how the game is actually taught says something
different, and consistently:

- **Tile recognition is the wall.** Not the rules. Winds, dragons and the
  character suit read as noise until they are drilled.
- **Pace is the second wall.** Claims interrupt the turn order, and beginners
  lose the thread of whose turn it is.
- **Scoring is a separate body of knowledge** and belongs last.
- Mahjong is learned **like a language, not like chess** — by exposure and
  repetition rather than by mastering the rules and then starting.

So the curriculum runs recognition → sets → hands → the turn → claims →
reading a hand → scoring → etiquette, and every module ends in drills rather
than a summary. The recognition drill weights itself towards the tiles you
keep missing.

## The three pillars

**Learn** — eight short modules, each with drills. Per-tile accuracy is stored,
so the drill re-serves 白 if 白 is the one you never get.

**Table** — for a live game on a phone: whose deal it is and the prevailing
wind, what outranks what when a tile is discarded, a tile lookup, and a
what-is-it-worth calculator.

**Scores** — a standing roster with stable ids (renaming someone keeps their
history), sessions that snapshot their rules at kickoff, a running-score chart,
lifetime per-player records, and JSON export/import.

## The two variants

### Hong Kong Old Style

144 tiles with flowers. Faan patterns are summed and converted on the
half-double schedule — even faan are powers of two, odd faan from five up sit
halfway to the next one. Three faan minimum by default; the dealer pays and
collects double.

### Hairs

The house variant. **It is not in any published ruleset** — not Hong Kong,
Guangdong, Taiwanese, Singaporean, Vietnamese or Filipino. It was recorded here
from the table that plays it.

136 tiles, no flowers, 13-tile hands.

```
base  = seven pairs ? 2 : 1
hairs = Σ over each declared pile: max(0, pileSize − 3)
score = base + hairs

self-draw → each of the three losers pays `score`
discard   → the discarder alone pays `score`
```

A **pile** is declared face up from the dealt hand, before its owner's first
discard, peng or chi: three distinct tiles of one group — winds, dragons, or
terminals. Once live, any tile of that group joins it and the player draws a
replacement from the back of the wall. More than one pile is allowed, but only
declared at the start.

**1s (一索, 幺鸡, the bird) is wild.** It counts as distinct in any pile and
joins any pile — which makes it the most valuable tile in the variant, and the
reason it is drawn as a bird and not a stalk.

The closest documented relatives are Filipino mahjong, which sets winds and
dragons aside as bonus tiles that pay per tile on a win, and the Hong Kong
flower rule (補花), which is structurally identical — set the tile aside, draw a
replacement, score a point. The likeliest origin is that this *is* a flower
rule, invented for a set with no flower tiles. "Hairs" is probably 毛, slang for
a dime: the pile is called hairs because each tile is a point.

Three details were never specified and are inferred, so each is a toggle in the
rules panel rather than a hard-coded guess: whether hairs add or double, whether
the seed of three comes off each pile or once overall, and whether losers settle
their hairs too. Rules are copied into a session when it starts, so retuning
them never re-scores a night already played.

## Design notes

**Tiles are inline SVG**, drawn from scratch — not the Unicode mahjong block
(U+1F000), which renders as a different typeface on every platform, cannot be
themed, and is illegible at drill sizes. Recognition is the thing this app
exists to teach, so the tiles are the most carefully made part of it: real dot
and bamboo arrangements, the traditional ink colours, and the bird on 1s.

**Ivory on felt.** The ground is table green and the tiles are bone, which is
both the subject's own material and the highest-separation pairing available.
Tile ink — cinnabar, jade, ink blue — is spent only on tile faces, never on
interface chrome.

**Seat colours** are positional, not per-player, so the four people on screen
stay maximally separable however large the roster grows. They are four of
Okabe–Ito, validated as a categorical palette against the felt across every
pair rather than only adjacent ones: worst-case ΔE 9.6 deutan and 8.5 tritan
against a target of 8, worst normal-vision ΔE 17.0, all four above 3:1
contrast. They sit lighter than the usual dark-surface lightness band on
purpose — that spread in lightness is what makes Okabe–Ito survive colour
blindness, and every in-band four-hue set tested collapsed to ΔE 3.6 or worse,
because deuteranopia folds red, orange, yellow and green onto a single axis.

Colour is never the encoding regardless: every seat carries its wind glyph and
the player's name wherever it appears, and chart lines are labelled directly.

**`hand.js` is the engine.** Decomposition, win detection, seven pairs,
thirteen orphans and shanten — built test-first, before anything was allowed to
depend on it.

## Layout

| File | Job |
|---|---|
| `js/tiles.js` | tile model, encoding, ordering, hair groups |
| `js/render.js` | SVG tile faces, hands, melds |
| `js/hand.js` | decomposition, win detection, shanten, waits, discards |
| `js/scoring.js` | faan and hairs, and who pays |
| `js/rules.js` | variant definitions and house-rule toggles |
| `js/drills.js` | drill generators, seeded and pure |
| `js/lessons.js` | curriculum content |
| `js/store.js` | localStorage persistence |
| `js/stats.js` | standings, running scores, lifetime records |
| `js/chart.js` | the running-score chart |
| `js/dom.js` `js/app.js` | helpers, routing, screens |

Tiles are encoded riichi-style — `1m`–`9m` characters, `1p`–`9p` dots,
`1s`–`9s` bamboo, `1z`–`4z` winds, `5z`–`7z` white/green/red — so every tile is
two characters, indices are contiguous per suit, and chow detection is rank
arithmetic.

## Tests

```
npm test        # node --test test/*.test.js
```

95 tests over tile encoding, hand decomposition, win detection, shanten across
known positions, the faan table, hair pile validation, hair scoring under every
toggle combination, payment resolution, standings, and the drill generators —
including a property test that every generated question's answer key agrees
with the engine, because a drill that teaches the wrong thing is worse than no
drill.

`package.json` exists only so Node reads `js/` as ES modules when running the
tests. The browser needs nothing.

## Running it

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` from the filesystem
will not work — ES modules need a real origin.

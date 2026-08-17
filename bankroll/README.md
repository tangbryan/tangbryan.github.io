# Poker Bankroll Tracker

A poker profit/loss tracker with charts and variance analytics. No build step, no
dependencies, no backend — plain ES modules and hand-rolled SVG. Everything is
stored in `localStorage`, so session data never leaves the browser.

Live at [/bankroll](https://tangbryan.github.io/bankroll/).

## Features

**Dashboard** — net profit hero with sparkline, hourly rate (with a 95% confidence
interval), win rate, bb/hr, best and worst session, max drawdown. Cumulative profit
curve, profit by month, and a distribution of session results.

**Sessions** — sortable, filterable log with add / edit / delete. Cash games and
tournaments are modelled separately (tournaments carry fee, entrants, finish and
prize). Export to JSON or CSV, import from JSON with duplicate detection.

**Analytics** — profit by stakes, venue and day of week; a cash-vs-tournament
comparison; standard deviation, streaks, ROI, and a plain-English read on whether
the sample is big enough to distinguish skill from variance.

Filters (period, format, stakes, venue, free-text search) sit in one row and scope
every view at once.

## Layout

```
bankroll/
├── index.html
├── styles.css
└── js/
    ├── store.js    session model, localStorage, import/export, demo data
    ├── stats.js    pure metric functions (summary, grouping, drawdown, histogram)
    ├── charts.js   SVG chart primitives + shared tooltip
    └── app.js      views, filters, forms, tables
```

## Notes on the numbers

- **Profit** is always derived, never stored: `cashOut - buyIn` for cash,
  `prize - (buyIn + fee)` for tournaments.
- **bb/hr** only counts cash sessions that have both parseable blinds and clocked
  hours, so an unlabelled session can't quietly skew it. Hand counts aren't tracked,
  so bb/100 isn't offered rather than being faked.
- **Confidence interval** is the mean session result ± 1.96 standard errors,
  rescaled to an hourly figure by the average session length.
- **Max drawdown** is the largest peak-to-trough decline on the cumulative curve.
- The **result histogram** sets its bucket width from the 5th–95th percentile
  spread; sessions outside that land in an overflow bucket at either end. Without
  that, one big tournament score stretches the scale until every ordinary session
  piles into a single bar.

## Chart colours

The palette is validated rather than eyeballed. Win `#22b06b` / loss `#b33a30` is a
diverging (polarity) pair measuring OKLab CVD ΔE 13.8 under simulated protanopia and
deuteranopia, normal-vision ΔE 31.6, both inside the dark-mode lightness band and
above 3:1 against the `#15151d` chart surface.

The conventional green/red pairing normally collapses under deuteranopia — the
site's own accent green and coral measure ΔE 4.6, well below the usable floor. This
pair clears it because the two are separated in *lightness*, which deuteranopia
preserves. Sign is additionally carried by position relative to the zero baseline
and by an explicit `+`/`−` on every value, so colour is never the only channel.

Bars cap at 24px with a 4px rounded data-end and a square baseline end, lines are
2px, gridlines are solid hairlines, and every chart has a table-view twin.

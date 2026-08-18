# Poker Bankroll — published results

The read-only public view of my poker results. It renders a static `data.json`
committed to this directory and has **no write path at all**: no `localStorage`,
no add/edit/delete, no import. A visitor can filter and sort, but nothing they do
changes what anyone else sees.

The editable tracker that produces `data.json` is a separate project:
**[github.com/tangbryan/poker-bankroll-tracker](https://github.com/tangbryan/poker-bankroll-tracker)**.

## Updating the published numbers

1. In the tracker, go to **Sessions → Publish data.json**.
2. Replace `bankroll/data.json` here with the downloaded file.
3. Commit and push.

The tracker's `publish.sh` does steps 2–3 in one command.

`data.json` currently shipped here is **placeholder sample data** — it carries a
`"placeholder": true` flag, which is what makes the page show its "placeholder data"
banner. A real published file has no such flag, and the banner disappears on its own
once one is committed.

## Layout

```
bankroll/
├── index.html
├── data.json      the published results — the only source of truth
├── styles.css
└── js/
    ├── session.js  the session model (shared verbatim with the tracker)
    ├── data.js     read-only loader for data.json
    ├── stats.js    pure metric functions
    ├── charts.js   SVG chart primitives + shared tooltip
    └── app.js      views, filters, tables
```

`session.js`, `stats.js` and `charts.js` are byte-identical to the tracker's copies,
so the two can't drift on what a session is or how profit is computed. The write
path (`store.js`) exists only in the tracker; the read path (`data.js`) only here.

## Notes on the numbers

- **Profit** is always derived, never stored: `cashOut - buyIn` for cash,
  `prize - (buyIn + fee)` for tournaments.
- **bb/hr** only counts cash sessions that have both parseable blinds and clocked
  hours. Hand counts aren't tracked, so bb/100 isn't offered rather than being faked.
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

The conventional green/red pairing normally collapses under deuteranopia — this
site's own accent green and coral measure ΔE 4.6, well below the usable floor. This
pair clears it because the two are separated in *lightness*, which deuteranopia
preserves. Sign is additionally carried by position relative to the zero baseline
and by an explicit `+`/`−` on every value, so colour is never the only channel.

Bars cap at 24px with a 4px rounded data-end and a square baseline end, lines are
2px, gridlines are solid hairlines, and every chart has a table-view twin.

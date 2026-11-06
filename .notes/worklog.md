# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Decisions

- Allocated hours count Monday to Friday. This is an assumption, not a rule from the brief: 40 h capacity reads as 5 x 8 and no assignment starts on a weekend, but in a real project I would confirm it first.
- Sum all assignment rows. Each real assignment is split into 15 rows that add up to 2, 4, 5, 6 or 8 h per day, so removing "duplicates" would give wrong numbers.
- Over capacity means allocated > weekly hours, shown in hours. Percentages break on Eli (20 h against 0).
- Ranges widen to whole Monday-to-Sunday weeks on both ends, and the API returns what it served.
- Range limit is 106 weeks, the brief's two years once widened. 422 from the API, a message in the UI.
- Capacity is sent once per person, because the schema has one value. Per-week capacity (holidays, leave) would change the JSON shape.
- The whole roster loads per range, and only visible rows are drawn. Measured with React 19 in Chrome, 3,000 people: 12 weeks 482 ms per range change with all rows, 10 ms visible only. 105 weeks 7.8 s against 129 ms. React Compiler is not enabled and would not reduce DOM size anyway.
- The grid opens on the scaffold's range, not the current week: the seed is empty one week in three, including 2 Nov 2026, and it ends in January 2027.
- Save flow: the pending value is shown from the mutation's variables, cached data changes only after the server confirms, so failure has nothing to roll back. On success every cached range is patched from its own rows, then ranges are invalidated. No refetch is needed for correctness, it only picks up other people's edits.
- One save at a time. All inputs are read-only while a save is in flight, which removes every per-person race.
- Conflicts use the book's optimistic concurrency without a version column: the current value is the version (`expectedWeeklyHours`, 409). Keeping the new value in the `IN` list makes a retry idempotent when the first PATCH committed and its response was lost.
- `generate_series(date, date, interval)` has no row estimate, so Postgres planned 1000 weeks and paid 414 ms of JIT on a one-week query. Generating integers instead gave identical rows and about 9 ms.

## Tried and dropped

- Day-by-day expansion in SQL: correct, but 4.5 s for 3,000 people over 83 weeks against 930 ms for intersecting each assignment with Monday to Friday. 0 mismatches between the two on the seed.
- `cancelQueries` when the save starts plus invalidation after it: a range loading for the first time during a save kept its old hours, because invalidation joins a fetch with no data instead of restarting it. The test caught this. Cancelling right before patching fixes it.
- Swapping a button for an input on edit: moved focus and needed extra state. The hours are now always an input, with the draft local to the cell.

## Left unfinished

- Holidays and leave: not in the schema, so 1 January counts as a working day.
- Capacity history: editing changes past weeks too. Needs a dated capacity table.
- `jit=off` on the pool: JIT still costs about 40 ms on long ranges.
- Gzip on the API, and server paging if rosters grow well past a few thousand.
- `http.Server` timeouts and graceful shutdown, auth, rate limits.
- A failed save's notice is replaced when the manager saves someone else.

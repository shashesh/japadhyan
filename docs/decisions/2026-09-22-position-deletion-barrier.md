---
title: A deleted namavali position records when it was deleted
date: 2026-09-22
status: accepted
---

# A deleted namavali position records when it was deleted

## Context

A [`PracticePosition`](../architecture/data-model.md#practiceposition) merges
across devices under four rules:

1. A position saved against an older `practice_version` never wins.
2. A higher `pass_ordinal` wins.
3. A deletion is not resurrected by a stale row carrying a higher version or pass.
4. Chanting again after a deletion brings the position back.

Rules 1 and 2 need the version and pass to outrank the clock. Rules 3 and 4 need
the clock to outrank the version and pass. With a single `hlc` on the row, the
merge cannot express both orderings, and **it is not associative**: two devices
merging the same three edits in different groupings settle on different
positions, so they never converge.

This was found by property tests over the merge, not by example tests — a
two-element example cannot exhibit associativity at all.

## Decision

A position records **when it was deleted**, as its own clock:

| Field         | Notes                                                      |
| ------------- | ---------------------------------------------------------- |
| `deleted_hlc` | The `hlc` of the deletion, or empty if never deleted       |
| `deleted_at`  | The timestamp of that deletion. Travels with `deleted_hlc` |

Deletion becomes an independent last-write-wins register, so each part of the
merge is a semilattice and the whole is associative:

- `practice_version`, then `pass_ordinal` — the **generation**, merged by taking
  the higher.
- `chanted_steps` — the union of the marks of every row at the winning
  generation.
- `step_index` and `hlc` — from the row with the highest `hlc` at the winning
  generation.
- `deleted_hlc` — the later of the two, independent of generation.
- A position **is deleted** when its `deleted_hlc` is later than its `hlc`: the
  deletion happened after the last time the devotee chanted. That is derived on
  read, never stored. Storing only whether the row is _currently_ deleted throws
  away the timestamp whenever a later edit revives it, and the merge stops
  converging — property tests caught exactly that.

All four rules hold, and the result is the same whatever order rows arrive in.

## Consequences

- One more field on a synced record. It is a clock, not a secret, and carries
  nothing about what was chanted.
- **A revived position keeps the names marked before it was deleted.** Dropping
  them would need a clock per mark rather than per row, which is far more than
  a bookmark is worth. A version change already resets the marks, and a finished
  pass already moves the bookmark on, so this only shows after a delete-then-chant
  on the same pass.
- Other latest-edit-wins records keep plain `deleted_at`. They have no generation
  competing with their clock, so their deletions are already associative.

## Alternatives

- **Permanent tombstones** — a deleted position never revives; chanting again
  creates a new one. Converges with no new field, but drops rule 4 and leaves
  dead rows behind.
- **Deletion as an ordinary edit** — version and pass decide first. Converges
  with no new field, but drops rule 3: a stale row from another device can
  resurrect a bookmark the devotee deleted.

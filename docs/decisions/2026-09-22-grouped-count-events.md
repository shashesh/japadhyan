---
status: accepted
date: 2026-09-22
---

# Count events are grouped, sealed, and never edited

## Context

Totals are derived from append-only count events so that offline sync never loses or double-counts ([platform principles](../architecture/platform-principles.md#offline-first)). The first prototype recorded one event per tap. A devotee chanting a lakh a day would create about 36 million rows a year, too many to store and sync. Devotees also need to fix mistaken taps and to log practice done on physical beads.

## Decision

- **Grouped:** the current event stays open on the device and is updated in place as the devotee taps.
- **Sealed:** it is sealed at the end of a round, on a mode switch, pause, session end or app background, after 60 seconds, or when the day changes. Only sealed events sync, and they never change. An event left open by a crash is sealed on next launch.
- **Corrections are new events** (`mode: 'correction'`) linked to a session, never edits. A day's net total can't go below zero.
- **Manual logging** (`mode: 'manual'`) records practice done elsewhere, for today and up to 7 days back.
- **Each event stores its local day** (`local_day`), using the devotee's day-start time (midnight by default), so history doesn't move when they travel.

Details: [data-model](../architecture/data-model.md#countevent).

## Consequences

- Tens of events a day instead of thousands, even for heavy practice.
- No tap is lost, and sync stays simple: insert, and ignore an id already seen.
- Mode mix and history remain honest, since manual and corrected counts are visible as such.

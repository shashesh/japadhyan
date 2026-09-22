---
status: draft
updated: 2026-09-22
phases: P1, P2
---

# Sankalpa and progress

Practice as vows and a rhythm, not just a number.

Counts are always in repetitions of a practice: one japa of a mantra, or one recitation of a namavali ([data-model](../../architecture/data-model.md#counting)).

## Daily goal (P1)

- Set in [onboarding](onboarding.md) and changeable on any saved practice: e.g. 3 malas a day, or 1 Ashtottara a day.
- Lighter than a sankalpa: no start or end date, no vow.

## Sankalpa programs (P1)

- A sankalpa has: a practice (or a program with a practice for each day, like Navaratri), a target (daily count and/or total), a duration or none, and an optional intention.
- Built-in templates: **40-day mandala**, 9-day Navaratri (see [festival-programs](festival-programs.md)), 21-day beginner.
- Custom sankalpas.
- A sankalpa ends as **completed**, or the devotee can **release** it. There is no "failed".
- Optional rules (time of day, how to make up missed days) come in P2.
- **Written intention (optional):** when taking a sankalpa, the devotee can write why, e.g. "for my mother's health" or "for a steadier mind". It shows on the sankalpa while it runs and again at its end ([closing reflection](#insight-p2)).
- Intentions are private: never in analytics or community features ([privacy](../../architecture/platform-principles.md#privacy)).

## Anushthana programs (P2)

- Large, rule-bound commitments, e.g. **Gayatri 24 lakh**.
- Pacing guidance and a projected finish date based on actual pace.

## Streaks (P1)

- Daily streak with **grace days** — a missed day doesn't erase the streak.
- A day counts if the devotee chanted **any practice** (net of corrections). Meeting a daily goal is shown separately and never affects the streak.
- A day is the devotee's local day, starting at midnight by default; it can be changed, e.g. to 3 AM so late-night chanting counts for the evening.
- Warm reminders, never guilt ("Your mala is waiting when you're ready").

## Charts (P1)

- **Daily** count, **weekly** view, **annual** heatmap.
- The heatmap and other views across practices use **names chanted**, so one Ashtottara (108 names) weighs about the same as one mala. Tapping a day shows each practice's own count.
- Estimated counts (silent modes) are marked with "~".
- Filters by practice and by sankalpa.

## Insight (P2)

- **10-second reflection** after a session: "How still was my mind?" (1–5) and an optional note, shown next to counts.
- **Closing reflection:** when a sankalpa ends, the devotee sees the intention they wrote beside a short reflection on how the practice went. Reflection is open on any day too; nothing waits for the end.
- **Milestones:** traditional markers such as first lakh, 108 days in a row, first completed mandala, not bronze, silver and gold badge tiers. Milestones celebrate; they never unlock anything ([decision](../../decisions/2026-09-21-free-flow-nothing-locked.md)).
- **Year in review** for your practice.
- **Mode mix:** how much was spoken, tapped, written or silent.

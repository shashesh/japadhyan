---
status: draft
updated: 2026-09-22
phases: P1
---

# Onboarding

Goal: from install to first repetition in **under one minute**. No account required ([decision](../../decisions/2026-09-22-guest-first-accounts.md)). Works with no connection: the onboarding deities are in the app's core content bundle ([content-pipeline](../../architecture/content-pipeline.md#device)).

## Flow

| #   | Screen                   | What happens                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **Welcome**              | A calm mala animation and one line of text. The language comes from the phone's setting, with a "Change" link. **Begin**, and a small **"I already have an account"** link that signs in and restores the devotee's practice instead ([accounts](accounts-and-sync.md)).                                                                |
| 1   | **Who do you pray to?**  | A grid of deities, plus **My own mantra** and **My guru's mantra (private)**. In P2, tradition chips (Hindu, Sikh, Buddhist, Jain) appear at the top.                                                                                                                                                                                   |
| 2   | **Choose your practice** | That deity's practices, grouped as _Mantras_ and _108 Names_, with a play button when audio is available. The choice becomes a **favourite**, **that deity's default** and the **current practice** ([mantra-library](mantra-library.md#favourites-and-defaults-p1)). "My own mantra" and "My guru's mantra" open a short form instead. |
| 3   | **Your mala**            | Every [mala style](chanting-modes.md#mala-tap) is open; one is pre-selected from the deity (Tulsi for Krishna, Rudraksha for Shiva), so one tap continues.                                                                                                                                                                              |
| 4   | **Daily goal**           | Matches the practice: 1, 3 or 11 malas for a mantra; 1 or 3 recitations for a namavali; or a custom number.                                                                                                                                                                                                                             |
| 5   | **Reminder**             | Suggestions: morning, Brahma muhurta, dusk, or none. Sunrise and sunset are calculated on the device from a city the devotee types or their approximate location, which is never uploaded. A short explanation comes before the phone's notification prompt. Not shown on web.                                                          |
| 6   | **Chant**                | Lands on the [session screen](session-experience.md), with a one-time hint: "Tap anywhere to count".                                                                                                                                                                                                                                    |

- Steps 1 and 2 are required, since the app needs a practice. Steps 3 to 5 each have a sensible default and **Skip**.
- Every choice can be changed later, and nothing is locked ([decision](../../decisions/2026-09-21-free-flow-nothing-locked.md)).
- A devotee who signs in from the welcome screen and has onboarded before skips steps 1 to 5 and lands on their last practice.

## Later, not up front

Never between opening the app and chanting.

- **Backup offer** on the session-end or Progress screen after the 3rd day of practice or at 1,008 repetitions, whichever comes first. At most 3 offers in total; earlier on the web ([accounts](accounts-and-sync.md#where-sign-in-appears-p1)).
- Introduction to other chanting modes, offered gradually, one at a time.
- Suggest a [sankalpa](sankalpa-and-progress.md) after a week of practice.

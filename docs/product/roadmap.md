---
status: draft
updated: 2026-09-21
---

# Roadmap

Every feature from the brainstorm is kept ([decision](../decisions/2026-09-21-full-scope-in-phases.md)). Scope: Dharmic traditions ([decision](../decisions/2026-09-21-dharmic-traditions-scope.md)); audience: open to everyone ([decision](../decisions/2026-09-21-open-audience.md)). Each phase ships something complete for the devotee — not half of everything.

Effort tags: `easy` · `medium` · `hard`. Timelines are not set yet.

## Phase 1 — Launch: a complete daily practice

**Goal:** a devotee can install the app, pick a mantra, chant every day in several ways, and see their progress — all offline.

| Area | Features | Spec |
|---|---|---|
| Ways to chant | Mala tap `easy` · Word-by-word tap `easy` · Likhita japa typing `easy` · Silent chanting `easy` · Volume-button counting `medium` · Flip face down to pause `easy` | [chanting-modes](features/chanting-modes.md) |
| Session | Distraction-free screen · Offering moment · Opens straight to your mantra | [session-experience](features/session-experience.md) |
| Mantras | Library of 10–15 deities with audio, meaning, multi-script text · Custom mantras · Private guru mantra | [mantra-library](features/mantra-library.md) |
| Practice | Onboarding under a minute · Sankalpa programs (40-day mandala) · Gentle streaks with grace days · Daily/weekly/annual charts · Reminders incl. Brahma muhurta | [onboarding](features/onboarding.md), [sankalpa-and-progress](features/sankalpa-and-progress.md) |
| Festivals | One program done well: Navaratri | [festival-programs](features/festival-programs.md) |
| Learning | Starter articles | [content-and-learning](features/content-and-learning.md) |
| Platform | Android, iOS, web · Offline-first · Optional account sync | [platform-principles](../architecture/platform-principles.md) |

## Phase 2 — Deepen practice & all Dharmic traditions

**Goal:** welcome Sikh, Buddhist and Jain practitioners, add the headline voice feature, chanting without the phone in hand, and a year-round rhythm of festivals.

| Area | Features | Spec |
|---|---|---|
| Traditions | Sikh (Naam simran) · Buddhist · Jain (Navkar jaap) · Advisor per tradition · Tradition-aware imagery, wording and calendars | [dharmic-traditions](features/dharmic-traditions.md) |
| Ways to chant | Voice counting `hard` · Smartwatch apps `medium` · Chant along `easy` · Listening japa `easy` | [chanting-modes](features/chanting-modes.md), [wearables-and-hardware](features/wearables-and-hardware.md) |
| Dedication | Dedicate a session to someone · Anushthana programs (e.g. Gayatri 24 lakh) | [dedication-and-offering](features/dedication-and-offering.md), [sankalpa-and-progress](features/sankalpa-and-progress.md) |
| Calendar | Full festival calendar and panchang for all four traditions · Ekadashi and Pradosh reminders · Nepal festivals and calendars | [festival-programs](features/festival-programs.md) |
| Insight | Post-session reflection · Milestones · Year in review · Mode mix | [sankalpa-and-progress](features/sankalpa-and-progress.md) |
| Content | Larger library · More articles · Ambient sound | [content-and-learning](features/content-and-learning.md) |

## Phase 3 — Chant together

**Goal:** shared practice with family and community, and modes for every age.

| Area | Features | Spec |
|---|---|---|
| Shared goals | Family and friends groups · Live worldwide festival counter | [community](features/community.md) |
| Live practice | Group chanting rooms `hard` | [community](features/community.md) |
| Likhita japa | Handwriting tracing `hard` · Print and offer the japa book | [chanting-modes](features/chanting-modes.md), [dedication-and-offering](features/dedication-and-offering.md) |
| Every age | Kids mode · Seniors mode · Full accessibility | [age-modes-and-accessibility](features/age-modes-and-accessibility.md) |

## Phase 4 — Wider ecosystem

**Goal:** hardware and partners that support devotees' practice across all four traditions.

| Area | Features | Spec |
|---|---|---|
| Hardware | Bluetooth japa rings and smart malas `medium` | [wearables-and-hardware](features/wearables-and-hardware.md) |
| Partners | Temple partnerships · Dakshina donations · Teacher-led programs · Later: branded versions for temples and gurus | [partners-and-revenue](features/partners-and-revenue.md) |
| Revenue | Free core chanting always · Premium programs · No ads during a session | [partners-and-revenue](features/partners-and-revenue.md) |

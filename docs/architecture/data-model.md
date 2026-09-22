---
status: active
updated: 2026-09-22
---

# Data model

How practices, content and a devotee's own data are shaped, how counting works across practice types, and how data is stored and synced. Types live in `packages/shared/src/types` with snake_case fields, so the same shapes work on device and in Postgres.

Decisions behind this: [practice model](../decisions/2026-09-22-practice-model-ordered-steps.md), [content packs](../decisions/2026-09-22-content-packs.md), [grouped count events](../decisions/2026-09-22-grouped-count-events.md), [guest-first accounts](../decisions/2026-09-22-guest-first-accounts.md). How content is authored and delivered: [content-pipeline](content-pipeline.md).

## Overview

```text
CATALOG (read-only, from content packs)        YOUR DATA (on device; synced if signed in)

Tradition ─┬─ Deity ─┬─ parent Deity            Profile
           │         │                          CustomPractice ──┐
           │         └─< Practice >── Step[]    SavedPractice ───┤ practice_id
           │               ▲                    DeityDefault ────┤
           └─ Program ─────┘ (day → practice)   Session ─────────┤
                                                CountEvent ──────┤
                                                PracticePosition ┤
                                                Sankalpa ────────┘ (or program_id)
```

A `practice_id` is either a catalog slug (`vishnu-ashtottara`) or a custom practice's UUID. The two formats never collide.

## Catalog

Read-only on the device. Authored in `content/`, reviewed, and delivered as packs ([content-pipeline](content-pipeline.md)). Catalog ids are readable slugs and never change once published.

### Tradition

| Field                    | Notes                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `id`                     | `hindu` · `sikh` · `buddhist` · `jain`                                                             |
| `deity_label`            | What the app calls a deity: "Deity", "The Name" (Sikh), "Buddhas and Bodhisattvas", "Tirthankaras" |
| `offering_label`         | "Offer at the lotus feet", "Dedicate the merit", …                                                 |
| `default_round_size`     | 108                                                                                                |
| `show_images_by_default` | `false` for Sikh practice, which does not depict God                                               |

"Deity" is the name in code only. Nothing Hindu-specific is hard-coded ([dharmic-traditions](../product/features/dharmic-traditions.md)).

### Deity

| Field                  | Notes                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `id`                   | Slug, e.g. `vishnu`, `shailaputri`                                                           |
| `tradition_id`         |                                                                                              |
| `parent_id`            | Optional. Forms and aspects: Shailaputri → Durga → Devi. Used for browsing and the Navadurga |
| `names`                | Per language and per script                                                                  |
| `summary`              | Short description, per language                                                              |
| `image`                | Optional media reference. Licensed; hidden where the tradition says so                       |
| `suggested_mala`       | Pre-selected mala style, e.g. Rudraksha for Shiva, Tulsi for Krishna                         |
| `featured_practice_id` | Opened when the devotee has no favourite for this deity                                      |
| `sort_order`           |                                                                                              |

### Practice

Every practice is an **ordered list of steps**. One pass through the steps is one **repetition**.

| Field             | Notes                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| `id`              | Slug, e.g. `om-namah-shivaya`, `vishnu-ashtottara`                                      |
| `version`         | Bumped on any text change. The number of steps may only change with a version bump      |
| `tradition_id`    |                                                                                         |
| `kind`            | `mantra` (P1) · `namavali` (P1) · `stotra` (P2)                                         |
| `deity_ids`       | First is the primary deity. Hare Krishna is `['krishna', 'ram']`                        |
| `title`           | Per language, e.g. "Vishnu Ashtottara Shatanamavali"                                    |
| `subtitle`        | Per language, e.g. "108 names"                                                          |
| `source_script`   | Script the text was authored in: Devanagari for Sanskrit, Gurmukhi for Sikh practice, … |
| `steps`           | `Step[]`. A mantra has 1 step; an Ashtottara has 108; a stotra has one per verse        |
| `default_round`   | Repetitions per round: 108 for a mantra, 1 for a namavali (the names are the beads)     |
| `repetition_word` | Shown in the app: `japa` for a mantra, `paath` for a namavali or stotra                 |
| `intro`           | Meaning and short explanation, per language                                             |
| `audio`           | Optional media reference for the full recording                                         |
| `source`          | Where the text comes from                                                               |
| `licence`         | Licence of the text, transliteration and translation                                    |
| `review`          | `{ advisor, reviewed_on }`. Unreviewed practices never ship in production packs         |

### Step

| Field                            | Notes                                                    |
| -------------------------------- | -------------------------------------------------------- |
| `text`                           | Per script (example below)                               |
| `words`                          | Per script, for word-by-word tap. Mantras only           |
| `name`                           | Namavali only: the name itself, e.g. "Keshava"           |
| `meaning`                        | Namavali and stotra: short meaning, per language         |
| `audio_start_ms`, `audio_end_ms` | Position in the practice recording, for chant along (P2) |

Example `text` for one name in a namavali:

```text
devanagari: ॐ केशवाय नमः
iast:       oṃ keśavāya namaḥ
latin:      Om Keshavaya Namah
```

Each namavali line is stored **in full**, not built from a pattern such as "Om {name} Namah": grammatical forms and prefixes vary too much to generate reliably.

**Scripts.** The source script and IAST are the master text. `latin` (simple, common spelling such as "Om Namah Shivaya") and other Indic scripts are generated at content build time and reviewed ([content-pipeline](content-pipeline.md#transliteration)).

### Program

Catalog templates for [sankalpas](../product/features/sankalpa-and-progress.md) and [festival programs](../product/features/festival-programs.md).

| Field      | Notes                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`       | `mandala-40`, `beginner-21`, `navaratri`                                                                              |
| `kind`     | `sankalpa_template` or `festival`                                                                                     |
| `duration` | Days                                                                                                                  |
| `days`     | Optional per-day plan: `{ day, practice_id, target, reading? }`. Navaratri uses a different form of the Devi each day |

## Your data

Written on the device first. Synced only when the devotee signs in and consents ([accounts-and-sync](../product/features/accounts-and-sync.md)). Every record created by the devotee has a **UUIDv7** id generated on the device, so it works offline and sorts by time.

### Profile

One per user. Before sign-in there is a local profile; on first sign-in the account's profile wins.

| Field                  | Notes                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| `display_name`         | Optional                                                                      |
| `ui_language`          | From the phone's setting at first launch                                      |
| `primary_script`       | Script the mantra is shown in                                                 |
| `show_transliteration` | Show a second line in Latin script                                            |
| `traditions`           | Traditions to browse. P1: Hindu                                               |
| `day_start_minutes`    | When the devotee's day starts. `0` (midnight) by default; e.g. `180` for 3 AM |
| `default_mala_style`   |                                                                               |
| `haptics`, `sounds`    |                                                                               |
| `analytics_opt_in`     | `false` by default                                                            |
| `onboarded_at`         | Set when onboarding finishes. A returning user who signs in skips onboarding  |

### CustomPractice

Same shape as a catalog Practice, owned by the devotee: `kind`, `title`, `steps`, `default_round`, optional `deity_ids`, plus `is_private`, `created_at`, `updated_at`, `deleted_at`.

- **P1:** custom mantra; private guru mantra.
- **P2:** custom namavali (paste names, one per line).
- **Private guru mantra:** `is_private: true`, one step with **no text**, and only the label the devotee chooses, e.g. "My guru mantra". Word-by-word and typing are unavailable because they need the words.

### SavedPractice

The devotee's relationship with one practice. Created the first time they chant it or star it; one per practice.

| Field                      | Notes                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| `practice_id`              | Catalog slug or custom UUID                                         |
| `is_favourite`             | Starred                                                             |
| `favourite_order`          | Order in the Favourites list                                        |
| `last_used_at`             | Drives Recent and "open to your current practice"                   |
| `daily_goal`               | Repetitions per day, e.g. 324 (3 malas) or 1 recitation. Optional   |
| `round_size`               | Override. Falls back to the practice's `default_round`              |
| `mala_style`               | Override. Falls back to the profile                                 |
| `preferred_mode`           | Mode the chant screen opens in                                      |
| `offer_every`              | Repetitions between offerings: 11, 108, …; empty means end of round |
| `script`                   | Override of the profile's script                                    |
| `bell_at_meru`             |                                                                     |
| `reverse_at_meru`          | Traditional practice of not crossing the meru                       |
| `updated_at`, `deleted_at` | For sync                                                            |

**My practices** shows two lists: **Favourites** (starred, in the devotee's order) and **Recent** (chanted, not starred).

The app opens to the saved practice with the latest `last_used_at`.

### DeityDefault

`deity_id → practice_id`, one row per deity. Stored separately from SavedPractice because a practice can belong to several deities and be the default for only one of them.

- The first favourite for a deity becomes its default.
- The devotee can make any favourite the default.
- Unstarring the default hands it to the next favourite for that deity, by `favourite_order`.
- With no favourites, the deity page opens on the deity's `featured_practice_id`.

### Session

| Field                        | Notes                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| `practice_id`                |                                                                       |
| `device_id`                  |                                                                       |
| `started_at`                 | Created at the first count                                            |
| `ended_at`                   | Set when the devotee leaves the chant screen or after 30 minutes idle |
| `local_day`, `tz_offset_min` | Where the session starts                                              |
| `dedication_id`              | P2                                                                    |
| `reflection`                 | P2: stillness 1–5 and an optional note (private)                      |

### CountEvent

An append-only record of completed repetitions. **Totals are always derived from events.** Once sealed, an event never changes.

| Field           | Notes                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | UUIDv7                                                                                                                                                                        |
| `practice_id`   |                                                                                                                                                                               |
| `session_id`    |                                                                                                                                                                               |
| `mode`          | A [chanting mode](../product/features/chanting-modes.md), or `manual` / `correction`                                                                                          |
| `count`         | **Completed repetitions**. For a namavali, recitations. Positive, except for corrections                                                                                      |
| `estimated`     | True for silent pace and breath                                                                                                                                               |
| `device_id`     |                                                                                                                                                                               |
| `created_at`    | UTC. For ordering                                                                                                                                                             |
| `local_day`     | `YYYY-MM-DD`, using the devotee's `day_start_minutes` at the time. **The source of truth for which day a count belongs to**, so history doesn't move when the devotee travels |
| `tz_offset_min` | Time zone offset when the event was created                                                                                                                                   |

**Grouped, then sealed.** Taps are not stored one by one; that would be about 36 million rows a year for someone chanting a lakh a day. The current event is kept open on the device and updated in place as the devotee taps. It is **sealed** when:

- a round ends, or the mode changes;
- the session is paused or ends, or the app goes to the background;
- 60 seconds pass, or the day changes.

Only sealed events sync. An event left open by a crash is sealed on next launch, so no tap is lost.

**Manual.** `mode: 'manual'` logs practice done elsewhere: "3 malas on my own beads", "2 recitations from a book". Allowed for today and up to 7 days back; `local_day` is the chosen day. Each manual log gets its own session, so it appears in history and can be corrected like any other.

**Corrections.** `mode: 'correction'` adjusts a session by a positive or negative count, with the session's `local_day`. It fixes mistaken taps or removes a session without editing history. A correction can never make a day's net total for a practice negative.

**Listening** (P2) is counted separately and never added to the chanted total.

### PracticePosition

The devotee's place in a namavali (and, in P2, a stotra): `practice_id`, `practice_version`, `step_index`, `updated_at`. Saved after every step. It is not a count; a recitation counts only when its last step is done. If a content update changes the number of steps, the position resets and the app says why.

### Sankalpa

| Field                      | Notes                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| `title`                    |                                                                                 |
| `practice_id`              | Either this…                                                                    |
| `program_id`               | …or this, for programs with a different practice each day (Navaratri)           |
| `daily_target`             | Repetitions. Optional                                                           |
| `total_target`             | Repetitions, e.g. 2,400,000 for a Gayatri anushthana. Optional                  |
| `start_day`, `end_day`     | Local days. `end_day` is empty for open-ended sankalpas                         |
| `intention`                | Optional, private                                                               |
| `status`                   | `active` · `completed` · `released` (the gentle word for letting a sankalpa go) |
| `updated_at`, `deleted_at` | For sync                                                                        |

Progress is derived from count events for the practice (or the program's practice for each day) within the date range. Rules such as time of day or making up missed days come in P2.

### On the device only

Never synced:

- **Reminders:** a fixed time or a solar anchor (Brahma muhurta, sunrise, sunset) with an offset, days of the week, optional practice. Notifications are scheduled per device.
- **Location for sunrise times:** a city or an approximate position, used on the device only.
- **Device settings:** volume-button counting, flip to pause.
- **Open (unsealed) count events.**
- **Installed content packs and cached audio.**
- **Voice templates** (P2): never leave the device.

### Private fields

Never in analytics, sharing, community features or logs: sankalpa `intention`, custom practice text, private practice labels, and in P2 reflections and dedications.

## Counting

### Terms

| Term              | Mantra                                 | Namavali (e.g. Ashtottara)            |
| ----------------- | -------------------------------------- | ------------------------------------- |
| **Step**          | The whole mantra                       | One name                              |
| **Repetition**    | 1 step (one japa)                      | All 108 names: one recitation (paath) |
| **Round**         | 108 repetitions, or the devotee's size | 1 recitation                          |
| **Names chanted** | Repetitions × 1                        | Recitations × 108                     |

### Totals, goals and streaks

- **One count, many inputs.** Every mode adds repetitions to the same total for a practice.
- **Streak:** a day counts if its net count (after corrections) is above zero, for any practice. Grace days as in `computeStreak`. Meeting a goal is shown separately and never affects the streak.
- **Daily goal** is per saved practice. **Sankalpa targets** are per sankalpa.
- **Annual heatmap and cross-practice totals** use **names chanted**, so one Ashtottara and one mala of a mantra weigh about the same. Tapping a day shows each practice's own count.
- **Estimated** counts are included in totals and marked with "~" where shown.

Which modes each practice type supports: [chanting-modes](../product/features/chanting-modes.md#modes-by-practice-type).

## Storage and sync

### Layers

```text
features/*  (screens and hooks)
   │
apps/mobile/src/data/   repositories: the only code that touches storage
   │
Local SQLite  ── sync engine ──  Supabase Postgres (row-level security)

@japadhyan/shared       pure logic: totals, streaks, local_day, event sealing,
                        combine rules, content and export schemas (all tested)
```

### Tables by behaviour

| Behaviour                        | Tables                                                                                                 | Rule                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Never changed once sealed        | `count_events`, `sessions` (except `ended_at`)                                                         | Server inserts and ignores an id it already has. Row-level security blocks updates and deletes |
| Latest edit wins, deletions kept | `profiles`, `saved_practices`, `deity_defaults`, `custom_practices`, `practice_positions`, `sankalpas` | `updated_at` and `deleted_at` on every row; the newest edit wins                               |
| Device only                      | reminders, device settings, open events, voice templates                                               | Never synced                                                                                   |
| Catalog                          | `catalog_deities`, `catalog_practices`, `catalog_steps`, plus a full-text search index                 | Replaced when a content pack updates; read-only                                                |

Latest-edit-wins relies on device clocks. That is acceptable because these records are rarely edited, and by a person, not by background processes.

### Sync engine

Chosen by spike **S4**, which runs **before local storage is built**: PowerSync ships its own SQLite layer (op-sqlite on phones, wa-sqlite on web), so choosing it after building on expo-sqlite would mean migrating twice. S4 must show:

1. A guest's data becomes account data following the [combine rules](../product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data).
2. Two devices go offline, both keep chanting, reconnect, and totals are exact.
3. It works on the web with offline persistence.
4. Local queries update the screen live as counts change.
5. Monthly cost at 10,000 and 100,000 users.
6. How much code we have to own.

Lean: PowerSync if it passes; the offline queue, retries, web storage and live queries are exactly the fiddly parts. Fallback: our own sync, feasible because the data is append-only events plus latest-edit-wins records.

### Web

- SQLite runs in the browser. It needs **COOP/COEP headers**, so the host must allow custom headers (EAS Hosting, Cloudflare Pages and Vercel do). With COOP, OAuth sign-in on web redirects instead of opening a popup.
- expo-sqlite's web support is **alpha**: a tracked risk, with an IndexedDB store behind the same repositories as the fallback.
- A **PWA service worker** caches the app shell and core content bundle, so the site opens offline after the first visit. The app asks the browser to keep its data (`navigator.storage.persist()`).
- Articles stay statically rendered for search engines.

### Server (Supabase)

- Tables mirror the shared types, in snake_case.
- `user_id = auth.uid()` row-level security on every user table.
- `consents`: user, policy version, date agreed.
- `delete-account` Edge Function: deletes the user; their data goes with them.
- Content packs are files on a CDN, not database tables.
- Migrations live in `supabase/`.

## Changes to existing code

Nothing has shipped, so there is no data to migrate.

- `Mantra` becomes `Practice` (with `kind`, `steps`, `version`); `mantra_id` becomes `practice_id` everywhere.
- `Script` gains `iast`; `latin` means the simple common spelling.
- `ChantMode` gains `manual` and `correction`.
- `CountEvent` gains `local_day` and `tz_offset_min`. `dailyTotals` groups by `local_day` instead of converting `created_at`.
- `Sankalpa` gains `program_id`, `intention`, `status` and sync fields.
- `STARTER_MANTRAS` moves out of code into `content/`.
- `computeStreak` takes days with a positive net count.

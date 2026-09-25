---
status: active
updated: 2026-09-24
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

Read-only on the device. Authored in `content/`, reviewed, and delivered as packs ([content-pipeline](content-pipeline.md)). Catalog ids are readable slugs, lowercase letters, digits and hyphens only (`^[a-z0-9-]+$`), never shaped like a UUID (so they can't be mistaken for a custom practice's id), and never change once published.

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

| Field                  | Notes                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                   | Slug, e.g. `vishnu`, `shailaputri`                                                                   |
| `tradition_id`         |                                                                                                      |
| `parent_id`            | Optional. Forms and aspects: Shailaputri → Durga → Devi. Used for browsing and the Navadurga         |
| `names`                | Per language and per script: each language in the scripts it is written in, by hand, never generated |
| `summary`              | Short description, per language                                                                      |
| `image`                | Optional media reference. Licensed; hidden where the tradition says so                               |
| `suggested_mala`       | Pre-selected mala style, e.g. Rudraksha for Shiva, Tulsi for Krishna                                 |
| `featured_practice_id` | Opened when the devotee has no favourite for this deity                                              |
| `sort_order`           |                                                                                                      |

### Practice

Every practice is an **ordered list of steps**. One pass through the steps is one **repetition**.

| Field             | Notes                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | Slug, e.g. `om-namah-shivaya`, `vishnu-ashtottara`                                                                                                                                                                                                                                                                 |
| `version`         | Bumped on any change to the chanted text: a step's text, words or name in any script, or the number of steps. Titles, intros and meanings can be corrected without a bump. Count events store the step count they were chanted with, so history never changes. Any version change resets a saved namavali position |
| `tradition_id`    |                                                                                                                                                                                                                                                                                                                    |
| `kind`            | `mantra` (P1) · `namavali` (P1) · `stotra` (P2)                                                                                                                                                                                                                                                                    |
| `deity_ids`       | First is the primary deity. Hare Krishna is `['krishna', 'ram']`                                                                                                                                                                                                                                                   |
| `title`           | Per language, e.g. "Vishnu Ashtottara Shatanamavali"                                                                                                                                                                                                                                                               |
| `subtitle`        | Per language, e.g. "108 names"                                                                                                                                                                                                                                                                                     |
| `source_script`   | Script the text was authored in: Devanagari for Sanskrit, Gurmukhi for Sikh practice, … Never `latin`, which is generated                                                                                                                                                                                          |
| `steps`           | `Step[]`. A mantra has 1 step; an Ashtottara has 108; a stotra has one per verse                                                                                                                                                                                                                                   |
| `default_round`   | Repetitions per round: 108 for a mantra; always 1 for a namavali (the names are the beads)                                                                                                                                                                                                                         |
| `repetition_word` | Shown in the app: `japa` for a mantra, `paath` for a namavali or stotra                                                                                                                                                                                                                                            |
| `intro`           | Meaning and short explanation, per language                                                                                                                                                                                                                                                                        |
| `audio`           | Optional media reference for the full recording, with its duration                                                                                                                                                                                                                                                 |
| `source`          | Where the text comes from                                                                                                                                                                                                                                                                                          |
| `licence`         | Licence of the text, transliteration and translation                                                                                                                                                                                                                                                               |
| `review`          | `{ advisor, reviewed_on, version }`. A review covers one version: a practice whose chanted text changed since is unreviewed again. Titles, intros and meanings can change without a bump, and keep the review. Unreviewed practices never ship in production packs                                                 |

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

Which fields a step carries depends on the practice's `kind`: a mantra step may have `words` and never a `name` or `meaning`; a namavali step always has a `name` and never `words`; a stotra step has neither. `audio_start_ms` and `audio_end_ms` are set together or not at all, and only when the practice has a recording.

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

Written on the device first. Synced only when the devotee signs in and consents ([accounts-and-sync](../product/features/accounts-and-sync.md)).

### Ownership and shared fields

Every record in this section has:

| Field               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | **UUIDv7**, generated on the device, so it works offline and sorts by time. Rows unique per devotee, the profile among them, derive theirs instead ([why](#ids-for-rows-that-are-unique-per-devotee)). The profile's id is not the owner key                                                                                                                                                                                                                                                             |
| `user_id`           | The owner. Before sign-in: the **local owner id**, a UUIDv7 generated at first launch; the local profile's own id is derived from it. On first sign-in, the device's rows are combined with the account's first, and only then given the account's id, before their first upload ([order of steps](../product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data)). On the server: the Supabase auth user id, a UUID but not necessarily v7, not null. One profile per `user_id` |
| `hlc`, `deleted_at` | On records where the latest edit wins: `hlc` orders edits ([conflict rule](#conflict-rule)); `deleted_at` marks a deletion so it syncs                                                                                                                                                                                                                                                                                                                                                                   |

Uniqueness is per user: one saved practice per `(user_id, practice_id)`, one default per `(user_id, deity_id)`, one position per `(user_id, practice_id)`.

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

Same shape as a catalog Practice, owned by the devotee: `kind`, `title`, `steps`, `default_round`, optional `deity_ids`, plus `is_private`, `created_at`, `hlc`, `deleted_at`.

- **P1:** custom mantra; private guru mantra.
- **P2:** custom namavali (paste names, one per line).
- **Private guru mantra:** `is_private: true`, one step with **no text**, and only the label the devotee chooses, e.g. "My guru mantra". Word-by-word and typing are unavailable because they need the words.

### SavedPractice

The devotee's relationship with one practice. Created the first time they chant it or star it; one per practice.

| Field               | Notes                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `practice_id`       | Catalog slug or custom UUID                                                                             |
| `is_favourite`      | Starred                                                                                                 |
| `favourite_order`   | Order in the Favourites list                                                                            |
| `last_used_at`      | Drives Recent and "open to your current practice"                                                       |
| `daily_goal`        | Repetitions per day, e.g. 324 (3 malas) or 1 recitation. Optional                                       |
| `round_size`        | Mantras only. Falls back to the practice's `default_round`. A namavali's round is always one recitation |
| `mala_style`        | Override. Falls back to the profile                                                                     |
| `preferred_mode`    | Mode the chant screen opens in                                                                          |
| `offer_every`       | Repetitions between offerings: 11, 108, …; empty means end of round                                     |
| `script`            | Override of the profile's script                                                                        |
| `bell_at_meru`      |                                                                                                         |
| `reverse_at_meru`   | Traditional practice of not crossing the meru                                                           |
| `hlc`, `deleted_at` | For sync                                                                                                |

**My practices** shows two lists: **Favourites** (starred, in the devotee's order) and **Recent** (chanted, not starred).

The app opens to the saved practice with the latest `last_used_at`.

### DeityDefault

`deity_id → practice_id`, one row per deity. Stored separately from SavedPractice because a practice can belong to several deities and be the default for only one of them.

- The first favourite for a deity becomes its default.
- The devotee can make any favourite the default.
- Unstarring the default hands it to the next favourite for that deity, by `favourite_order`.
- With no favourites, the deity page opens on the deity's `featured_practice_id`.

### Session

| Field                                      | Notes                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `practice_id`                              |                                                                                                                                  |
| `device_id`                                |                                                                                                                                  |
| `started_at`                               | Created at the first count                                                                                                       |
| `ended_at`                                 | Set when the devotee leaves the chant screen, after 30 minutes idle, at the day boundary, or when the practice's content updates |
| `local_day`, `tz_offset_min`               | The one local day the session belongs to                                                                                         |
| `practice_version`, `steps_per_repetition` | The practice as it was when the session began. Every event in the session shares them                                            |
| `dedication_id`                            | P2                                                                                                                               |
| `reflection`                               | P2: stillness 1–5 and an optional note (private)                                                                                 |

**A session ends when its practice's content updates**, so every event and correction in it shares one `steps_per_repetition`. A new session starts on the new version, and the devotee sees nothing change.

**A session never crosses a local day.** At the devotee's day boundary the current session ends and a new one begins; the devotee sees nothing change. Every event and correction in a session therefore has the same `local_day`, and each session's floored net belongs to exactly one day.

### CountEvent

An append-only record of completed repetitions. **Totals are always derived from events.** Once sealed, an event never changes.

| Field                  | Notes                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | UUIDv7                                                                                                                                                                                                                        |
| `practice_id`          |                                                                                                                                                                                                                               |
| `session_id`           |                                                                                                                                                                                                                               |
| `mode`                 | A [chanting mode](../product/features/chanting-modes.md), or `manual` / `correction`                                                                                                                                          |
| `count`                | **Completed repetitions**. For a namavali, recitations. Positive, except for corrections                                                                                                                                      |
| `estimated`            | True for silent pace and breath                                                                                                                                                                                               |
| `device_id`            |                                                                                                                                                                                                                               |
| `created_at`           | UTC. For ordering                                                                                                                                                                                                             |
| `local_day`            | `YYYY-MM-DD`, using the devotee's `day_start_minutes` at the time. **The source of truth for which day a count belongs to**, so history doesn't move when the devotee travels                                                 |
| `tz_offset_min`        | Time zone offset when the event was created                                                                                                                                                                                   |
| `steps_per_repetition` | The practice's step count when chanted: 1 for a mantra, 108 for an Ashtottara. Used for names chanted, so a later content update never changes past totals. Copied from the session, which holds one value for all its events |

**Grouped, then sealed.** Taps are not stored one by one; that would be about 36 million rows a year for someone chanting a lakh a day. The current event is kept open on the device and updated in place as the devotee taps. It is **sealed** when:

- a round ends, or the mode changes;
- the session is paused or ends, or the app goes to the background;
- 60 seconds pass, or the day changes.

Only sealed events sync. An event left open by a crash is sealed on next launch, so no tap is lost.

**Manual.** `mode: 'manual'` logs practice done elsewhere: "3 malas on my own beads", "2 recitations from a book". Allowed for today and up to 7 days back; `local_day` is the chosen day. Each manual log gets its own session, so it appears in history and can be corrected like any other.

**Corrections.** `mode: 'correction'` adjusts a session by a positive or negative count, with the session's `local_day`. It fixes mistaken taps or removes a session without editing history.

- **A session's net count never goes below zero.** When totals are derived, each session's events are summed and the result is floored at zero. This holds after any merge: two offline devices could each subtract from the same session, and combined data still never goes negative. Day and practice totals are sums of session nets, so they can't go negative either.
- When creating a correction, the app limits it to the session's net count as this device sees it. If two offline devices over-correct the same session, the devotee sees the result after sync and can add a positive correction.

**Listening** (P2) is counted separately and never added to the chanted total.

### PracticePosition

The devotee's place in a namavali (and, in P2, a stotra). It is not a count.

| Field              | Notes                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `practice_id`      |                                                                                                                                                                                                                                                         |
| `practice_version` | The version the marks belong to. Any version change resets the position and `chanted_steps`, and the app says why: the saved marks may no longer match the names                                                                                        |
| `step_index`       | The name on screen                                                                                                                                                                                                                                      |
| `chanted_steps`    | Which steps have been chanted **in the current pass**: a bitset, 14 bytes for 108 names                                                                                                                                                                 |
| `pass_ordinal`     | Which recitation the marks belong to. Goes up by one when a recitation finishes. A bookmark only: totals come from count events                                                                                                                         |
| `hlc`              | Saved after every step                                                                                                                                                                                                                                  |
| `deleted_hlc`      | The `hlc` of the deletion, with `deleted_at` as its timestamp. The position **is** deleted when this is later than `hlc`; the pair is kept either way, so a revival doesn't erase it ([decision](../decisions/2026-09-22-position-deletion-barrier.md)) |

**Merging positions across devices.** Positions are compared in this order, on the device and on the server:

1. **`practice_version`** — a position saved against an older version never wins, so a content reset holds however late an old device syncs.
2. **`pass_ordinal`** — a higher one wins, so a device still on pass 4 can never bring it back over another device's pass 5. Its finished recitation is already recorded as its own count event, so nothing is lost by moving the bookmark on.
3. **Same version and same pass:** the marks are **combined**, so a name chanted on either device counts as chanted, and `step_index` comes from the higher `hlc`. Two devices in the same recitation add up instead of overwriting each other.
4. **Deletion is settled separately**, by `deleted_hlc`, and never competes with the version or the pass. A position is deleted when its `deleted_hlc` is later than its `hlc`; chanting again gives it a later `hlc` and brings it back. Settling deletion inside the ordering above is **not associative**, so devices merging the same edits in different groupings would not converge ([decision](../decisions/2026-09-22-position-deletion-barrier.md)).

**Finishing a pass is one write.** Recording the recitation and resetting `chanted_steps` happen in a single local transaction, so a crash can't do one without the other.

**A recitation counts where it was chanted.** Count events are unique by their id and nothing else is deduplicated, as everywhere else in the model. If the same devotee completes a pass on two devices while offline, they chanted the names twice, so both count. That is the same rule as chanting a mala twice on two devices, and it keeps "one count, many inputs" honest.

`pass_ordinal` is a bookmark, not a total: it says which recitation the marks belong to, and merging takes the higher one. Totals always come from count events.

**When a recitation counts.** A step is chanted when the devotee moves forward from it (tap, volume button, or chant along in P2). A recitation counts only when **every step in the pass has been chanted**, and it counts once: the pass then resets to step 1 with an empty `chanted_steps`, and back can't cross into the finished pass. Jumping from the list view moves `step_index` without marking anything. Going back and forward again re-chants a name without counting it twice.

### Sankalpa

| Field                  | Notes                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `title`                |                                                                                 |
| `practice_id`          | Either this…                                                                    |
| `program_id`           | …or this, for programs with a different practice each day (Navaratri)           |
| `daily_target`         | Repetitions. Optional                                                           |
| `total_target`         | Repetitions, e.g. 2,400,000 for a Gayatri anushthana. Optional                  |
| `start_day`, `end_day` | Local days. `end_day` is empty for open-ended sankalpas                         |
| `intention`            | Optional, private                                                               |
| `status`               | `active` · `completed` · `released` (the gentle word for letting a sankalpa go) |
| `hlc`, `deleted_at`    | For sync                                                                        |

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

Names chanted is always `count × steps_per_repetition` **as stored on each event**, never the practice's current step count.

### Totals, goals and streaks

- **One count, many inputs.** Every chanted mode adds repetitions to the same total for a practice. Listening japa (P2) is kept in its own total and never added.
- **Totals are summed per session**, with each session's net floored at zero ([corrections](#countevent)).
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

| Behaviour                        | Tables                                                                                                 | Rule                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never changed once sealed        | `count_events`                                                                                         | Server inserts and ignores an id it already has. Row-level security blocks updates and deletes                                                                                                                                    |
| Set once, then never changed     | `sessions`                                                                                             | Inserted like count events. One update is allowed: filling in an empty `ended_at`. Once set, it can't change; a column-level grant and a trigger enforce this. No deletes                                                         |
| Latest edit wins, deletions kept | `profiles`, `saved_practices`, `deity_defaults`, `custom_practices`, `practice_positions`, `sankalpas` | `hlc` and `deleted_at` on every row; the edit with the highest `hlc` wins ([conflict rule](#conflict-rule)). Positions are merged instead ([merging positions](#practiceposition))                                                |
| Device only                      | reminders, device settings, open events, voice templates                                               | Never synced                                                                                                                                                                                                                      |
| Catalog                          | `catalog_deities`, `catalog_practices`, `catalog_steps`, plus a full-text search index                 | Updated per practice when a pack changes, never wiped. A practice dropped from the catalog is kept and marked hidden, so history and saved practices keep their names ([content-pipeline](content-pipeline.md#device)). Read-only |

### Conflict rule

Records where the latest edit wins are ordered by a **hybrid logical clock** (`hlc`), not by the phone's clock alone.

- An `hlc` is the device's time in milliseconds, a counter and the device id, compared in that order.
- Every edit takes an `hlc` greater than any the device has made **or received**. Receiving records during sync moves the device's clock forward, so an edit made after seeing another edit always wins, even when the phone's clock is behind.
- Edits made offline on two devices at the same time are ordered by `hlc`, and exact ties by device id, so every device and the server settle on the same result.
- The server applies a write only if its `hlc` is higher than the stored one, whatever order uploads arrive in. Positions are the exception: the server merges them (next point). The app learns the server's time when it connects and corrects its clock offset before uploading, restamping any queued edit whose `hlc` runs ahead, in the local row and the queued upload together, so the two never disagree. The device's own too-far-ahead `hlc`s were never accepted by the server, so they stop counting towards "greater than any it has made"; every `hlc` it has received still counts. As a backstop the server drops a write more than 5 minutes ahead of its time, positions included, and answers success so the upload queue isn't blocked; a phone with a wildly wrong clock can't keep winning.
- **Namavali positions** compare `practice_version`, then `pass_ordinal`, then `hlc`, and marks within the same pass are combined ([merging positions](#practiceposition)), so neither an old version nor a finished pass can come back. On the server this is a Postgres function that runs the same merge, including deletion, but without the step-count checks, since the server has no catalog; and the device uploads the whole position row so the function sees version, pass and marks together.
- Count events and sessions don't use this rule: they are inserted by id, and an id the server already has is ignored.

### Ids for rows that are unique per devotee

Four kinds of row are unique per devotee: the profile, one saved practice per practice, one default per deity, one position per practice. Their ids are **derived from what makes them unique**, not generated — `profiles` from the devotee alone, `saved_practices` and `practice_positions` from the devotee and the practice, `deity_defaults` from the devotee and the deity.

**How the id is derived.** A [UUIDv5](https://www.rfc-editor.org/rfc/rfc9562#name-uuid-version-5) (RFC 9562, SHA-1), from one fixed namespace and a canonical name:

- **Namespace:** `49841fbe-b559-4c62-ae52-0d0611052939`, JapaDhyan's own, fixed forever.
- **Name:** UTF-8 fields joined by `:` — `v1`, the table name, the owner's `user_id`, then the key, if any:
  - `v1:profiles:<user_id>`
  - `v1:saved_practices:<user_id>:<practice_id>`
  - `v1:practice_positions:<user_id>:<practice_id>`
  - `v1:deity_defaults:<user_id>:<deity_id>`
- **Canonical fields:** `user_id` and a custom practice's UUID in lowercase hyphenated form; a catalog slug exactly as published. None can contain `:`, so the name is unambiguous.
- **One implementation:** a single function in `packages/shared`, pinned by fixed test vectors, so every client derives the same id. Before sign-in `user_id` is the local owner id, so the profile's id is derived from that and is never an input to itself; re-keying recomputes every derived id from the new `user_id`.
- **`v1` never changes once rows have synced.** A different scheme would mint different ids for existing rows, so it would be a migration, not an edit.

The profile needs this too. The account's profile wins on sign-in, but a brand-new account has none yet, so two guest devices signing in to it at about the same time would each upload their own.

A random UUIDv7 would break sync. Two devices chanting the same practice offline would each mint their own id for the same logical row, and the second one to reach the server would violate the unique constraint. A constraint violation is not a transient failure, so retrying never gets the row in, and the position merge above would never run, because the two rows never meet. PowerSync's demo connector goes further and discards the row, losing its marks silently. Ours sets it aside on the device instead, in a local-only table a later fix can replay ([S4 plan](../plans/active/2026-09-24-s4-sync-prototype.md#the-client)), but the row still never reaches the server.

Deriving the id means both devices write the same row. The server therefore **never plain-inserts** these rows: every write is an upsert on the id, through the `hlc` guard or, for positions, the merge function, so the second device's write updates the row instead of hitting the primary key. The conflict rule then decides the winner and, for positions, the server's merge combines marks within a pass as intended. Count events, sessions, sankalpas and custom practices are unconstrained — a devotee can have any number of them — so they keep generated UUIDv7 ids.

The id has to include the devotee, because the row is identified by that id alone and two devotees may save the same practice. So **every re-key recomputes these ids**, on the device, in the same step that moves the rows to their new owner. There are three: first sign-in ([signing in](../product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data)), which is safe because a guest's rows have never been uploaded, so no row on the server is left behind under the old id; keeping practice as a guest after [deleting the account](../product/features/accounts-and-sync.md#deleting-an-account-p1), where the server rows are already gone; and import, below. **Import** ([export and import](../product/features/accounts-and-sync.md#export-and-import-p1)) re-keys a file's records to the current owner, so an id derived from the file's owner would be the wrong row: it recomputes all four kinds, the profile included. Generated ids are kept as they are.

### Sync engine

Chosen by spike **S4**, which is a prerequisite for the local storage milestone in the [Phase 1 plan](../plans/active/2026-09-21-phase-1-plan.md): PowerSync ships its own SQLite layer (op-sqlite on phones, wa-sqlite on web), so choosing it after building on expo-sqlite would mean migrating twice. S4 must show:

1. A guest's data becomes account data following the [combine rules](../product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data).
2. Two devices go offline, both keep chanting, reconnect, and totals are exact.
3. It works on the web with offline persistence.
4. Local queries update the screen live as counts change.
5. Monthly cost at 10,000 and 100,000 users.
6. How much code we have to own.
7. The [conflict rule](#conflict-rule) is applied on the server (a write that applies only if newer, and the position merge for positions), not by the order uploads arrive in.

Chosen: PowerSync ([decision](../decisions/2026-09-22-sync-engine-powersync.md)); the offline queue, retries, web storage and live queries are exactly the fiddly parts. A prototype still has to show 1–3. Fallback if it fails: our own sync, feasible because the data is append-only events plus latest-edit-wins records.

### Web

- SQLite runs in the browser. It needs **COOP/COEP headers**, so the host must allow custom headers (EAS Hosting, Cloudflare Pages and Vercel do). With COOP, OAuth sign-in on web redirects instead of opening a popup.
- expo-sqlite's web support is **alpha**: a tracked risk, with an IndexedDB store behind the same repositories as the fallback.
- A **PWA service worker** caches the app shell and core content bundle, so the site opens offline after the first visit. The app asks the browser to keep its data (`navigator.storage.persist()`).
- Articles stay statically rendered for search engines.

### Server (Supabase)

- Tables mirror the shared types, in snake_case.
- Every user table has `user_id uuid not null` referencing `auth.users` **with cascade delete**, so deleting the user deletes everything they own.
- `user_id = auth.uid()` row-level security on every user table, for reading and writing. **With PowerSync** it guards writes only: the service replicates with `BYPASSRLS`, so the sync stream queries must filter downloads by `user_id` themselves, and are reviewed as security code ([decision](../decisions/2026-09-22-sync-engine-powersync.md)).
- **Links stay within one user:** `count_events (user_id, session_id)` references `sessions (user_id, id)`, so an event can't point at another user's session. The same pattern applies to any future link between user tables.
- `practice_id` is not a foreign key: it can be a catalog slug, and the catalog isn't in the database.
- `consents`: user, policy version, date agreed.
- `delete-account` Edge Function: deletes the user, which removes their data and revokes their sessions. The app checks the account each time it comes online; a deleted account fails that check and starts the [clear-device flow](../product/features/accounts-and-sync.md#deleting-an-account-p1).
- Content packs are files on a CDN, not database tables.
- Migrations live in `supabase/`.

## Changes to existing code

Nothing has shipped, so there is no data to migrate.

- `Mantra` becomes `Practice` (with `kind`, `steps`, `version`); `mantra_id` becomes `practice_id` everywhere.
- `Script` gains `iast`; `latin` means the simple common spelling.
- `ChantMode` gains `manual` and `correction`.
- `CountEvent` gains `local_day`, `tz_offset_min` and `steps_per_repetition`. `dailyTotals` groups by `local_day` instead of converting `created_at`.
- `Sankalpa` gains `program_id`, `intention`, `status` and sync fields.
- `STARTER_MANTRAS` moves out of code into `content/`.
- `totalCount` and `dailyTotals` sum each session's events and floor the session at zero before adding sessions together.
- `computeStreak` takes days with a positive net count.
- New in `shared`: hybrid logical clock helpers (create, compare, advance on receive).

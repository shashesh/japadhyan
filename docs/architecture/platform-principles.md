---
status: draft
updated: 2026-09-22
---

# Platform principles

Stack: **React Native with Expo** as a universal app (iOS, Android, web) plus native watch apps — see the [tech stack decision](../decisions/2026-09-21-tech-stack.md). These principles hold regardless.

## Targets

- **Android, iOS and web** from P1.
- **Apple Watch and Wear OS** from P2.
- One Expo Router codebase for iOS, Android and web, with native modules where needed (on-device voice counting, volume-button capture). Apple Watch in SwiftUI, Wear OS in Kotlin/Compose.

## Offline-first

- Counting, the downloaded library, sankalpas and charts work with **no connection**.
- Counts are written locally first and synced later; sync must never lose or double-count repetitions (use per-device append-only count events, merged on the server). Events are grouped and sealed, never edited ([decision](../decisions/2026-09-22-grouped-count-events.md)).
- A core content bundle ships inside the app, so it works offline from the moment it's installed; the rest of the library downloads as packs ([content-pipeline](content-pipeline.md)).
- **Web** stores data in the browser (SQLite with COOP/COEP headers) and opens offline after the first visit as a PWA ([data-model](data-model.md#web)).

## Accounts and sync

- **No account required**, ever ([decision](../decisions/2026-09-22-guest-first-accounts.md)).
- Optional account (Google, Apple, email code) to sync across devices and back up history, after explicit consent. Export and import for everyone. See [accounts-and-sync](../product/features/accounts-and-sync.md).

## Privacy

- **Voice:** audio is processed on-device only, never uploaded, not stored after the session.
- **Private guru mantras:** words never stored; only the devotee's chosen label and counts.
- **Minimal analytics**, opt-in, never including mantra text, dedications, sankalpa intentions or reflections.
- Community features (P3) are opt-in and anonymous by default.
- **Religion is sensitive data.** Which deities and mantras someone chants is special-category data under GDPR Article 9, so nothing syncs without explicit consent ([accounts-and-sync](../product/features/accounts-and-sync.md#consent-before-the-first-sync-p1)).

## Data model notes

- Core entities: `Tradition`, `Deity`, `Practice` (an ordered list of steps: mantra, namavali, stotra), `SavedPractice`, `Session`, `CountEvent`, `Sankalpa`, `Program`; later `Dedication` (P2) and `Group` (P3). Full model: [data-model](data-model.md).
- Nothing Hindu-specific hard-coded — see [dharmic-traditions](../product/features/dharmic-traditions.md).
- Multilingual UI and content; multiple calendar systems.

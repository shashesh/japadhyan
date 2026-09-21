---
status: draft
updated: 2026-09-21
---

# Platform principles

Stack: **React Native with Expo** as a universal app (iOS, Android, web) plus native watch apps — see the [tech stack decision](../decisions/2026-09-21-tech-stack.md). These principles hold regardless.

## Targets

- **Android, iOS and web** from P1.
- **Apple Watch and Wear OS** from P2.
- One Expo Router codebase for iOS, Android and web, with native modules where needed (on-device voice counting, volume-button capture). Apple Watch in SwiftUI, Wear OS in Kotlin/Compose.

## Offline-first

- Counting, the downloaded library, sankalpas and charts work with **no connection**.
- Counts are written locally first and synced later; sync must never lose or double-count repetitions (use per-device append-only count events, merged on the server).

## Accounts and sync

- **No account required** to start.
- Optional account (email, Google, Apple) to sync across devices and back up history.

## Privacy

- **Voice:** audio is processed on-device only, never uploaded, not stored after the session.
- **Private guru mantras:** words never stored; only the devotee's chosen label and counts.
- **Minimal analytics**, opt-in, never including mantra text or dedications.
- Community features (P3) are opt-in and anonymous by default.

## Data model notes

- Core entities: `Tradition`, `Mantra` (with word split, scripts, round size), `Session`, `CountEvent` (mode, count, timestamp, device), `Sankalpa`, `Program`, `Dedication`, `Group` (P3).
- Nothing Hindu-specific hard-coded — see [dharmic-traditions](../product/features/dharmic-traditions.md).
- Multilingual UI and content; multiple calendar systems.

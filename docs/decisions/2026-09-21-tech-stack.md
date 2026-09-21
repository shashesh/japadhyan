---
status: accepted
date: 2026-09-21
---

# Tech stack: React Native (Expo) vs Flutter

> **Accepted 2026-09-21:** React Native with Expo, as a universal app, plus native watch apps.

## Context

We need one codebase for **Android, iOS and web** from P1, **Apple Watch and Wear OS** from P2, and several features that lean on native capabilities. The requirements that matter most, from [platform principles](../architecture/platform-principles.md) and the [feature specs](../INDEX.md):

| Requirement                                                   | Phase | Why it matters                                                        |
| ------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| Fast, reliable tap counting with haptics                      | P1    | The core loop                                                         |
| Offline-first counts that sync without loss                   | P1    | Counting must never need the internet                                 |
| Web app + readable, searchable articles                       | P1    | Web is a full platform; articles should be findable in search engines |
| Multilingual UI, Indic scripts (Devanagari, Gurmukhi, Tamil…) | P1    | Open audience ([decision](2026-09-21-open-audience.md))               |
| Volume-button counting                                        | P1    | Hands-free chanting                                                   |
| On-device voice counting                                      | P2    | Headline feature, hardest to build                                    |
| Apple Watch + Wear OS apps                                    | P2    | Hands-free chanting                                                   |
| Real-time group rooms, live counters                          | P3    | Community                                                             |

## What is true for both options

These don't separate the two, so they shouldn't drive the choice:

- **Apple Watch needs native SwiftUI either way.** Neither Flutter nor React Native builds watchOS apps. With Expo, the watch target can live in the same repo via [expo-apple-targets](https://github.com/evanbacon/expo-apple-targets); with Flutter it's a separate Xcode target.
- **Voice counting is native either way.** It needs a small on-device audio model (custom keyword spotting from 3 sample recordings). Both frameworks can host it through a native module, with TensorFlow Lite / LiteRT or a commercial SDK such as Picovoice (check licensing costs).
- **Volume buttons are native either way.** Straightforward on Android. On iOS, Apple's official hardware-button API (`AVCaptureEventInteraction`) is meant for camera apps, so we'd rely on observing volume changes — foreground-only and imperfect regardless of framework.
- **Supabase** (auth, Postgres, realtime) works with both.

## Comparison

|                             | React Native + Expo                                                                                                                                          | Flutter                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your experience**         | ✅ Already shipping Expo SDK 57 + Supabase + TypeScript in nepally. Patterns, CI, EAS builds, docs conventions all reusable                                  | ❌ New language (Dart) and ecosystem to learn                                                                                                              |
| **Language**                | TypeScript — same as web, backend functions and shared packages                                                                                              | Dart — used only for Flutter                                                                                                                               |
| **Web app**                 | Expo Router renders the same app on web with real HTML/CSS; articles can be statically rendered for search engines. Or a separate Next.js site as in nepally | Web renders to a canvas (CanvasKit/Wasm): app-like, but larger first load and weak for searchable articles — would likely need a separate site for content |
| **Indic scripts & fonts**   | Uses each platform's native text engine — strong shaping for Devanagari, Gurmukhi, Tamil etc.                                                                | Own rendering engine; Indic shaping is good now but historically had edge cases worth testing                                                              |
| **UI feel**                 | Native components; very good                                                                                                                                 | Pixel-identical everywhere; excellent custom animation (the mala ring)                                                                                     |
| **Animation & haptics**     | Reanimated + expo-haptics — smooth enough for a bead ring                                                                                                    | Excellent out of the box                                                                                                                                   |
| **Offline-first storage**   | expo-sqlite, WatermelonDB, PowerSync, Legend-State                                                                                                           | Drift, Isar, PowerSync                                                                                                                                     |
| **Wear OS**                 | No official support — native Kotlin/Compose app                                                                                                              | Can build Wear OS apps in Flutter (community support) — a small plus                                                                                       |
| **Apple Watch**             | Native SwiftUI, same repo via expo-apple-targets                                                                                                             | Native SwiftUI, separate target                                                                                                                            |
| **On-device ML**            | Native module (LiteRT, ExecuTorch, Picovoice)                                                                                                                | Native plugin (LiteRT support expanding, Picovoice)                                                                                                        |
| **Real-time (P3)**          | Supabase Realtime JS client                                                                                                                                  | Supabase Realtime Dart client                                                                                                                              |
| **Releases & OTA updates**  | EAS Build + EAS Update (ship JS fixes without store review)                                                                                                  | Store releases; OTA via third-party (Shorebird)                                                                                                            |
| **Hiring / AI coding help** | Very large JS/TS talent pool; strong agent support                                                                                                           | Large and growing; good agent support                                                                                                                      |

## Recommendation

**React Native with Expo**, as a **universal app** (one Expo Router codebase for iOS, Android and web), plus native watch apps.

Why:

1. **You already know it.** Same stack as nepally: TypeScript, Expo, EAS, Supabase. That speed advantage outweighs anything Flutter offers here.
2. **Web matters.** Articles on naam japam should be readable and findable in search. Real HTML on web does that well; Flutter's canvas web doesn't.
3. **Indic scripts** go through each platform's native text rendering.
4. **The hard parts are native in both**, so Flutter's rendering advantages don't help with the hardest problems.

Flutter would be the better choice if the team already knew Dart, or if the app were almost entirely custom-drawn animation with no need for a content-rich web presence.

## Proposed stack

| Layer                   | Choice                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| App (iOS, Android, web) | Expo (current SDK) + Expo Router, TypeScript                                                           |
| Web articles            | Expo Router static rendering (revisit a Next.js site if content grows large)                           |
| Local storage & sync    | SQLite on device, append-only count events; sync via PowerSync or a custom Supabase sync (spike in P1) |
| Backend                 | Supabase: Postgres, auth (email, Google, Apple), storage for audio, Realtime (P3)                      |
| Haptics & animation     | expo-haptics, Reanimated                                                                               |
| i18n                    | i18next or Lingui; Noto fonts for Indic scripts                                                        |
| Apple Watch             | SwiftUI via expo-apple-targets, syncing with WatchConnectivity                                         |
| Wear OS                 | Kotlin + Compose, syncing via the Wearable Data Layer                                                  |
| Voice counting          | Native module; prototype LiteRT custom keyword spotting vs Picovoice before P2                         |
| Monorepo                | Same layout as nepally: `apps/`, `packages/shared`                                                     |

## Early validation spikes

- **Spike 1 (P1):** Expo web + Devanagari/Gurmukhi/Tamil text rendering and a smooth 108-bead ring with haptics.
- **Spike 2 (early):** voice-counting prototype on a real phone with a real chant — confirms feasibility regardless of framework.

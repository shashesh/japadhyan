# Documentation Index

> Flat list of every document in `docs/` with a one-line purpose.
> Add, move or retire a doc → update this file in the same commit.
> See [README.md](README.md) for folder conventions.

**Last verified:** 2026-09-22

## Repo root

- [../README.md](../README.md) — project overview and quick start
- [../CLAUDE.md](../CLAUDE.md) — rules for coding agents working in this repo
- [../TECH-VERSIONS.md](../TECH-VERSIONS.md) — pinned technology versions

## Guides

- [README.md](README.md) — folder guide and conventions
- [guides/setup.md](guides/setup.md) — install, run on iOS/Android/web, checks, adding packages, branches and git hooks, PR flow, CI

## Product

- [product/vision.md](product/vision.md) — who the app is for, the core loop, guiding principles
- [product/roadmap.md](product/roadmap.md) — all features grouped into four phases
- [product/open-questions.md](product/open-questions.md) — undecided: languages, pricing, content sourcing
- [product/store-listing.md](product/store-listing.md) — App Store and Google Play name, subtitle, keywords; web domains
- [product/glossary.md](product/glossary.md) — japa, mala, sankalpa, likhita japa and other terms

### Feature specs

- [product/features/chanting-modes.md](product/features/chanting-modes.md) — tap, word-by-word, typing, voice, silent, hands-free, listening
- [product/features/session-experience.md](product/features/session-experience.md) — the chanting screen and the offering moment
- [product/features/mantra-library.md](product/features/mantra-library.md) — deities and their practices (mantras, 108 names, stotras), favourites and defaults, custom and private guru mantras
- [product/features/onboarding.md](product/features/onboarding.md) — first-run flow under one minute, no account
- [product/features/accounts-and-sync.md](product/features/accounts-and-sync.md) — optional account, sign-in methods, consent, combining device data, sign-out, deletion, export
- [product/features/sankalpa-and-progress.md](product/features/sankalpa-and-progress.md) — vows and intentions, streaks, charts, milestones, reflection
- [product/features/festival-programs.md](product/features/festival-programs.md) — Navaratri, Shivratri, Janmashtami and the festival calendar
- [product/features/dedication-and-offering.md](product/features/dedication-and-offering.md) — dedicating japa, printed japa books, temple offerings
- [product/features/content-and-learning.md](product/features/content-and-learning.md) — articles, pronunciation, ambient sound
- [product/features/community.md](product/features/community.md) — family goals, festival counters, scheduled and leader-led chanting rooms
- [product/features/age-modes-and-accessibility.md](product/features/age-modes-and-accessibility.md) — kids, seniors, accessibility
- [product/features/dharmic-traditions.md](product/features/dharmic-traditions.md) — Hindu, Sikh, Buddhist, Jain: practices and sensitivities
- [product/features/wearables-and-hardware.md](product/features/wearables-and-hardware.md) — watches, volume buttons, Bluetooth rings
- [product/features/partners-and-revenue.md](product/features/partners-and-revenue.md) — temples, verified teachers, seva, donations, premium

## Architecture

- [architecture/monorepo-structure.md](architecture/monorepo-structure.md) — apps/packages layout and import rules
- [architecture/platform-principles.md](architecture/platform-principles.md) — offline-first, privacy, sync, platform targets (Expo)
- [architecture/data-model.md](architecture/data-model.md) — catalog, the devotee's data, counting rules, storage and sync
- [architecture/content-pipeline.md](architecture/content-pipeline.md) — authoring content in `content/`, building packs, delivery to devices

## Plans

- [plans/_template.md](plans/_template.md) — template for new plans
- [plans/active/2026-09-21-phase-1-plan.md](plans/active/2026-09-21-phase-1-plan.md) — Phase 1 build plan: milestones M0–M11 and early spikes

## Decisions

- [decisions/2026-09-21-devotee-first.md](decisions/2026-09-21-devotee-first.md) — build for individual devotees before temples and gurus
- [decisions/2026-09-21-full-scope-in-phases.md](decisions/2026-09-21-full-scope-in-phases.md) — keep every brainstormed feature, deliver in four phases
- [decisions/2026-09-21-collective-not-competitive.md](decisions/2026-09-21-collective-not-competitive.md) — shared goals instead of leaderboards
- [decisions/2026-09-21-dharmic-traditions-scope.md](decisions/2026-09-21-dharmic-traditions-scope.md) — Hindu, Sikh, Buddhist and Jain only
- [decisions/2026-09-21-open-audience.md](decisions/2026-09-21-open-audience.md) — open to everyone, no primary audience
- [decisions/2026-09-21-tech-stack.md](decisions/2026-09-21-tech-stack.md) — React Native (Expo) universal app + native watch apps, chosen over Flutter
- [decisions/2026-09-21-ci-only-when-ready.md](decisions/2026-09-21-ci-only-when-ready.md) — PRs open as drafts, Copilot reviews first, CI runs only once the owner marks a PR ready
- [decisions/2026-09-21-free-flow-nothing-locked.md](decisions/2026-09-21-free-flow-nothing-locked.md) — every mala, mantra and mode open from day one; nothing unlocked by progress
- [decisions/2026-09-21-app-name-japadhyan.md](decisions/2026-09-21-app-name-japadhyan.md) — the app is called JapaDhyan; domains and app identifiers
- [decisions/2026-09-22-position-deletion-barrier.md](decisions/2026-09-22-position-deletion-barrier.md) — a deleted namavali position records when it was deleted, so merging converges
- [decisions/2026-09-22-practice-model-ordered-steps.md](decisions/2026-09-22-practice-model-ordered-steps.md) — every practice is an ordered list of steps; a namavali recitation counts as one
- [decisions/2026-09-22-content-packs.md](decisions/2026-09-22-content-packs.md) — content authored in the repo, delivered as packs; small core bundled in the app
- [decisions/2026-09-22-guest-first-accounts.md](decisions/2026-09-22-guest-first-accounts.md) — no account needed; Google, Apple, email code; consent before sync
- [decisions/2026-09-22-grouped-count-events.md](decisions/2026-09-22-grouped-count-events.md) — count events grouped then sealed; corrections and manual logs are new events
- [decisions/2026-09-22-sync-engine-powersync.md](decisions/2026-09-22-sync-engine-powersync.md) — **proposed:** PowerSync on Sync Streams, over our own Supabase sync
- [decisions/2026-09-23-schema-library-zod.md](decisions/2026-09-23-schema-library-zod.md) — catalog schemas use Zod, in a strict content form and a forward-compatible export form

## Research

- [research/inspiration-sai-nama-japam.md](research/inspiration-sai-nama-japam.md) — notes on the Sai app screen that inspired this project

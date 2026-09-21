# naam-japam

> Working name. The final app name is still to be decided — see [docs/product/open-questions.md](docs/product/open-questions.md).

A devotee-first app for **naam japam** (name chanting) and mantra sadhana, for web, Android and iOS.

Devotees pick a mantra (or create their own), chant it in whichever way suits the moment — tapping a mala, tapping each word, typing, chanting aloud, or silently — and every repetition adds to one count. The app tracks daily, weekly and annual progress, supports sankalpas (vows) and festival programs such as Navaratri and Shivratri, and teaches what japa is and why it matters.

For the Dharmic traditions of India and Indo-Asia that share name chanting as a spiritual practice — Hindu, Sikh, Buddhist and Jain — starting with Hindu traditions. Open to everyone: across the Indian subcontinent, the Indian and Nepali diaspora, and spiritual seekers anywhere.

## Status

**Stage:** Phase 1 in progress — monorepo skeleton with a first working chanting screen (mala tap and word-by-word). See the [Phase 1 plan](docs/plans/active/2026-09-21-phase-1-plan.md).

## Quick start

```bash
npm install
npm run mobile   # press a (Android), i (iOS) or w (web)
npm run check    # lint + type-check + tests
```

Full setup: [docs/guides/setup.md](docs/guides/setup.md). Rules for coding agents: [CLAUDE.md](CLAUDE.md).

## Documentation

Start with the [docs index](docs/INDEX.md). Highlights:

- [Vision](docs/product/vision.md) — who this is for, and the principles behind it
- [Roadmap](docs/product/roadmap.md) — every feature, in four phases
- [Chanting modes](docs/product/features/chanting-modes.md) — the heart of the app
- [Open questions](docs/product/open-questions.md) — name, languages, pricing
- [Tech stack](docs/decisions/2026-09-21-tech-stack.md) — React Native (Expo) + native watch apps

## Repository layout

```text
apps/mobile/        Expo app — iOS, Android and web (Expo Router)
packages/shared/    platform-agnostic types, logic and constants
docs/
  INDEX.md          every doc with a one-line purpose
  README.md         folder guide and conventions
  product/          vision, roadmap, feature specs, open questions
  architecture/     platform principles, monorepo structure
  guides/           setup and how to work in the repo
  plans/            active build plans
  decisions/        dated decision records
  research/         inspiration and competitor notes
```

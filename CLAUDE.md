# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.

## Project

**naam-japam** (working name — the app name is not decided yet) is a devotee-first naam japam (name chanting) app for **iOS, Android and web**, for Hindu, Sikh, Buddhist and Jain practice, open to everyone. Stack: **React Native with Expo** (one Expo Router codebase for all three platforms), TypeScript, npm workspaces. Exact versions: [TECH-VERSIONS.md](./TECH-VERSIONS.md).

Start with [docs/INDEX.md](./docs/INDEX.md) — the map of every doc. The product vision is in [docs/product/vision.md](./docs/product/vision.md); the current build plan is in [docs/plans/active/](./docs/plans/active/).

## Git workflow

- Work on a **feature branch** (`feat/…`, `fix/…`, `chore/…`, `docs/…`) and open a PR against `main`. Don't commit directly to `main`.
- Clear, conventional commit messages.
- Never force-push `main`. Merging is the owner's call.

## Commands

```bash
npm install            # once, from the repo root
npm run mobile         # Expo dev server (press i / a / w for iOS / Android / web)
npm run web            # Expo dev server for web
npm run check          # lint + type-check + all tests — run before every PR
npm test               # tests only (Vitest in shared, Jest in mobile)
```

Add Expo packages with `npx expo install <pkg>` from `apps/mobile/`, never plain `npm install`, so versions match the Expo SDK. Expo specifics: [apps/mobile/AGENTS.md](./apps/mobile/AGENTS.md).

## Architecture rules (mandatory)

**Share business logic, keep UI separate.**

```text
UI component, screen or route?          → apps/mobile/src/
Uses a platform API (haptics, audio)?   → apps/mobile/src/
Everything else (types, logic, data)    → packages/shared/src/
```

- `packages/shared` **must not** import `react`, `react-native`, `expo-*` or any platform package (ESLint enforces this).
- Apps import from `@naam-japam/shared` — never redefine shared types or logic locally.
- Shared types use **snake_case** field names (future Supabase columns).
- Routes live in `apps/mobile/src/app/` (Expo Router). Keep route files thin; put screens in `src/features/<feature>/`.
- Styles: `StyleSheet.create()` at the bottom of the file; colours and spacing from `src/theme.ts`, no literals.

See [docs/architecture/monorepo-structure.md](./docs/architecture/monorepo-structure.md).

## Product rules that affect code

- **One count, many inputs.** Every chanting mode records `CountEvent`s; totals are always derived from events (`totalCount`), never stored as a mutable counter. This keeps offline sync safe.
- **Listening japa** is counted separately and never added to the chanted total.
- **Private guru mantras** never store their words, and are excluded from sharing, community and analytics.
- **Voice audio never leaves the device.**
- **No ads, upsells or content between opening the app and chanting.**
- **No leaderboards** — community features are shared goals.

## Docs

- Adding, moving or retiring a doc → update [docs/INDEX.md](./docs/INDEX.md) in the same commit.
- Feature behaviour → `docs/product/features/`. Decisions → `docs/decisions/YYYY-MM-DD-name.md`. Plans → `docs/plans/active/` (move to `docs/archive/` when done).
- New dependency or version bump → update [TECH-VERSIONS.md](./TECH-VERSIONS.md).

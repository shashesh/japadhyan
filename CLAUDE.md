# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository.

## Project

**JapaDhyan** ([name decision](./docs/decisions/2026-09-21-app-name-japadhyan.md); the repo is still called `naam-japam`) is a devotee-first naam japam (name chanting) app for **iOS, Android and web**, for Hindu, Sikh, Buddhist and Jain practice, open to everyone. Stack: **React Native with Expo** (one Expo Router codebase for all three platforms), TypeScript, npm workspaces. Exact versions: [TECH-VERSIONS.md](./TECH-VERSIONS.md).

Start with [docs/INDEX.md](./docs/INDEX.md) — the map of every doc. The product vision is in [docs/product/vision.md](./docs/product/vision.md); the current build plan is in [docs/plans/active/](./docs/plans/active/).

## Git workflow

- **Never commit to `master`.** Work on a feature branch (`feat/…`, `fix/…`, `chore/…`, `docs/…`) and open a PR against `master`.
- Git hooks in `.githooks/` enforce this: `pre-commit` blocks commits on `master` (and runs `npm run lint:md` when `.md` files are staged), `pre-push` blocks pushes to it. `npm install` turns them on. Never bypass them with `--no-verify`.
- **Open every PR as a draft.** On a feature branch, commit, push and open a **draft** PR against `master` without asking (`gh pr create --draft --base master`), filling in `.github/pull_request_template.md`.
- **Request Copilot's review yourself.** Right after opening the draft, run `gh pr edit <number> --add-reviewer @copilot`. Request it again after pushing fixes for its comments. Copilot does not review drafts on its own.
- **Never mark a PR ready for review.** The owner does that once every Copilot comment is resolved and the review recommends approval. Marking it ready is what starts CI.
- **GitHub Actions minutes are limited.** Draft PRs and docs-only changes run no CI ([decision](./docs/decisions/2026-09-21-ci-only-when-ready.md)). Don't re-run workflows, push empty commits or dispatch CI to test something; run `npm run check` locally instead.
- Clear, conventional commit messages.
- Never force-push `master`. Merging is the owner's call.

## Commands

```bash
npm install            # once, from the repo root
npm run mobile         # Expo dev server (press i / a / w for iOS / Android / web)
npm run web            # Expo dev server for web
npm run check          # lint (incl. Markdown) + type-check + all tests — run before every PR
npm test               # tests only (node:test for scripts/, Vitest in shared, Jest in mobile)
npm run lint:md        # markdownlint + Prettier check on every .md file
npm run format         # Prettier: fixes formatting, including Markdown tables
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
- Apps import from `@japadhyan/shared` — never redefine shared types or logic locally.
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
- Markdown is formatted by Prettier and linted by markdownlint (`.markdownlint-cli2.jsonc`). After editing `.md` files, run `npm run format` then `npm run lint:md`. Don't hand-align tables; Prettier does it.

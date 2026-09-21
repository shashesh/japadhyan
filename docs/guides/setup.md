---
status: active
updated: 2026-09-21
---

# Setup and running

## Prerequisites

- **Node.js 24** (see `.nvmrc`; 22.13+ also works) and npm 10+
- **Expo Go** on your phone for quick testing, or Android Studio / Xcode for emulators
- Windows: iOS builds need EAS Build in the cloud (no local Xcode)

## First run

```bash
npm install
npm run mobile        # then press a (Android), i (iOS, macOS only) or w (web)
```

Scan the QR code with Expo Go to run on your phone.

## Checks

```bash
npm run check         # lint + type-check + tests (run before every PR)
npm run lint
npm run type-check
npm test
```

Export the static web build:

```bash
cd apps/mobile
npx expo export --platform web   # output in apps/mobile/dist
```

## Adding packages

- App packages: from `apps/mobile/`, run `npx expo install <package>` so the version matches the Expo SDK.
- Tooling / shared: add to the relevant `package.json` and run `npm install` at the root.
- Record the version in [TECH-VERSIONS.md](../../TECH-VERSIONS.md).

## Branches and git hooks

All changes reach `master` through a pull request. Work on a feature branch (`feat/…`, `fix/…`, `chore/…`, `docs/…`).

`npm install` points git at the hooks in `.githooks/` (`git config core.hooksPath .githooks`):

- `pre-commit` refuses commits while `master` is checked out.
- `pre-push` refuses pushes to `master` on the remote.

If the commit is blocked, run `git switch -c feat/<name>`. Your uncommitted changes come with you, then commit again.

## Pull requests

1. Open the PR as a **draft**: `gh pr create --draft --base master`.
2. Request Copilot's review: `gh pr edit <number> --add-reviewer @copilot`. Request it again after pushing fixes.
3. Once every Copilot comment is resolved and the review recommends approval, the owner marks the PR **ready for review**. That starts CI.

Run `npm run check` locally before the PR is marked ready, so the first CI run is also the last.

## CI

GitHub Actions runs lint, type-check, tests and a web export on pull requests to `master` and on pushes to `master`. To save Actions minutes ([decision](../decisions/2026-09-21-ci-only-when-ready.md)):

- Draft PRs run nothing. Every job is skipped until the PR is marked ready for review.
- Turning a PR back into a draft cancels its run in progress.
- Docs-only changes skip CI.

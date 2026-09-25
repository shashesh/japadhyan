---
status: active
updated: 2026-09-24
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
npm run lint          # ESLint, then the Markdown checks
npm run lint:md       # markdownlint + Prettier check on every .md file
npm run type-check
npm test              # includes the content/ check
npm run content:validate  # check content/ alone, with file and line for each problem
npm run format        # Prettier: fixes formatting, including Markdown tables
```

### Markdown

Prettier formats Markdown and markdownlint checks the rest. The rules are in `.markdownlint-cli2.jsonc`:

- Prettier's formatting wins where the two overlap. For example, lines aren't wrapped, and tables are padded so their pipes line up.
- A few files start without a heading on purpose: the PR template, and `apps/mobile/AGENTS.md` and `CLAUDE.md`.

In VS Code, install the recommended Prettier and markdownlint extensions (`.vscode/extensions.json`). Markdown is then formatted on save, and markdownlint warnings show in the editor.

Files use LF line endings on every platform (`.gitattributes`), because Prettier writes LF. A Windows clone made before that rule may still have CRLF files that fail the Prettier check. Run `npm run format` once to fix them; git sees no changes.

## Content

```bash
npm run content:build -- --channel development   # packs and manifest in dist/content/development/
```

Commit what changes in `content-snapshot/` ([content/README.md](../../content/README.md)).

To sign a build, make a key once, then sign and verify from a **fresh clone where `npm install` never ran**. The signing script refuses to run anywhere else, so no npm package can change it before you type the passphrase ([signing](../architecture/content-pipeline.md#signing)).

```bash
git clone <repo> ../japadhyan-signing        # no npm install here, ever
cd ../japadhyan-signing
node scripts/content-sign.mjs keygen --out ~/keys/japadhyan-dev.pem   # outside any repo
node scripts/content-sign.mjs sign --key ~/keys/japadhyan-dev.pem --dir ../japadhyan/dist/content/development
node scripts/content-sign.mjs verify --public-key <printed by keygen> --dir ../japadhyan/dist/content/development
```

`keygen` asks for a passphrase of at least 20 characters; generate it in your password manager. Run `git pull` in the signing clone before signing; `sign` prints the commit it runs from. A development key is yours alone; production apps trust only the owner's keys.

## Sync stack

The sync prototype runs against a local Supabase and a self-hosted PowerSync service, both in Docker ([plan](../plans/active/2026-09-24-s4-sync-prototype.md)). You need **Docker Desktop** (or another Docker runtime) running; nothing else, and no cloud accounts.

```bash
npm run sync:up       # Supabase (supabase start) and PowerSync (powersync/docker-compose.yaml)
npm run sync:test     # pgTAP tests of the server; fails with a hint if the stack isn't up
npm run sync:reset    # empty the database and PowerSync's storage, re-apply migrations
npm run sync:down     # stop both; the database is kept until the next reset
```

| Service         | Address                                                   |
| --------------- | --------------------------------------------------------- |
| Supabase API    | `http://127.0.0.1:54321`                                  |
| Postgres        | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323`                                  |
| PowerSync       | `http://127.0.0.1:54340`                                  |

- The first `sync:up` pulls the images, which takes a few minutes. It also makes `supabase/signing_keys.json`, the ES256 key local Supabase signs tokens with, so PowerSync can check them against its JWKS. The file is gitignored, and every password in this stack is a throwaway local default.
- Migrations are in `supabase/migrations/`, tests in `supabase/tests/`. After adding a migration, run `npm run sync:reset`.
- PowerSync reads `powersync/sync-config.yaml` when it starts. After changing it, run `docker compose -f powersync/docker-compose.yaml restart powersync`. That file decides what each device downloads, and PowerSync bypasses row-level security, so review changes to it as security code.
- PowerSync is on port 54340, not its usual 8080, which other local servers often hold.
- From an Android emulator, the host's `127.0.0.1` is `10.0.2.2`.

## Web export

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

- `pre-commit` refuses commits while `master` is checked out. When `.md` files are staged, it also runs `npm run lint:md`, because CI skips docs-only changes.
- `pre-push` refuses pushes to `master` on the remote.

If a commit is blocked because you're on `master`, run `git switch -c feat/<name>`. Your uncommitted changes come with you, then commit again. If the Markdown checks block it, run `npm run format`, fix any markdownlint issues left, and commit again.

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

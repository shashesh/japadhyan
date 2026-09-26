---
status: active
updated: 2026-09-25
---

# Setup and running

## Prerequisites

- **Node.js 24** (see `.nvmrc`; 22.13+ also works) and npm 10+
- **Android Studio** for the Android SDK and emulators; Xcode for iOS, macOS only. The app uses PowerSync's native SQLite, which Expo Go doesn't include, so it runs as a [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- Windows: iOS builds need EAS Build in the cloud (no local Xcode)

## First run

```bash
npm install
npm run android --workspace=apps/mobile   # builds, installs and opens the development build
npm run web                               # the web app, in the browser
```

After the first build, `npm run mobile` starts the dev server on its own; the installed build loads from it. Build again after adding a package with native code. On Windows, set `JAVA_HOME` to Android Studio's bundled JDK (`C:\Program Files\Android\Android Studio\jbr`) and `ANDROID_HOME` to the SDK (`%LOCALAPPDATA%\Android\Sdk`). If the build fails with "Filename longer than 260 characters", the checkout's path is too deep for the `ninja` in the SDK's CMake, even with long paths enabled in Windows; build from a clone at a short path such as `C:\jd`. A `subst` drive doesn't work.

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
npm run sync:up       # Supabase and PowerSync; returns once PowerSync is replicating
npm run sync:test     # pgTAP tests of the server, then the headless devices; fails with a hint if the stack isn't up
npm run sync:reset    # empty the database and PowerSync's storage, re-apply migrations, wait for replication
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
- The stack counts as up only when PowerSync is **replicating**: Postgres has an active replication slot for it. Its health probe alone answers even when replication has failed. If `sync:test` says there is no active slot, read `docker compose -f powersync/docker-compose.yaml logs powersync`; after a dropped connection, PowerSync retries on its own within about half a minute.
- Locally PowerSync connects as `postgres`. The migration's `powersync_role` (replication, `bypassrls`, `select` on the synced tables) is for PowerSync Cloud, and gets a login and password only on the hosted database.
- PowerSync is on port 54340, not its usual 8080, which other local servers often hold.
- From an Android emulator, the host's `127.0.0.1` is `10.0.2.2`.

### Headless devices

`tools/sync-lab` runs several PowerSync clients in one Node process, each with its own database file and clock, against the local stack: two or three devices going offline, chanting and reconnecting, a guest signing in, and the server's merge checked against the device's. They use the app's own schema, connector and sign-in from `apps/mobile/src/data/powersync/`, not copies. `npm run sync:test` runs them after pgTAP; they take about a minute. They are not part of `npm test` or CI, since they need Docker.

```bash
npm run test:stack --workspace=tools/sync-lab                         # all of them
npm run test:stack --workspace=tools/sync-lab -- src/guest.test.ts   # one file
SYNC_LAB_SEED=42 npm run test:stack --workspace=tools/sync-lab -- src/mergeParity.test.ts
```

- Each test makes its own users through the admin API and deletes them afterwards. Keys come from `supabase status`; `SYNC_LAB_SUPABASE_URL`, `SYNC_LAB_PUBLISHABLE_KEY`, `SYNC_LAB_SECRET_KEY` and `SYNC_LAB_POWERSYNC_URL` point them at another stack instead.
- The files run one after another: they share the stack, and one test stops PowerSync to see a sign-in whose download fails, then starts it again.
- The merge test prints its seed on failure; `SYNC_LAB_SEED` reruns that case.

### The sync lab screen

`/dev/sync` in the app is the S4 lab: chant, mark names, go offline and online, sign in, and watch the live total against the local stack. It exists in development builds, and in a web export built with `EXPO_PUBLIC_SYNC_LAB=true` (see [Web export](#web-export)). To point the app at the stack:

```bash
npm run sync:up
npm run sync:app-env   # writes apps/mobile/.env.local, and makes the lab's test user
```

Then restart the dev server and open `/dev/sync` (on web, `http://localhost:8081/dev/sync`). The email and password fields are filled in with the lab's user, and sign-in needs the consent switch on. The Android emulator reaches the stack through `10.0.2.2`, which the app swaps in for `127.0.0.1` on Android. On native, the session is kept in memory only, so after restarting the app, sign in again before going online.

### The hosted stack

S4 also runs against PowerSync Cloud and a hosted Supabase project (`rjyddnubeqwrjbaystow`). The instance's config is in `powersync/cloud/`; it shares `powersync/sync-config.yaml` with the local stack. Two gitignored files hold what must not be committed:

- `powersync/cloud/.env.local`: `PS_DATABASE_PASSWORD`, the password of `powersync_role`, which the instance connects as. The owner keeps the real copy in a password manager.
- `tools/sync-lab/.env.cloud.local`: the hosted URLs and API keys, for the tests and `sync:app-env`. Write it from `npx supabase projects api-keys --project-ref rjyddnubeqwrjbaystow --reveal`, without printing it.

```bash
npx powersync@0.10.1 login          # once, with a personal access token from the PowerSync dashboard
npm run sync:cloud deploy           # checks, then deploys the connection, auth and sync config
npm run sync:cloud status           # connections, sync config and replication
npm run sync:test:cloud             # the harness, convergence and guest tests, against Cloud
npm run sync:app-env -- --cloud     # points the app at Cloud; `npm run sync:app-env` points it back
```

- `deploy` has no dry run: the CLI's `--validate-only` still deploys once its checks pass.
- Hosted Auth limits sign-ins. A full `sync:test:cloud` run can reach it; if the last file fails at sign-in with "Request rate limit reached", wait a few minutes and run that file again.
- After `sync:app-env`, restart Metro with `--clear`, or it may keep serving the previous backend's values.

## Web export

Export the static web build:

```bash
npm run export:web --workspace=apps/mobile   # output in apps/mobile/dist
npx expo serve apps/mobile                   # serves it on http://localhost:8081
```

`export:web` first copies PowerSync's worker and WASM into `apps/mobile/public/@powersync/` (`web:assets`, gitignored), which the export includes. It also clears Metro's cache, so the export always carries the `EXPO_PUBLIC_*` values in `.env.local` now, not those of an earlier build. To try the sync lab in the export, a production build, add `EXPO_PUBLIC_SYNC_LAB=true` to the export command.

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

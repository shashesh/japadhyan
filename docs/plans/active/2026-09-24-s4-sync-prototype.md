---
title: S4 — sync prototype on PowerSync
status: planned
created: 2026-09-24
---

# S4 — sync prototype on PowerSync

> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans to carry this out task by task. The owner accepted every [decision](#decisions) on 2026-09-24. The interfaces and test cases below are binding; the implementation is left to the task.

## Goal

We know, with evidence, whether PowerSync keeps a devotee's lifetime count safe. A guest's practice becomes account data on React Native. Two devices chanting offline reconcile to exact totals and one namavali position. The web app keeps its data offline. If any of these fails, we know which one and why before M3 builds on it.

Closes the three open criteria of the [sync engine decision](../../decisions/2026-09-22-sync-engine-powersync.md#what-the-prototype-still-has-to-show). This is spike S4 in the [Phase 1 plan](2026-09-21-phase-1-plan.md#early-spikes), which gates M3.

## Scope

- In:
  - A local stack in Docker: Supabase through its CLI, and PowerSync's self-hosted Open Edition. Everything but the last PR runs without cloud accounts
  - The real server schema for `count_events`, `sessions` and `practice_positions`: RLS, grants, the `powersync` publication and the position merge function. It is kept and grows into M10
  - The Sync Streams config, in the repo
  - Codecs in `packages/shared` between the domain types and table rows, and the derived ids ([data-model](../../architecture/data-model.md#ids-for-rows-that-are-unique-per-devotee)), which the position tests need
  - Headless tests where two or three PowerSync clients act as devices: offline, chanting, reconnecting
  - Correcting a device's clock offset before positions upload ([clock offset](#clock-offset)), since positions carry an `hlc` and the server drops one that runs ahead
  - PowerSync in `apps/mobile` behind a dev-only screen, on Android, iOS if possible, Chrome and Safari, with a guest who signs in
  - A last pass against PowerSync Cloud (free plan) and a hosted Supabase project
  - A results write-up, and the docs that change because of it
- Out:
  - Tables where the latest edit wins (profiles, saved practices, deity defaults, custom practices, sankalpas), and their `hlc` guard. They reuse the clock offset correction that S4 builds for positions. They are the documented pattern ([decision](../../decisions/2026-09-22-sync-engine-powersync.md#against-the-seven-criteria), criterion 7) and come with M10
  - Real sign-in methods (Google, Apple, email codes), the consent screen and `consents`: the prototype signs in with email and password against test users, and consent is a flag
  - Repositories, the real chant screen on PowerSync, and the catalog tables (M3)
  - The PWA service worker, so the site opens offline after the first visit (M10). This prototype shows the **data** survives offline, not the app shell
  - Sign-out and account deletion flows, apart from checking `disconnectAndClear` keeps guest tables
  - Any data-hosting cost fix ([decision](../../decisions/2026-09-22-sync-engine-powersync.md#design-consequences-to-settle-before-m3))

## Decisions

All accepted by the owner on 2026-09-24, as proposed. Those marked **spec change** amend [data-model.md](../../architecture/data-model.md), and the amendment lands in the same PR as the code.

1. **Local first, cloud last.** PRs 1–4 run on a local stack: `supabase start`, plus `journeyapps/powersync-service` 1.26.1 (Open Edition, GA) with Postgres bucket storage, in Docker. PowerSync publishes this setup as its [self-host demo](https://github.com/powersync-ja/self-host-demo/tree/main/demos/supabase). The tests then need no accounts, cost nothing, and can be reset in seconds. Only PR 5 needs the owner to create a PowerSync Cloud instance on the free plan and a Supabase project. PR 5 checks what the local stack can't: Cloud reaching Supabase over IPv6, deploying the sync config with the CLI, and Safari over HTTPS.
2. **Only three tables, but the real ones.** `count_events`, `sessions` and `practice_positions` carry every column in the data model, with the RLS, grants and constraints the [server section](../../architecture/data-model.md#server-supabase) asks for. They are what criteria 1 and 2 are about, and M10 keeps them rather than rewriting a toy schema.
3. **Two devices, tested headlessly.** `@powersync/node` 1.1.0 (GA) runs several clients in one test process, each with its own database file. `disconnect()` takes a device offline; writes queue locally until `connect()`. The tests live in a new `tools/sync-lab` workspace and run with `npm run sync:test`, beside pgTAP tests of the SQL (`supabase test db`). Neither runs in `npm test` or CI, since both need Docker. PowerSync has no published example of this ("coming soon"), so PR 3 is also where we find out whether it works.
4. **How values are stored** (spec change). PowerSync columns are `text`, `integer` or `real`, so:
   - **`hlc` is one fixed-width text value**: `<millis, 15 digits>:<counter, 10 digits>:<device_id>`. Byte order equals `compareHlc` order, so SQLite and Postgres compare it with a plain `>`. In Postgres the column is `text collate "C"`. Other collations ignore punctuation and would order it wrongly. `device_id` is restricted to `^[a-z0-9-]+$`, so byte order and JavaScript's string order agree.
   - **`chanted_steps` is lowercase hex text**, 28 characters for 108 names, the same on the device and in Postgres.
   - **Booleans** are `0`/`1` on the device, which is how PowerSync syncs a Postgres `boolean`, and `boolean` in Postgres. **Timestamps** are ISO strings on the device and `timestamptz` in Postgres. The codecs accept PowerSync's `YYYY-MM-DD HH:MM:SS.sssZ` form and normalise it.
   - All of it lives in `packages/shared`, so the app, the Node tests and the connector share one codec.
5. **Derived ids come forward from M3.** `derivedId` in `packages/shared` implements the data model's UUIDv5 scheme. SHA-1 comes from `@noble/hashes`, pure JavaScript with no dependencies, because React Native has no `crypto.subtle` and `packages/shared` can't import a platform package. Test vectors come from Python's `uuid.uuid5` and from Postgres's `uuid_generate_v5`, two independent implementations. The server's merge function **refuses a position whose id isn't derived from its `user_id` and `practice_id`**, so the rule that keeps one position per practice is enforced on the server, not just trusted. Re-keying on sign-in uses it. The rest of the M3 item stays in M3: the other derived-id tables, re-keying after account deletion, and import.
6. **Positions upload through a merge function, as whole rows read at upload time.** For a `practice_positions` operation, the connector reads the row's **current local state** by id and sends it whole to `rpc('merge_practice_position', { row })`. It doesn't use `opData`, which holds only the changed columns. PowerSync has no option to upload the full row. The merge is a semilattice (commutative, associative and idempotent), so sending a later local state, or one the server already has, is harmless. This avoids `trackPrevious`, whose `previousValues` the docs don't promise holds every column. Count events and sessions are upserted with `ignoreDuplicates`, so an id the server already has is ignored.
7. **A guest keeps their practice in local-only tables.** This is PowerSync's documented recipe: each synced table has a `localOnly` twin, and `viewName` points the app's queries at one or the other. On sign-in, `updateSchema` switches the views while disconnected, then the rows are copied across. The recipe is shown only for React web, so running it on React Native is part of what we're testing. A local-only `device_state` table keeps the local owner id, the device id and the current mode, so no extra storage package is needed. **Rejected: Supabase anonymous sign-in** at first launch. It would avoid the copy, but it creates a server account before the devotee has asked for one or consented, and it needs the network on first launch. Guest data never leaves the device ([accounts-and-sync](../../product/features/accounts-and-sync.md#guest-first-p1)).
8. **Sign-in follows the documented order**, as far as the prototype can ([order of steps](../../product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data)):
   1. seal the open event;
   2. consent (a flag here). Without it, stop before anything else: no `updateSchema`, no `connect`, nothing downloaded or uploaded, and the device stays a guest ([consent before the first sync](../../product/features/accounts-and-sync.md#consent-before-the-first-sync-p1)). `signInAndCombine` checks the flag itself, so a caller that skips the consent screen can't sync;
   3. `updateSchema` to the synced views, while still disconnected;
   4. `connect`, then wait until the account has downloaded completely. The guest's rows are still under the inactive local views, so nothing uploads yet;
   5. in one write transaction: re-key the guest's rows to the account, recompute derived ids, and merge any position that collides with one the account already has, using `mergePositions`. Then clear the local tables.

   The copied rows join the upload queue like any other write.

9. **The app side lives in `apps/mobile`, not in a separate app.** Criterion 3 is about _our_ Metro config and static export, and M3 builds in the same place. The database, schema and connector go in `src/data/powersync/`; the test screen goes in `src/features/sync-lab/`, on a route that exists only in development builds. The cost: Expo Go stops working for the whole app, and development moves to dev builds. The PowerSync decision already accepted that cost. If the prototype fails, PR 4 is reverted.
10. **Keep `web.output: 'static'`.** Articles need it for search engines. PowerSync's only web demo uses `'single'`, and static rendering runs our modules in Node at build time. So the web database is created **lazily, on the client only**, never at module scope. `copy-assets` writes the worker and WASM files into `apps/mobile/public/@powersync/`. That folder is gitignored, and the `web` and `export:web` scripts regenerate it. Storage uses `OPFSCoopSyncVFS`, which PowerSync recommends for Safari; IndexedDB is compared in Safari too. COOP/COEP headers are not needed: only an experimental PowerSync mode uses them. The [web section](../../architecture/data-model.md#web) says they are, which PR 6 corrects.
11. **Results go in a research doc**, `docs/research/2026-MM-DD-s4-sync-prototype.md`: what passed, what didn't, timings and surprises. The [sync engine section](../../architecture/data-model.md#sync-engine), the [web section](../../architecture/data-model.md#web) and the Phase 1 plan are updated to match. If a criterion fails, the fallback gets a new decision record, as the current one requires.

## Design

### The local stack

```text
tools/sync-lab tests (Node)          apps/mobile (emulator, browser)
  device A ─┐  device B ─┐              │
   @powersync/node        │   @powersync/react-native · @powersync/web
            ▼             ▼             ▼
      PowerSync service 1.26.1 (Docker, port 8080)  ◄─ powersync/sync-config.yaml
            │  logical replication (publication "powersync")
            ▼
      Supabase local (supabase start): Postgres 17, Auth, PostgREST via Kong (port 54321)
            ▲
            └── uploads: supabase-js → PostgREST (RLS) → tables and merge_practice_position()
```

The PowerSync container joins the `supabase_network_japadhyan` Docker network and reads the database as `supabase_db_japadhyan:5432`. It checks client JWTs against Supabase's JWKS through Kong. This follows the self-host demo; generate the files with the PowerSync CLI (`powersync init self-hosted`, then `powersync docker configure --database external --storage postgres`) rather than writing them by hand. Emulators reach the host as `10.0.2.2`.

### Tables

`supabase/migrations/<timestamp>_sync_core.sql`. Every table has `user_id uuid not null references auth.users on delete cascade`.

| Table                | Columns beyond `id`, `user_id`                                                                                                                                                                                                                                                                                                                                                                                     | Writes allowed (RLS, `user_id = auth.uid()`)                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`           | `practice_id text`, `device_id text`, `started_at timestamptz`, `ended_at timestamptz null`, `local_day date`, `tz_offset_min int`, `practice_version int`, `steps_per_repetition int`; unique `(user_id, id, practice_id, local_day, steps_per_repetition)`                                                                                                                                                       | Insert. Update of `ended_at` only, and only while it is null: a column grant plus a trigger. No delete                                                                                                                  |
| `count_events`       | `practice_id`, `session_id uuid`, `mode text` (a `ChantMode`), `count int` (positive; a correction's is non-zero), `estimated boolean`, `device_id`, `created_at timestamptz`, `local_day date`, `tz_offset_min`, `steps_per_repetition`; FK `(user_id, session_id, practice_id, local_day, steps_per_repetition)` → `sessions`, so an event is in its owner's session and copies its practice, day and step count | Insert only                                                                                                                                                                                                             |
| `practice_positions` | `practice_id`, `practice_version int`, `step_index int`, `chanted_steps text`, `pass_ordinal int`, `hlc text collate "C"`, `deleted_hlc text collate "C" null`, `deleted_at timestamptz null`, both set or both null; unique `(user_id, practice_id)`                                                                                                                                                              | Select only. Writes go through `merge_practice_position(row jsonb)`, which is `security definer` with an empty `search_path` and checks `user_id = auth.uid()` itself, so `authenticated` has no insert or update grant |

Grants go to `authenticated` explicitly: from 2026-10-30, Supabase stops exposing tables to its Data API without them. `config.toml` sets `auto_expose_new_tables = false`, and the migration revokes Supabase's default privileges, so a later table or function is closed until a migration grants it. The migration creates `publication powersync for table sessions, count_events, practice_positions`, never `for all tables`. It also creates `powersync_role`, the role PowerSync Cloud connects as: `REPLICATION` (to open the logical replication slot) and `BYPASSRLS`, with `select` on these three tables only. The migration creates it `NOLOGIN` with no password, because no password belongs in the repo. On the hosted database the owner gives it `LOGIN` and a password (PR 5). The local PowerSync service connects as `postgres`, which already has `REPLICATION`, `BYPASSRLS` and `LOGIN`.

### The merge function

`public.merge_practice_position(row jsonb) returns void` applies the [position rule](../../architecture/data-model.md#practiceposition), without the step-count checks, since the server has no catalog. It is `security definer`, so it bypasses RLS and must guard itself:

- **`set search_path = ''`, and every name is schema-qualified**: `public.practice_positions`, `public.merge_position_rows`, `auth.uid()`, and `extensions.uuid_generate_v5`. The migration runs `create extension if not exists "uuid-ossp" with schema extensions`.
- **Only signed-in users can call it**: `revoke execute … from public, anon`, `grant execute … to authenticated`.

The steps:

1. **`auth.uid()` is null, or differs from `user_id`: raise** `42501`. This comes first, because `null <> x` is null, not true, so a plain comparison would let a caller with no user through. The connector treats `42501` as a permanent failure. It can only be a bug or an attack, never a stale write.
2. **Drop with success** (return; no error, so the upload queue isn't blocked) when:
   - the row is malformed: a missing field, the wrong type, `hlc` not in the text form, or `deleted_hlc` set but not in the text form (a live position's `deleted_hlc` is null, which is valid), a `deleted_hlc` without its `deleted_at` or the reverse, `chanted_steps` not lowercase hex, or a negative `step_index`, `pass_ordinal` or `practice_version`. No valid row has a negative `step_index`, deleted or not, and the device's row codec rejects one too. What only live rows are checked for is the **upper** bound, the step count, which the server can't know;
   - `practice_id` isn't canonical: a catalog id (`^[a-z0-9-]+$`, not shaped like a UUID) or a lowercase hyphenated UUID. Otherwise `Custom-UUID` and `custom-uuid` would derive two ids for one practice;
   - `id` isn't `extensions.uuid_generate_v5('49841fbe-b559-4c62-ae52-0d0611052939', 'v1:practice_positions:' || user_id || ':' || practice_id)`;
   - `hlc` or `deleted_hlc` is more than 5 minutes ahead of `now()`. This is a backstop against a wildly wrong clock: the device corrects its offset and restamps before uploading ([clock offset](#clock-offset)), so an honest edit never reaches it.
3. `insert … on conflict (id) do nothing`, then `select … for update` the stored row, so two uploads for the same id at once serialise.
4. Merge as `mergePositions` does: the higher generation (`practice_version`, then `pass_ordinal`) wins. Within one generation:
   - the marks are OR-ed byte by byte, the shorter padded with zeros. Honest rows in one generation share a step count and so a length. The server can't check the step count, and choosing between two lengths pair by pair would make the result depend on arrival order;
   - `step_index` comes from the higher `hlc`, ties broken by `step_index`.

   Deletion is settled separately, by the later `deleted_hlc`, carried with its `deleted_at`.

5. Update the row.

A pure `public.merge_position_rows(a, b)` holds step 4, so the pgTAP tests call it directly.

`public.server_now() returns timestamptz` returns `now()`, so a device can learn the server's time. `authenticated` may execute it; `anon` may not.

### Clock offset

Positions are ordered within a generation by `hlc`, and the server drops one more than 5 minutes ahead of its time, answering success. On its own, that would lose edits: a phone whose clock runs fast would keep its marks locally, see the upload succeed, then have the row overwritten by the server's at the next checkpoint. So S4 builds the offset correction the [conflict rule](../../architecture/data-model.md#conflict-rule) describes, for positions. M10 reuses it for the tables where the latest edit wins.

- **Learn the server's time on connect.** `fetchCredentials` calls `rpc('server_now')` and stores `clock_offset_ms`, the server's time minus the midpoint of the request, in `device_state`. If the call fails, `fetchCredentials` fails, so no upload ever runs without a known offset.
- **New edits use the corrected time:** `issueHlc(last, Date.now() + clock_offset_ms, device_id)`. As the conflict rule says, the device's own `hlc`s that ran too far ahead stop counting towards `last`; every `hlc` it has received still counts. Otherwise one fast edit would keep every later edit fast too.
- **Queued edits are restamped before they upload.** Before sending a position, the connector compares the local row's `hlc` and `deleted_hlc` with the corrected time. If either runs more than 60 seconds ahead, **both** (when both are set) get new clocks from the corrected time, issued in their original order, in one write transaction. Restamping only one could move it to the other side of the other, so a deleted position would come back or a live one would vanish. This way a deleted position stays deleted, and a live one stays live. The row is then sent as decision 6 says. Because the connector sends the row as it is at upload time, restamping the local row is enough; no queued payload has to be kept in step. The restamp queues one more `PATCH` for the row, which the idempotent merge absorbs.
- The 60-second margin leaves room inside the server's 5 minutes for the round trip that measured the offset.

### The sync config

`powersync/sync-config.yaml`, reviewed as security code, because PowerSync reads with `BYPASSRLS` ([decision](../../decisions/2026-09-22-sync-engine-powersync.md#accepted-costs)):

```yaml
config:
  edition: 3
streams:
  my_practice:
    auto_subscribe: true
    queries:
      - SELECT * FROM sessions WHERE user_id = auth.user_id()
      - SELECT * FROM count_events WHERE user_id = auth.user_id()
      - SELECT * FROM practice_positions WHERE user_id = auth.user_id()
```

### The client

```text
apps/mobile/src/data/powersync/
  schema.ts       synced tables + localOnly twins + device_state + upload_failures;
                  makeSchema(mode)
  database.ts     openDatabase(): native (op-sqlite) or web (WASQLite, OPFSCoopSyncVFS),
                  created lazily; never at module scope
  connector.ts    SupabaseConnector: fetchCredentials (also learns the clock offset),
                  uploadData (decision 6; restamps positions that run ahead)
  signIn.ts       signInAndCombine(db, supabase, credentials, { consented }): decision 8;
                  rejects before signing in unless consented is true
apps/mobile/src/features/sync-lab/SyncLabScreen.tsx
apps/mobile/src/app/dev/sync.tsx   route; redirects home unless __DEV__
```

`connector.ts` and `signIn.ts` import only `@powersync/common` types and `@japadhyan/shared`, so the Node tests import the **same files** rather than a copy. `tools/sync-lab` reaches them through a relative import or a path alias; don't duplicate them.

The upload rules (decision 6), per operation:

| Table                | `PUT`                                                  | `PATCH`                                              | `DELETE`                               |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------- |
| `count_events`       | `upsert(row, { onConflict: 'id', ignoreDuplicates })`  | Never happens; set aside                             | Never happens; set aside               |
| `sessions`           | Same                                                   | `update({ ended_at }).eq('id').is('ended_at', null)` | Never happens; set aside               |
| `practice_positions` | `rpc('merge_practice_position', { row: <local row> })` | Same                                                 | Never happens (soft delete); set aside |

**A permanent failure is set aside, never discarded.** PowerSync's demo discards a transaction on any class `22` or `23` error, or on `42501`, but class 23 includes `23503`, a foreign key violation. A count event whose session never reached the server would then vanish from the lifetime count. Retrying forever is no better: the transaction would block every upload behind it. So on those codes the connector records each of the transaction's operations in a local-only `upload_failures` table (table, op, id, error code, and the **payload it sent**), then completes it. The payload is what the table above sends, so it can be sent again as it is: for a position, the whole local row read at upload time, never `opData`, which holds only the changed columns and would lose the generation and the full marks; for a count event, the whole row; for a session's `PATCH`, its `ended_at`. The data stays on the device, the dev screen shows it, and a later fix can replay it. A position the server drops for running ahead never reaches this path, since the server answers success; the [clock offset](#clock-offset) correction is what keeps those edits. Logs carry the table, id and code, never the data, because a practice id reveals religion. Any other error is thrown, so the upload retries.

## File structure

| File                                                                                      | Responsibility                                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/shared/src/logic/derivedId.ts` (+ test)                                         | `uuidv5`, `derivedId`, `DERIVED_ID_NAMESPACE`                                            |
| `packages/shared/src/logic/hlcText.ts` (+ test)                                           | `hlcToText`, `hlcFromText`                                                               |
| `packages/shared/src/logic/marks.ts` (+ test)                                             | Gains `marksToHex`, `marksFromHex`                                                       |
| `packages/shared/src/logic/rows.ts` (+ test)                                              | Row types and codecs for the three tables; `toServerRow`                                 |
| `supabase/config.toml`, `supabase/migrations/*_sync_core.sql`                             | Local Supabase; the three tables, RLS, grants, publication, merge function, `server_now` |
| `supabase/tests/*.test.sql`                                                               | pgTAP: RLS, sessions rule, merge, derived-id vectors, publication                        |
| `supabase/seed.sql`                                                                       | Nothing user-specific; test users are made by the tests                                  |
| `powersync/` (`service.yaml`, `sync-config.yaml`, `cli.yaml`, compose)                    | The self-hosted service and the sync config                                              |
| `tools/sync-lab/` (`package.json`, `vitest.config.ts`, `src/*.test.ts`, `src/harness.ts`) | Headless devices: harness, convergence, guest sign-in, merge parity                      |
| `apps/mobile/src/data/powersync/*`                                                        | As above                                                                                 |
| `apps/mobile/src/features/sync-lab/SyncLabScreen.tsx`, `src/app/dev/sync.tsx`             | The dev screen                                                                           |
| `apps/mobile/metro.config.js`                                                             | PowerSync's per-platform `resolveRequest`                                                |
| `docs/research/2026-MM-DD-s4-sync-prototype.md`                                           | Results                                                                                  |

## Tasks

Six PRs, each a draft against `master` and each passing `npm run check` locally. PRs 2–4 also pass `npm run sync:test` on the local stack.

### PR 1 — codecs and derived ids in `packages/shared`

#### Task 1: UUIDv5 and derived ids

**Files:** `packages/shared/src/logic/derivedId.ts`, `derivedId.test.ts`; export from `logic/index.ts`; `@noble/hashes` 2.4.0, exact pin, in `packages/shared`.

```ts
export const DERIVED_ID_NAMESPACE = '49841fbe-b559-4c62-ae52-0d0611052939';
export type DerivedIdKey =
  | { table: 'profiles'; user_id: string }
  | { table: 'saved_practices' | 'practice_positions'; user_id: string; practice_id: string }
  | { table: 'deity_defaults'; user_id: string; deity_id: string };
export function uuidv5(namespace: string, name: string): string;
export function derivedId(key: DerivedIdKey): string;
```

- [ ] Failing tests:
  - `uuidv5 matches RFC 9562's example`: DNS namespace, `www.example.com` → `2ed6657d-e927-568b-95e1-2665a8aea6a2`
  - `fixed vectors for every table`, with `user_id` `0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79` (computed with Python's `uuid.uuid5`):

    | Key                                                                          | Id                                     |
    | ---------------------------------------------------------------------------- | -------------------------------------- |
    | `profiles`                                                                   | `5f3f3ea9-d129-519e-91e7-f196cf5b1932` |
    | `saved_practices`, `vishnu-ashtottara`                                       | `f9c3fac2-3d48-5c09-85aa-5b0b70e1f09b` |
    | `practice_positions`, `vishnu-ashtottara`                                    | `7f64746d-3241-5ed7-a7b0-cfa9400cad6f` |
    | `practice_positions`, custom practice `0192a4b1-0000-7000-8000-000000000001` | `fe7cb732-65ef-5a60-80e9-a6ea0a67bd85` |
    | `deity_defaults`, `vishnu`                                                   | `beb30173-fed0-53ad-aec7-992a9617c77d` |

  - `rejects a user_id that isn't a lowercase hyphenated UUID`: uppercase, no hyphens, and empty all throw
  - `rejects a practice_id that is neither a catalog slug nor a lowercase UUID`, and `a deity_id that isn't a catalog slug`
  - `different owners give different ids for the same practice`
- [ ] Run `npm test --workspace=packages/shared`. They fail.
- [ ] Implement. `uuidv5` hashes the namespace's 16 bytes followed by the UTF-8 name, then sets the version (`5`) and variant bits as RFC 9562 §5.5 says.
- [ ] Run the tests, then `npm run check`. Commit: `feat(shared): derived ids for rows unique per devotee`.

#### Task 2: `hlc` as text, marks as hex

**Files:** `packages/shared/src/logic/hlcText.ts`, `hlcText.test.ts`, `marks.ts`, `marks.test.ts`.

```ts
export function hlcToText(hlc: Hlc): string; // '000001727190000:0000000003:device-a'
export function hlcFromText(text: string): Hlc;
export function marksToHex(marks: Uint8Array): string;
export function marksFromHex(hex: string): Uint8Array;
```

- [ ] Failing tests:
  - `hlc text round-trips`
  - `text order matches compareHlc`: property test in the style of `position.properties.test.ts`, over clocks that tie on `millis`, on `counter`, and on both
  - `rejects millis beyond 15 digits, a negative or fractional counter, and a device_id outside [a-z0-9-]`
  - `hlcFromText rejects malformed text`: wrong widths, a missing part, extra `:`
  - `marks hex round-trips; 108 names is 28 characters`
  - `marksFromHex rejects odd length, uppercase and non-hex`
- [ ] Implement, run the tests, commit: `feat(shared): text forms for hlc and marks`.

#### Task 3: row codecs

**Files:** `packages/shared/src/logic/rows.ts`, `rows.test.ts`.

```ts
export interface CountEventRow {
  /* CountEvent's fields; estimated: 0 | 1 */
}
export interface SessionRow {
  /* Session's fields */
}
export interface PracticePositionRow {
  /* chanted_steps, hlc, deleted_hlc as text */
}
export function countEventToRow(e: CountEvent): CountEventRow;
export function countEventFromRow(row: unknown): CountEvent; // validates with Zod
export function sessionToRow(s: Session): SessionRow;
export function sessionFromRow(row: unknown): Session;
export function positionToRow(p: PracticePosition): PracticePositionRow;
export function positionFromRow(row: unknown): PracticePosition;
export type SyncedTable = 'count_events' | 'sessions' | 'practice_positions';
export function toServerRow(
  table: SyncedTable,
  row: Record<string, unknown>,
): Record<string, unknown>; // 0/1 → boolean
```

- [ ] Failing tests:
  - `each record round-trips through its row`
  - `fromRow accepts PowerSync's timestamp form and returns ISO`: `2026-09-24 05:30:00.000Z` → `2026-09-24T05:30:00.000Z`
  - `fromRow accepts estimated as 0 or 1 (PowerSync) or a boolean (PostgREST)`
  - `fromRow rejects a missing field, a wrong type, estimated of any other value, a count that isn't positive (a correction's may be negative, never 0), a deleted_hlc without its deleted_at or the reverse, and a position practice_id that isn't a catalog slug or a lowercase UUID`: the server refuses or drops each of these
  - `toServerRow turns estimated into a boolean and leaves other tables' rows unchanged`
- [ ] Implement, run the tests, commit: `feat(shared): row codecs for synced tables`.

#### Task 4: docs for PR 1

- [ ] [data-model.md](../../architecture/data-model.md): how `hlc`, marks, booleans and timestamps are stored (decision 4), and that `derivedId` exists. TECH-VERSIONS: `@noble/hashes`. `npm run format`, `npm run lint:md`.
- [ ] Commit: `docs: how synced values are stored`. Push, draft PR, request Copilot.

### PR 2 — the local stack and the server

#### Task 5: local Supabase and PowerSync

**Files:** `supabase/`, `powersync/`, root `package.json`, `docs/guides/setup.md`, `.gitignore`.

- [ ] Add dev dependencies at the root, exact pins: `supabase` 2.117.0 and `powersync` 0.10.1 (the CLIs).
- [ ] `npx supabase init`; project id `japadhyan`. In `config.toml`, email confirmations stay off (the local default) and `auto_expose_new_tables = false`. Generate an ES256 signing key with `supabase gen signing-key --algorithm ES256 --append`, into a gitignored file, as the self-host demo does.
- [ ] `npx powersync init self-hosted`, then `npx powersync docker configure --database external --storage postgres`. Point the **source** at `supabase_db_japadhyan`, with `client_auth` using Supabase's JWKS through Kong and audience `authenticated`. Pin the image to `journeyapps/powersync-service:1.26.1`.
- [ ] Bucket storage is a **separate** Postgres container, as in the self-host demo, never the Supabase database: a `pg-storage` service in the compose file, `PS_STORAGE_SOURCE_URI` pointing at it, and the PowerSync service depending on it being healthy. Check that the generated compose file has all three, and add whatever is missing.
- [ ] Root scripts: `sync:up` (`supabase start`, then `powersync docker start`, which waits until healthy), `sync:down`, `sync:reset` (`supabase db reset` then restart PowerSync, since each reset drops the replication slot).
- [ ] A stack check, shared by `sync:up` and `sync:test`, counts the stack as up only once replication works: PowerSync's liveness probe answers, **and** Postgres has an active logical replication slot for PowerSync (`pg_replication_slots`, `active`). A liveness probe alone passes even when the service can't replicate. The stack check names which part is missing. The root `npm run check` never calls it: `check` stays the lint, type-check and test gate that runs without Docker.
- [ ] Run `npm run sync:up` and confirm it reports replication running. Commit: `chore: local Supabase and PowerSync stack`.

#### Task 6: the three tables

**Files:** `supabase/migrations/<ts>_sync_core.sql`, `supabase/tests/sync_core.test.sql`.

- [ ] Failing pgTAP tests (`npx supabase test db`), each run as a user through `set local role authenticated` and `request.jwt.claims`:
  - `a user reads only their own rows`, on every table
  - `a user inserts only their own rows`, into `sessions` and `count_events`. `practice_positions` has no insert grant; the next case and Task 7 cover it
  - `count_events can't be updated or deleted, even by their owner`
  - `a count event can't point at another user's session`
  - `a count event can't differ from its session in practice_id, local_day or steps_per_repetition`
  - `a count is positive, except a correction, which may be negative but not 0`, and `a mode that isn't a ChantMode is refused`
  - `a position's deleted_hlc and deleted_at are set together or not at all`
  - `a table or function added to public later is not exposed until a migration grants it`
  - `a session's ended_at can be filled once, then never changes; no other column changes`
  - `practice_positions can't be written directly, only through the merge function`
  - `the powersync publication lists exactly the three tables`
  - `powersync_role has REPLICATION and BYPASSRLS, cannot log in until the hosted database gives it a password, and may only select the three tables`
  - `the anon role reads nothing`
- [ ] Implement the migration as in [Tables](#tables). Run the tests; they pass. Commit: `feat(supabase): sessions, count events and positions`.

#### Task 7: the merge function

**Files:** the same migration, or a second one; `supabase/tests/merge_position.test.sql`.

- [ ] Failing pgTAP tests. Every case in `packages/shared/src/logic/position.test.ts` has a counterpart here, except those that check the step count (`refuses a live winner whose step_index…`, `accepts the last real name…`, `does not police the step_index of a tombstone`, `refuses to return a malformed position…`). Name each counterpart after the case it mirrors, so a reader can match them up. Plus:
  - `hlc text compares in byte order`: clocks equal but for `device_id` `a-c` and `ab` order as `compareHlc` does (`a-c` first). A collation that ignores punctuation would compare `ac` with `ab` and get it backwards; `collate "C"` is what makes this pass
  - `uuid_generate_v5 gives the same ids as derivedId`: the five vectors from Task 1
  - `a row whose id isn't derived from its user and practice is dropped, and the call succeeds`
  - `a row more than 5 minutes ahead is dropped, and the call succeeds`
  - `a malformed row is dropped, and the call succeeds`: one case per rule in [the merge function](#the-merge-function)
  - `a row for another user raises 42501`
  - `a caller with no user raises 42501`, and `anon can't execute the function at all`
  - `a non-canonical practice_id is dropped`: an uppercase custom practice UUID, with an id derived from it, leaves no row
  - `a deleted row with a step_index past the step count is kept`: the server doesn't police the upper bound on tombstones
  - `marks of different lengths in one generation: OR-ed, the shorter padded with zeros`, and `three rows with marks of mixed lengths converge in every arrival order`
  - `grouping, order and repetition never matter`: a seeded property test over random triples, crowded so they tie, with marks of mixed lengths and some deletions
  - `server_now returns the database's time`, and `anon can't execute server_now`
- [ ] Implement `merge_position_rows`, `merge_practice_position` and `server_now`. Run the tests. Commit: `feat(supabase): merge positions on the server`.

#### Task 8: the sync config

- [ ] Write `powersync/sync-config.yaml` as in [the sync config](#the-sync-config). `npx powersync validate`. Restart the service and check it replicates the three tables.
- [ ] Docs: setup guide (Docker, `sync:up`, `sync:test`, resetting), the [server section](../../architecture/data-model.md#server-supabase) (the publication and the merge function as built), TECH-VERSIONS (Supabase CLI, PowerSync CLI, service image). `npm run format`, `npm run lint:md`, `npm run check`.
- [ ] Commit: `feat(powersync): sync streams for a devotee's practice`. Push, draft PR, request Copilot. Point Copilot and the owner at the sync config and the RLS as security code.

### PR 3 — two devices, headless

#### Task 9: the harness

**Files:** `tools/sync-lab/package.json` (`@powersync/node` 1.1.0, `better-sqlite3` 13.0.3, `@supabase/supabase-js` 2.117.1, `@powersync/common` 2.3.0, all exact), `vitest.config.ts`, `src/harness.ts`, `src/harness.test.ts`; the connector and schema from PR 4's [client files](#the-client), written here first since the tests need them. Add `@powersync/common` and `@supabase/supabase-js` to `apps/mobile` now (`npx expo install`); both are plain JavaScript, so Expo Go keeps working until PR 4.

```ts
export interface Device {
  db: PowerSyncDatabase;
  goOffline(): Promise<void>; // disconnect()
  goOnline(): Promise<void>; // connect(), then wait for an empty upload queue and a checkpoint
  chant(practiceId: string, count: number): Promise<CountEvent>; // writes a session if none is open, and a sealed event
  markStep(practiceId: string, stepIndex: number, stepCount: number): Promise<void>;
  finishPass(practiceId: string, stepCount: number): Promise<void>; // one write transaction: the recitation's event and the reset
  deletePosition(practiceId: string): Promise<void>;
  total(practiceId: string): Promise<number>; // totalCount over the local count_events
  position(practiceId: string): Promise<PracticePosition | null>;
}
export interface TestUser {
  email: string;
  password: string;
  user_id: string;
}
export interface DeviceOptions {
  clockSkewMs?: number; // added to Date.now() for this device's wall clock; default 0
}
export function createUser(): Promise<TestUser>; // admin API
export function signedInDevice(
  user: TestUser,
  name: string,
  options?: DeviceOptions,
): Promise<Device>;
export function guestDevice(
  name: string,
  options?: DeviceOptions,
): Promise<
  Device & {
    // calls signInAndCombine; consented defaults to true
    signIn(user: TestUser, options?: { consented?: boolean }): Promise<void>;
  }
>;
export function serverTotal(user: TestUser, practiceId: string): Promise<number>; // as the user, through PostgREST
```

- [ ] Failing test: `a device can write offline and the row reaches the server when it reconnects`.
- [ ] Implement. For "caught up", wait until `getUploadQueueStats().count` is 0 and then for the next `currentStatus.lastSyncedAt` after it. If that proves flaky, use `requestCheckpoint()` with `checkpointMode: 'requests'` (alpha; service 1.24 or later). If `@powersync/node`'s worker threads fail under Vitest, use `openWorker` with `startPowerSyncWorker` as its README describes. Write down what was needed; the results doc reports it.
- [ ] Root script `sync:test`: first check the stack is up (Supabase status, PowerSync's liveness probe and an active replication slot: Task 5's stack check) and, if not, stop with "Run `npm run sync:up` first"; then `supabase test db`, then `npm run test:stack --workspace=tools/sync-lab`. The workspace has no `test` script, so `npm test --workspaces` never runs these.
- [ ] Commit: `test(sync-lab): headless devices on the local stack`.

#### Task 10: two devices converge (criterion 2)

**Files:** `tools/sync-lab/src/converge.test.ts`. Each test makes a fresh user. Positions use a fixture namavali of 12 steps, version 1.

- [ ] Failing tests, then make them pass. Failures here are findings about PowerSync or our design, not test bugs to paper over: write each one down before changing anything.
  - `counts chanted offline on two devices add up exactly`: A chants 3 × 108 and a correction of −5, B chants 2 × 108; both reconnect. Both devices and the server agree on the total
  - `an upload repeated after the server stored it is not counted twice`: replay A's upload transaction by hand
  - `two devices on the same pass end with one position and every mark`: same version, pass 0. A marks 0–2, B marks 5–6. Run once with A reconnecting first and once with B first. Both devices and the server hold one row with marks {0, 1, 2, 5, 6}, and `step_index` from the later `hlc`
  - `a device that finished the pass wins; the other's marks are not combined in`: A marks every step and finishes pass 0 (its recitation is recorded); B, offline, marks 5–6 on pass 0. The result is pass 1 with A's marks only, and the recitation counts once
  - `three devices converge whatever order they reconnect in`: all six orders
  - `chanting after a deletion on another device brings the position back`
  - `a session's ended_at set on one device reaches the other`
  - `a permanently rejected upload is set aside, not lost`: upload a count event whose session the server doesn't have (`23503`). It lands in `upload_failures` with its data, the queue moves on, and the next event uploads
  - `a device whose clock runs 10 minutes fast keeps its marks`: B's clock is 10 minutes fast. Offline, B marks 5–6 and A marks 0–2. Both reconnect. The server and both devices hold marks {0, 1, 2, 5, 6}, and the stored `hlc` is within 60 seconds of the server's time
  - `restamping keeps a deletion's meaning`: B, 10 minutes fast and offline, deletes a position; after it reconnects, the position is deleted on the server. Then, again offline, B deletes another and chants on it again; after it reconnects, that position is live. And a row whose `hlc` is on time but whose `deleted_hlc` runs 10 minutes ahead is still deleted after the restamp
  - `after reconnecting, a fast device's new edits use the corrected clock`: B, 10 minutes fast, reconnects, then marks a step. The upload's `hlc` is within 60 seconds of the server's time, not 10 minutes ahead, though B made edits that far ahead before
  - `a set-aside position keeps its whole row`: offline, change a synced position's `user_id` to another user's by hand, then mark a step, so the upload is a `PATCH` the server refuses (`42501`). Its `upload_failures` payload holds every column of the row, including `practice_version`, `pass_ordinal` and the full `chanted_steps`. Sending that payload to `merge_practice_position` as the right user, with `user_id` set back, stores the position
- [ ] Commit: `test(sync-lab): two devices converge`.

#### Task 11: a guest signs in (criterion 1, headless)

**Files:** `tools/sync-lab/src/guest.test.ts`, `apps/mobile/src/data/powersync/signIn.ts`.

- [ ] Failing tests:
  - `nothing leaves a guest device`: a guest chants and marks steps; the upload queue stays empty and the server has no rows
  - `without consent, nothing is downloaded or uploaded`: the account already has counts from device A. G signs in with `consented: false`. The call rejects; G's synced tables stay empty, the server has none of G's rows, G's guest rows are untouched, and `device_state` still says guest
  - `a guest's counts arrive in the account on sign-in`: the account already has counts from device A; after G signs in, the server, A and G all show A's + G's total
  - `a guest's position merges with the account's for the same practice`: same version and pass. One row survives, its id is `derivedId` for the account, and it has both devices' marks
  - `a guest's position on an older pass gives way to the account's`
  - `the guest tables are empty after sign-in, and device_state records the account`
  - `if the download fails, nothing changes and the guest can try again`: stop the PowerSync container during step 4
- [ ] Implement `signInAndCombine` (decision 8). Run the tests. Commit: `feat(mobile): combine a guest's practice with the account on sign-in`.

#### Task 12: the server merge agrees with the shared one

**Files:** `tools/sync-lab/src/mergeParity.test.ts`.

- [ ] `the server's merge agrees with mergePositions`: a property test over random pairs and triples of positions for one user and one 12-step practice: random versions, passes, marks, `hlc`s and deletions, within the step count. For each case, upload the rows in turn through `merge_practice_position` under a fresh practice id, read back the row, and compare it with folding `mergePositions`. At least 200 cases. Use a fixed seed that the failure message prints.
- [ ] Commit: `test(sync-lab): server and device merge agree`.
- [ ] Docs: setup guide (running `sync:test`). `npm run format`, `npm run lint:md`, `npm run check`, `npm run sync:test`. Push, draft PR, request Copilot.

### PR 4 — on phones and in the browser

#### Task 13: PowerSync in the app

**Files:** `apps/mobile/package.json`, `metro.config.js`, `app.json`, `src/data/powersync/*`, `.gitignore`.

- [ ] From `apps/mobile`: `npx expo install @powersync/react-native @op-engineering/op-sqlite @powersync/web @powersync/react @powersync/common @supabase/supabase-js expo-build-properties`. Don't install `@powersync/op-sqlite` or `react-native-quick-sqlite`: SDK 2 dropped both. Check the resolved versions against PowerSync's [Expo 57 demo](https://github.com/powersync-ja/powersync-js/tree/main/demos/react-native-web-supabase-todolist) and record them in TECH-VERSIONS.
- [ ] `metro.config.js` with the demo's `resolveRequest`, `unstable_enablePackageExports` and the `react-native-web` condition. `expo-build-properties` with the demo's Android and iOS minimums.
- [ ] Scripts: `web:assets` runs `powersync-web copy-assets --output public`; `web` and `export:web` run it first. Gitignore `public/@powersync/`.
- [ ] `database.ts`: native uses the default op-sqlite factory. Web uses `WASQLiteOpenFactory` with `OPFSCoopSyncVFS`, opened inside a client-only effect. Web sets **both** workers to the file `copy-assets` writes, as the Expo demo's `system.ts` does: the database's (`worker: '/@powersync/worker.js'` on the open factory) and the sync's (`sync: { worker: '/@powersync/worker.js' }` on the database). Setting only the first leaves the sync worker to the SDK's default path, which `copy-assets` doesn't promise to serve.
- [ ] Jest: add a test that importing `database.ts` opens nothing, and that the dev route renders a placeholder under jest-expo. `npm run check`.
- [ ] Commit: `feat(mobile): PowerSync client`.

#### Task 14: the dev screen

**Files:** `src/features/sync-lab/SyncLabScreen.tsx` (+ test), `src/app/dev/sync.tsx`.

- [ ] The screen shows: mode (guest or signed in), local owner id, device id, the live total for the fixture mantra (`useQuery`; this is criterion 4), the fixture namavali's marks, upload queue size and sync status. Buttons: +1 japa, +108, mark next name, finish pass, go offline, go online, a consent switch (off by default), sign in as a test user (refused while consent is off), `disconnectAndClear({ clearLocal: false })`.
- [ ] Test with jest-expo against a mocked database: the buttons call the harness-equivalent functions, and the total re-renders on a new row.
- [ ] Commit: `feat(mobile): sync lab screen`.

#### Task 15: run it (criteria 1–3 on real platforms)

Manual. Record each run in the results doc, with platform, OS and browser versions.

- [ ] **Android emulator**, development build (`npx expo run:android`): chant as a guest; sign in; the counts reach the server. Then run two emulators against the same account, both offline, and repeat Task 10's first and third cases by hand.
- [ ] **Web, Chrome**, from the static export: `npm run export:web --workspace=apps/mobile`, then serve `apps/mobile/dist` on `localhost`. The static build succeeds, and the page opens with no errors in the console. In DevTools, both the database worker and the sync worker load from `/@powersync/worker.js`, with no 404s. Chant as a guest and reload: the count is kept. Sign in, go offline in DevTools, chant, then close the tab while still offline. Reopen it online: the offline counts are still there, and they reach the server. (Reloading while offline needs the service worker, which is M10.)
- [ ] **Web vs Android**: the same account on both, offline, then reconnect: totals agree.
- [ ] Measure: time from `connect()` to the first complete sync with 10,000 count events in the account, on Android and Chrome.
- [ ] Commit any fixes the runs needed. Push, draft PR, request Copilot.

### PR 5 — PowerSync Cloud, iOS and Safari

Needs the owner: a PowerSync account (free plan), a Supabase project (free plan), and their iPhone and Mac.

- [ ] **Owner:** create the Supabase project and the PowerSync Cloud instance. Share the project ref and instance id.
- [ ] Apply the migrations with `supabase db push`. This creates `powersync_role` and the publication, so it comes before anything that uses them. Set `max_wal_size` and `max_slot_wal_keep_size` to 1 GB (`supabase --experimental postgres-config update`).
- [ ] **Owner:** in the Supabase SQL editor, give the migration's role a login: `alter role powersync_role with login password '<generated>'`, with a password from the password manager, never committed. Connect PowerSync Cloud to Supabase's **direct connection** string as `powersync_role`, as the PowerSync guide says. Don't share the password.
- [ ] `powersync link cloud`, then `powersync deploy sync-config` from the repo, so the config in git is the config running.
- [ ] Check that Cloud replicates: its dashboard shows replication running, and the hosted database has an active slot for it.
- [ ] Point `tools/sync-lab` at Cloud through environment variables and run Tasks 10–11 against it. The merge parity test can stay local.
- [ ] **Safari**: OPFS needs a secure context. Serve the static export over HTTPS (EAS Hosting preview, or a Cloudflare quick tunnel) against Cloud. Repeat the Chrome run on iPhone Safari and on macOS Safari. Compare `OPFSCoopSyncVFS` with IndexedDB, and try a private window.
- [ ] **iOS**: a development build on the owner's iPhone, built on their Mac with Xcode (`npx expo run:ios --device`), or with EAS if that's easier. Then the Android run.
- [ ] Afterwards: a free-plan instance idle for 7 days is deprovisioned and leaves its replication slot behind, which grows the WAL. Either keep it in use or delete the instance and drop the slot (`pg_drop_replication_slot`). Write down which.
- [ ] Ask PowerSync the decision's three questions (Pro caps without Team, IPv6 or IPv4, New Architecture), and record the answers.

### PR 6 — results

- [ ] Write `docs/research/2026-MM-DD-s4-sync-prototype.md`: each criterion, pass or fail, with the evidence; what the harness needed; timings; surprises; the PowerSync answers.
- [ ] Update the [sync engine](../../architecture/data-model.md#sync-engine) and [web](../../architecture/data-model.md#web) sections: no COOP/COEP, OPFS, the static-export finding. Tick S4's items in the Phase 1 plan. Move this plan to `docs/archive/plans/`. Update INDEX.
- [ ] If a criterion failed: a new decision record for what replaces it, which the owner accepts before M3 starts.
- [ ] `npm run format`, `npm run lint:md`, `npm run check`. Push, draft PR, request Copilot.

## Risks and open questions

- **Static export may not survive PowerSync.** Static rendering runs modules in Node; PowerSync's demo uses a single-page build. If the lazy client-only database isn't enough, the fallback is `output: 'single'` for the app with articles rendered separately, which changes the [web plan](../../architecture/data-model.md#web). That is the owner's call.
- **Two devices in one Node process is undocumented.** If `@powersync/node` can't run two clients in one process, run each device as a child process driven by the test.
- **Local-only to synced is shown only on React web.** If `updateSchema` misbehaves on React Native, the fallback is plain local tables that the app copies on sign-in, still inside PowerSync's database.
- **op-sqlite is listed as Beta** on PowerSync's feature-status page, although SDK 2 makes it the only native driver. Worth asking PowerSync.
- **The clock offset is an estimate.** It is only as good as the round trip to `server_now`. The 60-second restamp margin covers a slow network, well inside the server's 5 minutes. A clock that jumps while connected is corrected at the next connect or token refresh, when `fetchCredentials` runs again.
- **`requestCheckpoint` is alpha.** It's only a fallback for knowing that a device has caught up.
- **Supabase's local Postgres keeps at most 5 replication slots.** Each sync config deploy makes a new slot, and a crashed service can leave one behind. `sync:reset` drops inactive slots.
- **Devices for the manual runs:** Android runs on the emulator on the owner's Windows machine; iOS and Safari on the owner's iPhone and Mac. If the Mac is to hand during PR 4, macOS Safari can be tried early: served from `localhost` on the Mac, the page is a secure context, so OPFS works against the local stack over the LAN.

## Done when

- [ ] On a fresh clone with Docker running, `npm run sync:up` then `npm run sync:test` passes: pgTAP, convergence, guest sign-in and merge parity
- [ ] Criterion 1: a guest's counts and position reach the account on Android, with nothing downloaded or uploaded before sign-in and consent
- [ ] Criterion 2: two devices offline on the same pass converge to exact totals and one position with every mark, even when one device's clock runs 10 minutes fast; a finished pass wins, headless and by hand on Android
- [ ] Criterion 3: the static web export builds; in Chrome and Safari, counts chanted offline survive closing the tab and upload when it reopens online
- [ ] The Cloud instance runs the sync config deployed from the repo, and the headless tests pass against it
- [ ] The results doc, data-model.md, the setup guide, TECH-VERSIONS and the Phase 1 plan match what was found

## Sources

Checked 2026-09-24: [React Native and Expo](https://docs.powersync.com/client-sdks/reference/react-native-and-expo), [React Native Web](https://docs.powersync.com/client-sdks/frameworks/react-native-web-support), [Expo Go](https://docs.powersync.com/client-sdks/frameworks/expo-go-support), [feature status](https://docs.powersync.com/resources/feature-status), [local-only usage](https://docs.powersync.com/client-sdks/advanced/local-only-usage) and its [React demo](https://github.com/powersync-ja/powersync-js/tree/main/demos/react-supabase-todolist-optional-sync), [Sync Streams](https://docs.powersync.com/sync/streams/quickstart), [CLI](https://docs.powersync.com/tools/cli), [writing data](https://docs.powersync.com/client-sdks/writing-data), [source database setup](https://docs.powersync.com/configuration/source-db/setup), [Supabase guide](https://docs.powersync.com/integrations/supabase/guide), [self-hosting](https://docs.powersync.com/intro/self-hosting) and its [Supabase demo](https://github.com/powersync-ja/self-host-demo/tree/main/demos/supabase), [Node SDK](https://docs.powersync.com/client-sdks/reference/node), [checkpoint requests](https://docs.powersync.com/client-sdks/advanced/checkpoint-requests), [web VFS options](https://docs.powersync.com/client-sdks/reference/javascript-web#sqlite-virtual-file-systems), [usage and billing](https://docs.powersync.com/resources/usage-and-billing), [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started), and the npm registry for versions.

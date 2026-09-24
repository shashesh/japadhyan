---
title: Content build — packs, manifest and signing
status: planned
created: 2026-09-24
---

# Content build — packs, manifest and signing

> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans to carry this out task by task. The owner accepted every [decision](#decisions) on 2026-09-24. The interfaces and test cases below are binding; the implementation is left to the task.

## Goal

`npm run content:build` turns `content/` into the packs, manifest and reviewed snapshot the app will read, and a separate signing script signs the manifest with a key the build can never reach. Once this is done, M3 has a real `core` pack to bundle and verify.

Covers the M2 items _build script_ (minus publishing), _pack layout_, _production packs refuse unreviewed content_ and the build half of _content signing key_ in the [Phase 1 plan](2026-09-21-phase-1-plan.md#m2--content-pipeline-spec). Spec: [content pipeline](../../architecture/content-pipeline.md#build).

## Scope

- In:
  - Pack and manifest types and export schemas in `packages/shared`, so the app reads packs with the same schemas the build checks them against
  - The pack build: `index`, `programs`, `deity/<id>`, `deity/<id>/script/<script>`, `deity/<id>/lang/<language>` and `core`
  - The reviewed snapshot of generated text, and the version rules checked against it
  - The manifest; development and production channels; production refuses unreviewed practices
  - The build runs under Node's permission model: it reads only the repo and writes only its output
  - The signing script: key generation, signing and verification, using only Node's built-in crypto
- Out:
  - **Publishing** and **media checksums**: both need the hosting choice ([open question](../../product/open-questions.md#content-hosting)), which gets its own decision doc
  - Anything in the app: bundling `core`, verifying signatures, installing packs (M3)
  - Per-script conventions (nasals, ॐ, Tamil marks): these need a reader of each script to sign them off
  - Generating the production keys: the owner does this, following the steps in Task 10

## Decisions

All accepted by the owner on 2026-09-24, as recommended, with an addition to 8. Decisions 11 and 12 came from Copilot's review of this plan. Those marked **spec change** amend [content-pipeline.md](../../architecture/content-pipeline.md), and the amendment lands in the same PR as the code.

1. **`core` includes every launch deity's script and language add-ons in P1** (spec change). The spec puts only base packs in `core`, so a devotee reading Tamil would have to download `deity/shiva/script/tamil`, and that request names the deity. P1 promises that nothing is fetched to use the library. The spec's own estimate is about 2 MB of text for every script and several languages. _Accepted._
2. **Launch deities are every deity in `content/`**, with no flag, until the library outgrows the bundle. _Accepted; add a flag when we first need one._
3. **Replace per-pack versions with a manifest `release` number** (spec change). The app fetches a pack when its SHA-256 differs from what it has, so a per-pack version adds nothing, and keeping one monotonic would need the previous manifest. What does need a number is protection against rollback: the app remembers the highest `release` it has accepted and rejects a signed manifest with a lower one, so an old but validly signed manifest can't be replayed. The bundled `core` ships with its manifest, so the app knows its starting release. _Accepted._
4. **Packs are plain JSON, hashed uncompressed** (spec change: the spec says "compressed JSON"). The SHA-256 then covers exactly the bytes the app parses; compression happens in transit (HTTP `Content-Encoding`, which React Native's `fetch` decodes) and inside the app bundle. So the app needs no decompression library. Revisit with hosting if the host can't compress. _Accepted._
5. **Content-addressed pack paths:** `packs/<id>.<first 16 hex of sha256>.json`. A CDN cache serving an old pack under an unchanged name would fail the hash check; a new name for new content can't go stale. The manifest lists each path, so this can change later. _Accepted._
6. **The reviewed snapshot lives in `content-snapshot/`**, beside `content/` and mirroring its paths (`content-snapshot/practices/hindu/shiva/om-namah-shivaya.yaml`). Each file is the practice as packs carry it, with every generated script, so the advisor reviews generated text as a diff and a library upgrade shows up as one. `content/` stays source only, which its layout check already requires. `npm test` fails when the snapshot is out of date. _Accepted._
7. **The snapshot is the baseline for the version rules.** A practice whose steps differ from its snapshot (any script, or the number of steps) must have a higher `version`, and no version may go down. Checking against the committed snapshot needs no git and no published manifest, but it means a practice changed twice before one release bumps twice, so versions can skip numbers. That does no harm: devices only ever see a higher number. Publishing will later check against the live manifest as well. _Accepted._
8. **A production build refuses to run if any practice is unreviewed**, and lists every one of them. It doesn't quietly leave them out, because leaving one out can break a deity's `featured_practice_id`. Development builds include them; the index marks each `reviewed: false` so the app can flag them. _Accepted._ **Added:** `review` records the `version` it covers (`review: { advisor, reviewed_on, version }`), and a practice counts as reviewed only while `review.version` equals its `version`. Decision 7 forces a bump whenever the text or a generated script changes, so any change a devotee would see goes back to the advisor. The owner is the Hindu advisor and reviews the five development mantras once PR 2 has built their snapshot.
9. **Base packs are English.** The spec says base packs carry "English"; every other language comes as an add-on. So a practice's `title` and `repetition_word`, and a deity's `names`, must have `en`, which the validator checks. The index keeps every language for titles and names, since search needs them and they are small. _Accepted._
10. **Keys:** the production private key is an encrypted PKCS#8 PEM file kept outside the repo, with its passphrase in the owner's password manager, entered at a prompt, never taken from an env var or argument. The owner generates two key pairs, _current_ and _next_, and the app ships both public keys. Development builds are signed with a key each developer generates for themselves, which production apps never trust. Hardware keys can come later: Node's crypto can't sign with a hardware key directly. _Accepted._
11. **Only the chanted text bumps a version** (spec change: the specs say "bumped on any text change"). A version change resets a devotee's saved place in a namavali, so a typo fixed in an English intro shouldn't send someone 600 names into the Sahasranama back to the start. The version covers each step's text, words and name in every script, and the number of steps. Titles, subtitles, intros, meanings, repetition words, source and licence can be corrected without a bump. _Accepted._
12. **The key is protected by its encryption and a clean signing folder, not by the build's sandbox** (spec change). `npm install` and `npm test` already run every third-party package, the transliterator included, with the owner's full permissions, so the permission model around the build can't be what keeps the key safe, and the spec shouldn't claim it does. What does:
    - The key file is encrypted (decision 10). A malicious package could copy it but not use it.
    - The passphrase is typed only into the signing script, and **signing runs from a fresh clone where `npm install` never ran**. The script needs nothing from npm. It refuses to run if its checkout has a `node_modules` folder or uncommitted changes, and prints the commit it is at. So a package that tampered with the signing script in the everyday checkout never gets the passphrase.
    - The build keeps its permission-model sandbox as an extra layer. esbuild stays, pinned: it is no riskier than `npm test`.
    - Not covered: on a compromised machine the build itself could put text in a pack that differs from the reviewed snapshot, and the owner would sign it. The follow-up is a reproducible build checked by a second machine (see [risks](#risks-and-open-questions)).

    _Accepted._

## Design

### Output

```text
dist/content/<channel>/            ← gitignored (dist/ already is)
├─ manifest.json
├─ manifest.sig.json               ← written by the signing script
└─ packs/
   ├─ index.<hash>.json
   ├─ programs.<hash>.json
   ├─ core.<hash>.json
   ├─ deity/shiva.<hash>.json
   ├─ deity/shiva/script/tamil.<hash>.json
   └─ deity/shiva/lang/hi.<hash>.json
content-snapshot/                  ← committed, reviewed
└─ practices/hindu/shiva/om-namah-shivaya.yaml
```

### Pack and manifest types (`packages/shared/src/types/packs.ts`)

`PACK_SCHEMA_VERSION` goes in `packages/shared/src/constants/packs.ts`, beside the other constants:

```ts
/** The pack format's major version. An app ignores a pack with a higher one. */
export const PACK_SCHEMA_VERSION = 1;
```

```ts
export type Channel = 'development' | 'production';

interface PackBase {
  id: string;
  schema_version: number;
}

export interface IndexDeity extends Pick<
  Deity,
  'id' | 'tradition_id' | 'parent_id' | 'names' | 'featured_practice_id' | 'sort_order'
> {
  pack_id: string;
}

export interface IndexPractice extends Pick<
  Practice,
  'id' | 'version' | 'tradition_id' | 'deity_ids' | 'kind' | 'title'
> {
  step_count: number;
  pack_id: string;
  has_audio: boolean;
  reviewed: boolean;
}

export interface IndexPack extends PackBase {
  id: 'index';
  traditions: readonly Tradition[];
  deities: readonly IndexDeity[];
  practices: readonly IndexPractice[];
}

/** A deity and its practices: source script, IAST, `latin` and English only. */
export interface DeityPack extends PackBase {
  deity: Deity;
  practices: readonly Practice[];
}

/** One extra script for a deity's practices, step by step. */
export interface ScriptPack extends PackBase {
  script: Script;
  practices: readonly {
    id: string;
    version: number;
    steps: readonly { text: string; words: readonly string[] | null; name: string | null }[];
  }[];
}

/** One extra language for a deity and its practices. */
export interface LanguagePack extends PackBase {
  language: LanguageTag;
  deity: { summary: string | null };
  practices: readonly {
    id: string;
    version: number;
    title: string | null;
    subtitle: string | null;
    repetition_word: string | null;
    intro: string | null;
    steps: readonly { meaning: string | null }[];
  }[];
}

export interface ProgramsPack extends PackBase {
  id: 'programs';
  programs: readonly Program[];
}

/** What ships inside the app: whole packs, each installed as if downloaded. */
export interface CorePack extends PackBase {
  id: 'core';
  packs: readonly (IndexPack | ProgramsPack | DeityPack | ScriptPack | LanguagePack)[];
}

export type Pack = IndexPack | ProgramsPack | DeityPack | ScriptPack | LanguagePack | CorePack;

export interface ManifestEntry {
  id: string;
  path: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  schema_version: number;
  channel: Channel;
  /** Only goes up. The app rejects a manifest older than one it has accepted. */
  release: number;
  /** Sorted by id. */
  packs: readonly ManifestEntry[];
}

export interface ManifestSignature {
  algorithm: 'ed25519';
  /** First 16 hex digits of the SHA-256 of the raw 32-byte public key. */
  key_id: string;
  /** Base64 Ed25519 signature over the exact bytes of manifest.json. */
  signature: string;
}
```

A script or language pack's practice entries carry the `version` they were built from; the app applies an add-on only to that version of the practice. Add-ons are merged by step index. A language add-on carries no deity `names`: the index already has every language's names.

### Rules the build enforces

- Every pack parses with its **export** schema from `packages/shared`, the one the app will use, before it is written.
- Packs are **canonical JSON**: keys sorted, no whitespace, strings in NFC, entities sorted by id, steps in order. Building twice gives identical bytes.
- A production build refuses unreviewed practices (decision 8).
- The version rules against the snapshot (decisions 7 and 11). A practice removed from `content/` **keeps** its snapshot, as a record of the highest version it reached: it isn't packed, and bringing the id back needs a higher version. Ids never change once published, and devotees' counts and saved places are keyed by them, so an id must never come back at a lower version with different text.
- The snapshot is written only when validation and the version rules pass, so a failed build leaves the committed baseline as it was.

### The build's sandbox

Tested while writing this plan: `tsx` can't run under `node --permission`, because it talks to its own process over a named pipe the permission model blocks. Bundling with esbuild works. The bundle runs as plain `node --permission --allow-fs-read=<repo>`, validates `content/` in about 0.3 s, and a read of a file in the home folder is denied. It needs two things: a `createRequire` banner, because `yaml` calls `require('process')`, and `vidyut_bg.wasm` copied beside the bundle.

So `npm run content:build` runs `tools/content-build/run.mjs`, a launcher that imports nothing third-party. It bundles, then starts `node --permission` with read access to the repo, write access to `dist/content/` and `content-snapshot/` only, and no child processes, workers, addons or WASI. The signing script is a separate file in `scripts/` that the bundle never includes.

This sandbox is an extra layer, not what keeps the key safe (decision 12). Node's permission model follows symbolic links, so a link inside the repo pointing at the key would open it to the build; the launcher refuses to run if any link in the repo resolves outside it.

## File structure

| File                                                   | Responsibility                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/types/packs.ts`                   | Pack, manifest and signature types                                                                           |
| `packages/shared/src/constants/packs.ts`               | `PACK_SCHEMA_VERSION`                                                                                        |
| `packages/shared/src/schemas/packs.ts` (+ test)        | Export schemas for every pack kind, the manifest and the signature, built on the catalog export schemas      |
| `tools/content-build/src/canonical.ts` (+ test)        | Canonical JSON bytes                                                                                         |
| `tools/content-build/src/packs.ts` (+ test)            | Catalog with generated practices → every pack, `core` included. Pure                                         |
| `tools/content-build/src/snapshot.ts` (+ test)         | Snapshot paths, YAML form, reading it back, and the version rules. Pure apart from reading and writing files |
| `tools/content-build/src/manifest.ts` (+ test)         | Packs → files with content-addressed paths, plus the manifest. Pure                                          |
| `tools/content-build/src/build.ts` (+ test)            | Runs validate → version rules → generate → snapshot → packs → manifest; the build's entry point              |
| `tools/content-build/src/validate.ts`                  | Gains the English rule (decision 9)                                                                          |
| `tools/content-build/run.mjs` (+ `run.test.mjs`)       | Bundles, then starts the build under the permission model                                                    |
| `scripts/content-sign.mjs` (+ `content-sign.test.mjs`) | `keygen`, `sign`, `verify`. Node built-ins only                                                              |

## Tasks

Three PRs, each a draft against `master` and each passing `npm run check` locally.

### PR 1 — pack formats in `packages/shared`

#### Task 1: pack and manifest types and schemas

**Files:** create `packages/shared/src/types/packs.ts`, `packages/shared/src/schemas/packs.ts`, `packages/shared/src/schemas/packs.test.ts`; export both from their `index.ts`.

- [ ] Write the failing tests in `packs.test.ts`:
  - `a minimal pack of each kind parses` — one fixture per kind, built from the existing catalog test fixtures
  - `a pack with a higher schema_version is rejected` — the app ignores it (spec: newer major version)
  - `unknown fields are dropped, not rejected` — the export behaviour, for forward compatibility
  - `a script pack's steps carry plain strings, not maps by script`
  - `a manifest entry needs a lowercase sha256 and positive bytes`
  - `a manifest path must be packs/<id>.<16 hex>.json` — each segment of the id is checked for what it is (a catalog id, a script, a language tag in its canonical case such as `pt-BR`), so `..`, backslashes, absolute paths and empty segments are rejected and no path can leave the pack folder
  - `manifest packs must be sorted by id and unique`
  - `release is a non-negative integer; channel is development or production`
  - `a signature needs algorithm ed25519, a 16-hex key_id and base64`
  - `the schemas and the types can't drift` — the same `expectTypeOf` check `catalog.test.ts` uses
- [ ] Run `npm test --workspace=packages/shared`. They fail: the module doesn't exist.
- [ ] Implement the types above, and the schemas with `exportSchemas` from `catalog.ts` for the embedded entities. `schema_version` is `z.literal(PACK_SCHEMA_VERSION)`. `core`'s `packs` is a union of the other kinds, told apart by `id` (`index`, `programs`, `deity/<id>`, `deity/<id>/script/<script>`, `deity/<id>/lang/<tag>`).
- [ ] Run the tests. They pass. Then `npm run check`.
- [ ] Commit: `feat(shared): pack, manifest and signature schemas`.

#### Task 2: a review records the version it covers

**Files:** `packages/shared/src/types/catalog.ts`, `packages/shared/src/schemas/catalog.ts`, `catalog.test.ts`, the `mantra` fixture in `tools/content-build/src/validate.test.ts`.

- [ ] Failing tests in `catalog.test.ts`:
  - `a review needs the version it covers: a positive integer`
  - `a review of a version after the practice's own is an issue` — you can't have reviewed text that doesn't exist yet
  - `a review of an earlier version parses` — the practice is simply unreviewed again, which is the build's call (decision 8)
- [ ] Add `version: number` to `ContentReview`, and to the schema's `review` object for both forms. Export `isReviewed(practice): boolean` from `packages/shared` (`review !== null && review.version === version`), with its own tests, so the build and the app use one rule.
- [ ] Run `npm test --workspace=packages/shared`, then `npm test --workspace=tools/content-build`. The five practices in `content/` have `review: null`, so they need no change.
- [ ] Commit: `feat(shared): a review records the version it covers`.

#### Task 3: docs for PR 1

- [ ] In [content-pipeline.md](../../architecture/content-pipeline.md): the pack shapes in brief, decisions 1, 3, 4 and 5 (the spec changes), and "the app installs `core` by installing each pack in it". In its review bullet, [data-model.md](../../architecture/data-model.md#practice) and [content/README.md](../../../content/README.md): `review` now records `version`, and a changed practice goes back to the advisor. Decision 11 in the same three places: "any text change bumps the version" becomes "any change to the chanted text", with what that covers.
- [ ] Run `npm run format` then `npm run lint:md`.
- [ ] Commit: `docs: pack formats and release numbers`. Push, open the draft PR, request Copilot.

### PR 2 — the build

#### Task 4: canonical JSON

**Files:** `tools/content-build/src/canonical.ts`, `canonical.test.ts`.

- [ ] Failing tests:
  - `keys are sorted at every depth; arrays keep their order`
  - `strings are NFC` — `'शि'` written as decomposed and composed gives the same bytes
  - `no whitespace, UTF-8, no trailing newline`
  - `undefined fields are an error, not dropped` — a build bug should show, not vanish
- [ ] Implement `canonicalJson(value: unknown): Uint8Array`. Run the tests, commit: `feat(content-build): canonical JSON`.

#### Task 5: the English rule

**Files:** `tools/content-build/src/validate.ts`, `validate.test.ts`, `content/` if any file fails.

- [ ] Failing tests: `a practice title without en is an issue at its line`, the same for `repetition_word` and deity `names`, and `other languages beside en are fine`.
- [ ] Implement in `validateContent`, with the message ``Needs `en`: base packs are English``. Run `npm test --workspace=tools/content-build`; `content/ is valid` must still pass. Commit: `feat(content-build): base packs need English`.

#### Task 6: packs

**Files:** `tools/content-build/src/packs.ts`, `packs.test.ts`.

```ts
export interface BuiltCatalog {
  catalog: Catalog; // from validate.ts
  practices: readonly Practice[]; // generated: every script
}
export function buildPacks(built: BuiltCatalog): Pack[]; // core last
```

- [ ] Failing tests, on a fixture of two deities, a mantra and a namavali:
  - `a practice goes in its primary deity's pack only`
  - `a base pack keeps only the source script, iast and latin`, and `only en` in language fields
  - `one script pack per generated script per deity; none for a deity with no practices`
  - `one language pack per language other than en that a deity or its practices use`
  - `script and language packs carry each practice's version and one entry per step`
  - `the index lists every deity and practice, with pack_id, step_count, has_audio and reviewed`
  - `the index keeps every language of titles and names`
  - `programs go in the programs pack` (empty list today)
  - `core holds index, programs and every deity's base, script and language packs` (decisions 1 and 2)
  - `every pack parses with its export schema` — over the repo's own `content/`
- [ ] Implement. Run the tests, commit: `feat(content-build): build packs`.

#### Task 7: snapshot and version rules

**Files:** `tools/content-build/src/snapshot.ts`, `snapshot.test.ts`, `content-snapshot/` (generated).

```ts
export function snapshotPath(practice: Practice): string; // practices/<tradition>/<deity>/<id>.yaml
export function snapshotYaml(practice: Practice): string; // stable key order, NFC
export function versionIssues(
  practices: readonly Practice[],
  snapshot: ReadonlyMap<string, Practice>,
): ContentIssue[];
```

- [ ] Failing tests:
  - `a new practice needs no snapshot`
  - `changed text with the same version is an issue that names the version to use`
  - `a changed generated script alone also needs a bump` — the library-upgrade case
  - `a different number of steps with the same version is an issue`
  - `a lower version is an issue: versions only go up`
  - `a higher version with changed text is fine`
  - `a changed intro, title, meaning or repetition word needs no bump` — decision 11
  - `a removed practice keeps its snapshot, and coming back needs a version above it`
  - `snapshotYaml is stable: the same practice gives the same bytes`
- [ ] Implement. Run the tests, commit: `feat(content-build): reviewed snapshot and version rules`.

#### Task 8: manifest and the build entry point

**Files:** `tools/content-build/src/manifest.ts`, `manifest.test.ts`, `src/build.ts`, `build.test.ts`.

```ts
export function packFiles(packs: readonly Pack[]): { path: string; bytes: Uint8Array }[];
export function manifestOf(
  files: readonly { id: string; path: string; bytes: Uint8Array }[],
  channel: Channel,
  release: number,
): Manifest;

export interface BuildOptions {
  channel: Channel;
  release: number;
  contentRoot: string;
  snapshotRoot: string;
  outDir: string;
}
export function build(options: BuildOptions): { issues: readonly ContentIssue[] };
```

- [ ] Failing tests:
  - `a pack's path is packs/<id>.<16 hex of its sha256>.json`
  - `the manifest lists every pack sorted by id, with bytes and sha256 of the exact file`
  - `building twice writes identical files` — in a temp folder
  - `a production build with an unreviewed practice writes nothing and lists every one`
  - `a development build includes unreviewed practices, marked reviewed: false`
  - `a practice reviewed at an earlier version counts as unreviewed` — in both channels, through `isReviewed`
  - `a build with content or version issues writes no snapshot and no packs`
  - `a practice removed from content/ keeps its snapshot and is not packed`
  - `the output folder is emptied first, so no stale pack survives`
  - `production needs --release; development defaults to 0`
- [ ] Implement. `cli.ts` stays the validator; `build.ts` has its own `main` that reads `--channel` and `--release`.
- [ ] Run the tests, commit: `feat(content-build): manifest and build`.

#### Task 9: run under the permission model

**Files:** `tools/content-build/run.mjs`, `run.test.mjs`, `tools/content-build/package.json`, root `package.json`, `TECH-VERSIONS.md`.

- [ ] Add `esbuild` as an exact-pinned dev dependency of `tools/content-build` (today it arrives only through `tsx`).
- [ ] Widen the root `test:scripts` glob to `"{scripts,tools}/**/*.test.mjs"`, so `npm test` runs these; the workspace's Vitest doesn't pick up `.mjs` tests. Check it lists `run.test.mjs`.
- [ ] Failing tests (`node:test`):
  - `the permission flags read only the repo and write only dist/content and content-snapshot`
  - `no child process, worker, addon or WASI is allowed`
  - `the bundle cannot read a file outside the repo` — build, then run a one-line probe under the same flags, and expect `ERR_ACCESS_DENIED`
  - `the launcher refuses to run if a symbolic link in the repo resolves outside it` — `node_modules` workspace links point inside the repo and are fine
- [ ] Implement `run.mjs`: bundle `src/build.ts` to `tools/content-build/dist/build.mjs` with the `createRequire` banner, copy `vidyut_bg.wasm` beside it, then spawn `node --permission …` with absolute paths.
- [ ] Root scripts: `"content:build": "node tools/content-build/run.mjs"`.
- [ ] Run `npm run content:build -- --channel development`; commit the new `content-snapshot/`. Read it: each of the five mantras in every script.
- [ ] Add `the committed snapshot matches content/` to `files.test.ts`, beside `content/ is valid`. It checks both that the files are current and the version rules; its message says to run `npm run content:build`. Check it fails after changing one word of a mantra, then revert.
- [ ] Docs: content-pipeline.md (build, snapshot, channels, decisions 6–9, the permission model as tested), `content/README.md` (run `content:build` and commit the snapshot), TECH-VERSIONS, phase 1 plan items ticked, INDEX. `npm run format`, `npm run lint:md`, `npm run check`.
- [ ] Commit: `feat(content-build): run the build under the permission model`. Push, draft PR, request Copilot.

### PR 3 — signing

#### Task 10: `scripts/content-sign.mjs`

Plain Node, built-ins only (`node:crypto`, `node:fs`, `node:path`, `node:readline`, and `node:child_process` for `git`), nothing imported from the build. `sign` runs from a fresh clone with no `node_modules` (decision 12); `--dir` may point at the build output in the everyday checkout, since packs are only data and are checked against the manifest.

```text
node scripts/content-sign.mjs keygen --out <path outside the repo>
node scripts/content-sign.mjs sign   --key <pem> --dir dist/content/<channel>
node scripts/content-sign.mjs verify --public-key <base64> --dir dist/content/<channel>
```

- [ ] Failing tests in `scripts/content-sign.test.mjs`, each with a key generated into a temp folder:
  - `keygen writes an encrypted PKCS#8 PEM and prints the base64 public key and key_id`
  - `keygen refuses a path inside the repo, comparing real paths` — including through a symbolic link
  - `sign refuses a --key inside the repo, comparing real paths` — the same check as `keygen`
  - `sign refuses to run from a checkout with node_modules or uncommitted changes, and prints the commit it is at`
  - `sign and verify refuse a pack whose real path is outside --dir` — a symbolic link as the `packs/` folder or as one pack, as well as `..`
  - `sign then verify succeeds`
  - `changing one byte of a pack fails sign: the manifest no longer matches`
  - `a file in packs/ not in the manifest, or a manifest entry with no file, fails sign`
  - `changing one byte of manifest.json after signing fails verify`
  - `changing one byte of a pack after signing fails verify` — `verify` re-hashes every pack, not just the signature
  - `a pack missing, or a file in packs/ not in the manifest, fails verify as well as sign`
  - `a wrong passphrase fails without writing a signature`
  - `verify with a different key fails, naming both key ids`
  - `the passphrase comes from the terminal, or stdin when it isn't one; never argv or env`
- [ ] Implement. `sign` and `verify` share one check: every manifest path resolves, through real paths, to a file inside `--dir`; its size and SHA-256 match; and `packs/` holds nothing else. Then `sign` signs the exact bytes of `manifest.json` and writes `manifest.sig.json`, and `verify` checks that signature.
- [ ] Docs: content-pipeline.md signing section (commands, key ids, current and next keys, signing from a clean clone, and decision 12 in place of "never see the key"); the same sentence in the [transliteration decision](../../decisions/2026-09-23-transliteration-library.md#consequences); `docs/guides/setup.md` (building and signing content locally).
- [ ] Commit: `feat(scripts): sign and verify the content manifest`. Push, draft PR, request Copilot.
- [ ] **Owner, after merge:** run `keygen` twice (current and next) to a folder outside the repo, save both passphrases in the password manager, and send the two public keys and key ids. They go into the app with M3.

## Risks and open questions

- **Node 24's permission model limits the file system, not the network**, and `npm test` runs the same packages with no sandbox at all. The key's safety rests on decision 12, not on the sandbox.
- **A compromised machine could change what the build packs.** Its output could differ from the reviewed snapshot, and the owner would sign it. Follow-up after this plan: builds are already byte-for-byte reproducible, so CI (or a second machine) builds the same commit and the owner signs only when the two manifests' SHA-256 match.
- **The snapshot can be edited by hand**, which would weaken the version rules. PR review is the guard; publishing will also compare against the live manifest.
- **Deities and traditions have no `review` field**, so production gates only practices. Deity names and summaries are hand-written text too. Worth asking the advisor whether they want to sign these off.
- **The esbuild bundle depends on how `@siva-sh/vidyut` finds its wasm**: `wasm-url` resolves beside the importing file. An upgrade that changes this breaks the build loudly, not silently.
- **Hosting may bring changes:** if the host can't compress in transit, decision 4 changes to storing gzip and hashing the compressed bytes.

## Done when

- [ ] `npm run content:build -- --channel development` writes the packs and manifest to `dist/content/development/` and the snapshot to `content-snapshot/`, under `node --permission`
- [ ] `--channel production` refuses today's content, since all five practices are unreviewed, and lists them
- [ ] Every pack parses with the export schemas in `packages/shared`, and building twice gives identical bytes
- [ ] `npm test` fails when the snapshot is out of date or a practice's text changed without a version bump
- [ ] `scripts/content-sign.mjs` signs a development build, verify accepts it, and one changed byte anywhere makes it fail
- [ ] content-pipeline.md, content/README.md, the setup guide, TECH-VERSIONS and the phase 1 plan match what was built

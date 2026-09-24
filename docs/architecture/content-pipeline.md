---
status: active
updated: 2026-09-24
---

# Content pipeline

How deities, mantras, namavalis and programs are written, reviewed, built and delivered to devices. The shapes are in [data-model](data-model.md#catalog); the decision is [content packs](../decisions/2026-09-22-content-packs.md).

**Source, delivery and device are separate.** `content/` in the repo is where content is written and reviewed. It is not what ships inside the app.

## Why not bundle everything

Rough sizes, with every script and several languages:

| Content                                | Text, raw | Text, compressed | Audio               |
| -------------------------------------- | --------- | ---------------- | ------------------- |
| One mantra                             | ~2 KB     | < 1 KB           | ~100 KB             |
| One Ashtottara (108 names)             | ~120 KB   | ~20 KB           | ~2 MB (about 5 min) |
| One Sahasranamavali (1000 names)       | ~1.2 MB   | ~200 KB          | ~15 MB              |
| P1 library (15 deities, ~15 namavalis) | ~2 MB     | ~350 KB          | ~30 MB              |
| Grown library (100 deities, stotras…)  | ~45 MB    | ~7 MB            | 600 MB or more      |

Text is manageable; audio and images are not. iOS blocks downloads over 200 MB on mobile data, and many devotees in India and Nepal have phones with little storage.

## Source: `content/`

Text and metadata only, as YAML:

```text
content/
├─ traditions/hindu.yaml
├─ deities/hindu/shiva.yaml
├─ practices/hindu/shiva/om-namah-shivaya.yaml
├─ practices/hindu/vishnu/vishnu-ashtottara.yaml
└─ programs/navaratri.yaml
```

- **Layout.** A file's name is its id. Deities sit in their tradition's folder, and practices in their tradition's and their **primary deity's** folder (the first of `deity_ids`), so Hare Krishna is `practices/hindu/krishna/hare-krishna.yaml`. Any other file is an error, except `content/README.md`.
- **Audio and images are not in git.** They live in object storage, named by their SHA-256. YAML refers to them by id, checksum, size and (for audio) duration.
- **Schema.** Every file is checked against a schema in `packages/shared` (`src/schemas`, [Zod](../decisions/2026-09-23-schema-library-zod.md)), which is platform-agnostic and also used by the app to read packs. Each entity has two forms:
  - **Content** schemas are strict: a field the schema doesn't know is an error, not ignored. A practice's step text, words and names carry the master scripts — the source script and IAST. Generated scripts may not be written by hand, except a `latin` that overrides the rules ([how `latin` is produced](../decisions/2026-09-23-transliteration-library.md#how-latin-is-produced)).
  - **Export** schemas drop fields they don't know, so an app can read a pack with fields added after its release. A practice's step text, words and names carry at least the source script, IAST and `latin`; script add-on packs bring more.
  - **Deity names** have no source script, so neither rule applies: they are written by hand per language, each in the scripts that language uses (`en` in `latin`, `hi` in `devanagari`), and are never generated.
  - Both enforce the rules within a single entity, among them: catalog ids, language tags as language, optional script and optional region in canonical case (`en`, `pt-BR`, `sa-Latn`), a source script other than `latin`, one step for a mantra, words only on a mantra, a name on every namavali step, a namavali round of one recitation, a duration on every recording, audio positions inside the recording, program days within the program, and an absent meaning or reading written as `null`, never as an empty map. Rules that span files — a practice's deities exist, versions only go up — belong to the build.
- **Review.** Each practice carries `review: { advisor, reviewed_on, version }`, `source` and `licence`. A review covers the version it names: a practice whose chanted text changed since is unreviewed again (`isReviewed` in `packages/shared`), so that change goes back to the advisor. Titles, intros and meanings can change without a version bump ([versions](#source-content)), so they keep the review; the advisor sees them in the PR like any other change. Production packs refuse unreviewed content; development packs include it, flagged.
- **Versions.** Any change to the chanted text bumps the practice's `version`: a step's text, words or name in any script, generated scripts included, or the number of steps. Titles, subtitles, intros, meanings, repetition words, source and licence can be corrected without a bump, because a saved place in a namavali resets on any version change ([data-model](data-model.md#practiceposition)). Counts refer to the practice id, so fixing a typo never changes anyone's history. The build checks this against the [reviewed snapshot](#the-reviewed-snapshot).
- **English first.** Base packs carry English, and every other language is an add-on, so a practice's `title` and `repetition_word`, and a deity's `names`, must have `en`.
- **Changes go through PRs** like code. If advisors aren't comfortable reviewing on GitHub, a CMS can later sit in front of the same build step without changing packs or the app.

### Transliteration

- The master text is the practice's source script (Devanagari for Sanskrit, Gurmukhi for Sikh practice) plus IAST.
- `latin` (common spelling such as "Om Namah Shivaya") and other Indic scripts are **generated at build time**, not on the phone, using an established transliteration library chosen in M2 ([vidyut-lipi](../decisions/2026-09-23-transliteration-library.md), with our own rules for `latin` and for each script's conventions).
- From Devanagari, the build generates Tamil, Telugu, Kannada, Gujarati and Bengali; Gurmukhi and Tibetan wait for P2. `latin` comes from the IAST by rules, unless the step carries a hand-written one. A step's text, words and name are each generated, words one by one.
- The build checks what it generates (`tools/content-build/src/generate.ts`):
  - The source script, read as IAST, must match the hand-written IAST, ignoring punctuation (daṇḍas, hyphens, brackets; never the avagraha). IAST must be lower case with `ṃ`, not `ṁ`.
  - No generated script may hold letters of the source script. vidyut-lipi passes through letters it has no mapping for, such as ऑ, and a round trip can't see them.
  - Tamil, Telugu, Kannada and Gujarati must convert back to the source exactly. Bengali writes `va` and `ba` alike, so it relies on review.
  - The IAST and source have as many words, and so does a hand-written `latin`. A hand-written `latin` on the text needs one on the words too.
- Generated text is reviewed by the advisor like any other. Some scripts need special handling, e.g. Tamil lacks aspirated consonants.

## Build

A script, run locally in P1 (GitHub Actions minutes are limited, see [ci-only-when-ready](../decisions/2026-09-21-ci-only-when-ready.md)):

1. **Validate** every file against the schema; check media checksums.
2. **Generate** scripts from the master text.
3. **Build packs:** plain JSON, one file per pack, named by its hash ([packs](#packs)).
4. **Write the manifest:** its schema version, the channel, a `release` number that only goes up, and each pack's id, path, size and SHA-256.
5. **Sign the manifest** with the content signing key (Ed25519).
6. **Publish** packs, manifest and signature to the CDN (Supabase Storage or Cloudflare R2, chosen in M2).

Steps 1 to 4 are `tools/content-build`. Signing is a separate script, `scripts/content-sign.mjs` ([signing](#signing)), and publishing and media checksums wait for the [hosting choice](../product/open-questions.md#content-hosting).

- **Validation** checks the layout above and the references between files: ids are unique; a deity's tradition, parent and featured practice, a practice's deities and a program's practices all exist; a deity's parent and a practice's deities are in its tradition; a featured practice is one of that deity's; and no deity is its own ancestor. It also runs step 2's checks ([transliteration](#transliteration)). `npm test` runs it, so it is part of `npm run check` and CI; `npm run content:validate` runs it alone and prints each problem with its file and line.
- **`npm run content:build -- --channel development`** runs every step up to the manifest. It validates and generates, checks the version rules against the [reviewed snapshot](#the-reviewed-snapshot), builds the packs and checks each against its export schema. Then it writes them with `manifest.json` to `dist/content/<channel>/` (not committed), emptying that folder first so no stale pack survives, and writes the snapshot. If any check finds a problem, it lists every one and writes nothing.
- **Channels.** A `development` build includes unreviewed practices, marked `reviewed: false` in the index; its release is 0 unless `--release` says otherwise. A `production` build needs `--release <number>`, above the last one published, and refuses to run while any practice is unreviewed at its current version, listing each. It doesn't leave them out, which could break a deity's `featured_practice_id`.
- **Canonical JSON.** Packs and the manifest are written with keys sorted by code point, strings in NFC, no whitespace and no trailing newline, so building the same content twice gives the same bytes and the same SHA-256.

### The reviewed snapshot

`content-snapshot/practices/<id>.yaml` holds each practice as packs carry it, with every generated script, and is committed. The advisor reviews generated text as a diff in the PR, and a transliteration library upgrade that changes a script shows up there too.

- It is the baseline for the **version rules**: a practice whose steps differ from its snapshot (text, words or names in any script, or the number of steps) must have a higher `version`, and no version may go down. The error names the version to use. Comparing with the committed snapshot needs no git history and no published manifest. A practice changed twice before one release is bumped twice, so versions can skip numbers, which does no harm.
- It is **keyed by practice id**, so moving a practice to another tradition or primary deity keeps its snapshot. A practice removed from `content/` keeps its snapshot as the highest version its id reached. It isn't packed, and it can't come back at a lower version, or at the same version with different chanted text.
- It is written only when every check passes, so a failed build leaves the committed baseline as it was. `npm test` fails when the committed snapshot is out of date, or when a practice's chanted text changed without a bump.

### The build's sandbox

`npm run content:build` runs `tools/content-build/run.mjs`. It bundles the build with esbuild, because `tsx` can't run under the permission model, and starts the bundle with `node --permission`. The bundle can read only the repo, write only `dist/content/` and `content-snapshot/`, and start no child process, worker, addon or WASI; `run.test.mjs` checks each of these. Reads are granted on the whole repo rather than on the few folders the build reads, because in Node 24.13 granting both `content` and `content-snapshot` stops the build listing `content` itself.

Node's permission model follows symbolic links, so a link in the repo that resolves outside it would open that file to the build, and a write through a link lands wherever the link points. The launcher refuses to run while any link in the repo resolves outside it, or while a folder something writes to holds a link, or has one on the way to it from the repo root, since a link there could redirect a write to, say, the signing script. Those folders are the build's `dist/content/` and `content-snapshot/`, and `tools/content-build/dist/`, where the launcher writes the bundle outside the sandbox. It checks before creating any of them. The links npm makes for workspaces point inside the repo and are fine.

The sandbox is an extra layer. `npm install` and `npm test` run the same third-party packages with no sandbox at all, so it is not what keeps the signing key safe.

### Packs

| Pack                         | Contents                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index`                      | Every tradition, and every deity and practice: id, titles and names in every language, deity, kind, step count, pack id, has audio, reviewed. About 100 KB                                                                                                                                                                              |
| `core`                       | Everything that ships inside the app, in one file: in P1, every other pack (the index, programs, and every launch deity's base pack with its script and language add-ons), each installed as if downloaded. Launch deities are, for now, every deity in `content/`. Corrections to bundled content arrive in a new release of this pack |
| `deity/<id>`                 | The deity and its practices in the source script, IAST, `latin` and English                                                                                                                                                                                                                                                             |
| `deity/<id>/script/<script>` | The same practices in one extra script; never `latin` or `iast`, which the base pack has                                                                                                                                                                                                                                                |
| `deity/<id>/lang/<language>` | The deity's summary, and practices' titles, subtitles, repetition words, intros and meanings, in one extra language. Names are in the index                                                                                                                                                                                             |
| `programs`                   | Sankalpa templates and festival programs                                                                                                                                                                                                                                                                                                |
| Audio                        | One file per practice, not packed                                                                                                                                                                                                                                                                                                       |

- **Format.** Plain JSON, hashed exactly as stored. Compression happens in transit (HTTP `Content-Encoding`, which the app's networking decodes) and inside the app bundle, so the app needs no decompression library and the SHA-256 covers exactly the bytes it parses.
- **Names.** A pack is published as `packs/<id>.<first 16 hex digits of its SHA-256>.json`, so new content always has a new name and a CDN can never serve a stale copy under it. Only `manifest.json` keeps a fixed name.
- **Schema version.** Every pack and the manifest carry `schema_version`, the format's major version. A pack with one the app doesn't understand is ignored; the app keeps what it has and suggests updating. Fields added within a major version are dropped by older apps.
- **Releases, not pack versions.** A pack has no version of its own: the app fetches a pack when its SHA-256 changes. The manifest carries a `release` number that only goes up. The app remembers the highest it has accepted and rejects a signed manifest with a lower one, so an old but validly signed manifest can't roll a correction back. The bundled `core` ships with its manifest, so a fresh install knows its starting release.
- **Add-ons** carry the `version` of each practice they were built from and apply only to that version, step by step.
- **Shapes:** `packages/shared/src/types/packs.ts`. The build checks every pack against the schemas in `src/schemas/packs.ts` before writing it, and the app reads packs with the same schemas. The schemas check each pack on its own; that `core` holds every pack and that packs agree with one another is the build's job.

### Signing

`scripts/content-sign.mjs` uses only Node's built-ins and imports nothing from npm or the build:

```bash
node scripts/content-sign.mjs keygen --out <path outside the repo>
node scripts/content-sign.mjs sign   --key <pem> --dir dist/content/<channel>
node scripts/content-sign.mjs verify --public-key <base64> --dir dist/content/<channel>
```

- **Keys.** `keygen` writes an Ed25519 private key as an encrypted PKCS#8 PEM file and prints the base64 public key and its `key_id`: the first 16 hex digits of the SHA-256 of the raw 32-byte public key. It refuses a path inside the repo, comparing real paths so a link can't hide one, and never overwrites a file. The PEM's key derivation is PBKDF2 at 2048 rounds, which Node can't raise, so the passphrase must be long and random: at least 20 characters, generated by the password manager.
- **The private key** never goes to CI or the CDN. The owner keeps the PEM file outside the repo and its passphrase in the password manager, and signs when publishing. The passphrase is typed at a prompt with echo off, or piped on stdin; never an argument or an environment variable.
- **Current and next keys.** The owner generates two key pairs, and the app ships both public keys, so the key can be rotated without breaking installed apps. A compromised key is retired by an app release that drops it. Development builds are signed with a key each developer generates for themselves, which production apps never trust.
- **What `sign` and `verify` check.** Before trusting a build folder, both resolve `--dir` to its real path, and refuse a `manifest.json` that is a link, not a regular file, or without a known channel and a whole-number release, a manifest path that isn't under `packs/`, and a link anywhere in `packs/`. Then they re-hash every pack against the manifest's size and SHA-256 and refuse a pack that is missing or a file the manifest doesn't list. `sign` signs the exact bytes of `manifest.json` and writes `manifest.sig.json` (`algorithm`, `key_id`, base64 `signature`) to a temporary file in `--dir` that it renames into place, so a file or link already there is replaced, never written through. `verify` checks `manifest.sig.json` the same way as `manifest.json` and its fields against `manifestSignatureSchema`'s formats, names both key ids when the signature is from another key, and then checks the signature.
- **Nothing from the build folder reaches the terminal unchecked.** The channel, release and key id are validated before they are printed, and file names are printed with control characters escaped.
- **The key is protected by its encryption and a clean signing folder, not by the build's sandbox.** `npm install` and `npm test` run every third-party package, the transliterator included, with the owner's full permissions, so [the build's sandbox](#the-builds-sandbox) can't be what keeps the key safe. What does:
  - The key file is encrypted. A malicious package could copy it but not use it.
  - The passphrase is typed only into the signing script, and **`keygen` and `sign` run from a fresh clone where `npm install` never ran**. They refuse to run if the clone has a `node_modules` folder anywhere or uncommitted changes, and print the commit they run from. So a package that changed the signing script in the everyday checkout never gets the passphrase. `--dir` may point at the build output in the everyday checkout: packs are only data, checked against the manifest.
  - Not covered: on a compromised machine the build itself could put text in a pack that differs from the reviewed snapshot, and the owner would sign it. The follow-up is a reproducible build checked by a second machine.
- Packs are **data only**: text and references, never code or markup. The app renders text as text.

## Device

| Layer                | What                                                                                                                | When                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core bundle**      | The `core` pack: the index, programs, and **every launch deity's** base pack and add-ons (about 2 MB of text in P1) | Inside the app. Works offline from the moment it's installed, with no request to anyone. A **signed `core` pack from a higher release replaces it**, so a correction reaches installed apps without a store release |
| **Downloaded packs** | Base and add-on packs, stored in the local catalog tables and search index                                          | When a deity is opened, and **automatically for anything saved or starred**                                                                                                                                         |
| **Audio**            | Per practice                                                                                                        | On demand, or "Download for offline"                                                                                                                                                                                |

- **In P1 nothing is downloaded to use the library:** it is all in the app. The only text the app fetches is a **corrected `core` pack**, in one piece covering every launch deity, so no request names a deity. Per-deity downloads begin only when the library grows beyond the bundle, and for audio.
- **Browsing and search work offline** because the index is bundled. A deity that hasn't been downloaded shows "Download to open", not an empty screen.
- **Settings → Storage** lists downloaded packs and audio, with sizes, and offers "Download everything for offline".
- **Updates:** the app checks the manifest when online and fetches only packs whose SHA-256 changed. Content fixes need no app release.
- **Authenticity:** the app has the content signing public key built in and rejects a manifest whose signature doesn't verify, or whose `release` is lower than one it has accepted. Every pack must match the SHA-256 listed in the signed manifest, so a compromised CDN can't swap in altered text, and must pass the export schema, so a build bug can't either. Audio and images must match the SHA-256 recorded in their pack. The core bundle is covered by the app's own store signature.
- **Unpublished content** stays on devices that have it, and its counts remain; it is hidden from browsing.

## Privacy of downloads

Which deity someone chants to reveals their religion, so a request for that deity's content is sensitive even for a guest with no account ([platform principles](platform-principles.md#privacy)).

- **Requests carry nothing that identifies the devotee:** no account token, no device id, no cookies. They are plain anonymous fetches of static files, over HTTPS, so only the CDN operator sees which file was fetched.
- **P1 avoids the problem:** the launch library's text ships in the app, so opening a deity needs no request.
- **As the library grows,** packs are fetched in **groups** (a tradition, or a batch of deities including ones the devotee didn't open) rather than one deity at a time, and "Download everything for offline" is offered, so one request doesn't map to one deity.
- **Audio stays per practice.** Whoever runs the CDN can see which recording was fetched, and from which IP address. The privacy policy says so plainly, logs are kept for the shortest period the provider allows, and audio can be downloaded in bulk instead.
- If this turns out to matter more than expected, the next step is serving content through a proxy that strips the IP address. Not needed for P1, since nothing is fetched.

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
- **Review.** Each practice carries `review: { advisor, reviewed_on, version }`, `source` and `licence`. A review covers the version it names: a practice changed since is unreviewed again (`isReviewed` in `packages/shared`), so any change a devotee would see goes back to the advisor. Production packs refuse unreviewed content; development packs include it, flagged.
- **Versions.** Any change to the chanted text bumps the practice's `version`: a step's text, words or name in any script, generated scripts included, or the number of steps. Titles, subtitles, intros, meanings, repetition words, source and licence can be corrected without a bump, because a saved place in a namavali resets on any version change ([data-model](data-model.md#practiceposition)). Counts refer to the practice id, so fixing a typo never changes anyone's history.
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

Step 1 is `tools/content-build`. It also checks the layout above and the references between files: ids are unique; a deity's tradition, parent and featured practice, a practice's deities and a program's practices all exist; a deity's parent and a practice's deities are in its tradition; a featured practice is one of that deity's; and no deity is its own ancestor. It also runs step 2's checks ([transliteration](#transliteration)), though writing the generated text out waits for the pack build. `npm test` runs it, so it is part of `npm run check` and CI; `npm run content:validate` runs it alone and prints each problem with its file and line. Media checksums and "versions only go up" wait for the build steps that need them.

### Packs

| Pack                         | Contents                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index`                      | Every tradition, and every deity and practice: id, titles and names in every language, deity, kind, step count, pack id, has audio, reviewed. About 100 KB                                                                                                                                                                              |
| `core`                       | Everything that ships inside the app, in one file: in P1, every other pack (the index, programs, and every launch deity's base pack with its script and language add-ons), each installed as if downloaded. Launch deities are, for now, every deity in `content/`. Corrections to bundled content arrive in a new release of this pack |
| `deity/<id>`                 | The deity and its practices in the source script, IAST, `latin` and English                                                                                                                                                                                                                                                             |
| `deity/<id>/script/<script>` | The same practices in one extra script                                                                                                                                                                                                                                                                                                  |
| `deity/<id>/lang/<language>` | The deity's summary, and practices' titles, subtitles, repetition words, intros and meanings, in one extra language. Names are in the index                                                                                                                                                                                             |
| `programs`                   | Sankalpa templates and festival programs                                                                                                                                                                                                                                                                                                |
| Audio                        | One file per practice, not packed                                                                                                                                                                                                                                                                                                       |

- **Format.** Plain JSON, hashed exactly as stored. Compression happens in transit (HTTP `Content-Encoding`, which the app's networking decodes) and inside the app bundle, so the app needs no decompression library and the SHA-256 covers exactly the bytes it parses.
- **Names.** A pack is published as `packs/<id>.<first 16 hex digits of its SHA-256>.json`, so new content always has a new name and a CDN can never serve a stale copy under it. Only `manifest.json` keeps a fixed name.
- **Schema version.** Every pack and the manifest carry `schema_version`, the format's major version. A pack with one the app doesn't understand is ignored; the app keeps what it has and suggests updating. Fields added within a major version are dropped by older apps.
- **Releases, not pack versions.** A pack has no version of its own: the app fetches a pack when its SHA-256 changes. The manifest carries a `release` number that only goes up. The app remembers the highest it has accepted and rejects a signed manifest with a lower one, so an old but validly signed manifest can't roll a correction back. The bundled `core` ships with its manifest, so a fresh install knows its starting release.
- **Add-ons** carry the `version` of each practice they were built from and apply only to that version, step by step.
- **Shapes:** `packages/shared/src/types/packs.ts`. The build checks every pack against the schemas in `src/schemas/packs.ts` before writing it, and the app reads packs with the same schemas.

### Signing

- The **private key** never goes to CI or the CDN. The owner holds it (password manager or hardware key) and signs when publishing.
- **Signing is its own step**, a small script that uses only Node's built-in crypto and imports nothing from the build. It re-hashes the packs against the manifest and signs only that. The earlier steps, and their third-party packages such as the transliterator, run under Node's permission model and never see the key.
- The app ships the **current and next public keys**, so the key can be rotated without breaking installed apps. A compromised key is retired by an app release that drops it.
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

---
status: active
updated: 2026-09-22
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

- **Audio and images are not in git.** They live in object storage, named by their SHA-256. YAML refers to them by id, checksum, size and (for audio) duration.
- **Schema.** Every file is checked against a schema in `packages/shared`, which is platform-agnostic and also used by the app to read packs.
- **Review.** Each practice carries `review: { advisor, reviewed_on }`, `source` and `licence`. Production packs refuse unreviewed content; development packs include it, flagged.
- **Versions.** Any text change bumps the practice's `version`. The number of steps may only change with a version bump. Counts refer to the practice id, so fixing a typo never changes anyone's history. A saved place in a namavali resets on any version change ([data-model](data-model.md#practiceposition)).
- **Changes go through PRs** like code. If advisors aren't comfortable reviewing on GitHub, a CMS can later sit in front of the same build step without changing packs or the app.

### Transliteration

- The master text is the practice's source script (Devanagari for Sanskrit, Gurmukhi for Sikh practice) plus IAST.
- `latin` (common spelling such as "Om Namah Shivaya") and other Indic scripts are **generated at build time**, not on the phone, using an established transliteration library chosen in M2.
- Generated text is reviewed by the advisor like any other. Some scripts need special handling, e.g. Tamil lacks aspirated consonants.

## Build

A script, run locally in P1 (GitHub Actions minutes are limited, see [ci-only-when-ready](../decisions/2026-09-21-ci-only-when-ready.md)):

1. **Validate** every file against the schema; check media checksums.
2. **Generate** scripts from the master text.
3. **Build packs:** compressed JSON, versioned.
4. **Write the manifest:** each pack's id, version, size, SHA-256 and schema version.
5. **Sign the manifest** with the content signing key (Ed25519).
6. **Publish** packs, manifest and signature to the CDN (Supabase Storage or Cloudflare R2, chosen in M2).

Schema validation also runs in `npm run check`.

### Packs

| Pack                         | Contents                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `index`                      | Every deity and practice: id, titles, deity, kind, step count, pack id, has audio. About 100 KB |
| `deity/<id>`                 | The deity and its practices in the source script, IAST, `latin` and English                     |
| `deity/<id>/script/<script>` | The same practices in one extra script                                                          |
| `deity/<id>/lang/<language>` | Titles, meanings and intros in one extra language                                               |
| `programs`                   | Sankalpa templates and festival programs                                                        |
| Audio                        | One file per practice, not packed                                                               |

A pack with a newer schema major version than the app understands is ignored; the app keeps what it has and suggests updating.

### Signing

- The **private key** never goes to CI or the CDN. The owner holds it (password manager or hardware key) and signs when publishing.
- The app ships the **current and next public keys**, so the key can be rotated without breaking installed apps. A compromised key is retired by an app release that drops it.
- Packs are **data only**: text and references, never code or markup. The app renders text as text.

## Device

| Layer                | What                                                                                                  | When                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Core bundle**      | The `index` pack, `programs`, and the base packs of **every launch deity** (about 2 MB of text in P1) | Inside the app. Works offline from the moment it's installed, with no request to anyone |
| **Downloaded packs** | Base and add-on packs, stored in the local catalog tables and search index                            | When a deity is opened, and **automatically for anything saved or starred**             |
| **Audio**            | Per practice                                                                                          | On demand, or "Download for offline"                                                    |

- **In P1 no text is downloaded at all:** the whole launch library is in the app. Downloads begin when the library grows beyond it, and for audio.
- **Browsing and search work offline** because the index is bundled. A deity that hasn't been downloaded shows "Download to open", not an empty screen.
- **Settings → Storage** lists downloaded packs and audio, with sizes, and offers "Download everything for offline".
- **Updates:** the app checks the manifest when online and fetches only packs that changed. Content fixes need no app release.
- **Authenticity:** the app has the content signing public key built in and rejects a manifest whose signature doesn't verify. Every pack must match the SHA-256 listed in the signed manifest, so a compromised CDN can't swap in altered text. Audio and images must match the SHA-256 recorded in their pack. The core bundle is covered by the app's own store signature.
- **Unpublished content** stays on devices that have it, and its counts remain; it is hidden from browsing.

## Privacy of downloads

Which deity someone chants to reveals their religion, so a request for that deity's content is sensitive even for a guest with no account ([platform principles](platform-principles.md#privacy)).

- **Requests carry nothing that identifies the devotee:** no account token, no device id, no cookies. They are plain anonymous fetches of static files, over HTTPS, so only the CDN operator sees which file was fetched.
- **P1 avoids the problem:** the launch library's text ships in the app, so opening a deity needs no request.
- **As the library grows,** packs are fetched in **groups** (a tradition, or a batch of deities including ones the devotee didn't open) rather than one deity at a time, and "Download everything for offline" is offered, so one request doesn't map to one deity.
- **Audio stays per practice.** Whoever runs the CDN can see which recording was fetched, and from which IP address. The privacy policy says so plainly, logs are kept for the shortest period the provider allows, and audio can be downloaded in bulk instead.
- If this turns out to matter more than expected, the next step is serving content through a proxy that strips the IP address. Not needed for P1, since nothing is fetched.

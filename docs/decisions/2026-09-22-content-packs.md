---
status: accepted
date: 2026-09-22
---

# Content is authored in the repo and delivered as packs

## Context

The library will grow to many deities, namavalis, stotras, several scripts and languages, audio and images. Text alone stays small (about 7 MB compressed for a large library), but audio could pass 600 MB. iOS blocks downloads over 200 MB on mobile data, and many devotees have phones with little storage. The app must still work offline from the moment it is installed.

## Decision

- **Source:** text and metadata live in `content/` as YAML, checked against a schema, reviewed in PRs, with the advisor's sign-off and the licence recorded on each practice. Audio and images live in object storage, not git.
- **Delivery:** a build step generates scripts, then publishes versioned, compressed **packs** and a **signed manifest** to a CDN. The app has the public key built in and accepts only packs listed in a manifest whose signature verifies.
- **Device:** a **core bundle** ships inside the app: the index of every deity and practice, programs, and the full text of every launch deity, so P1 downloads no text at all and a request never reveals which deity someone chants to. Other packs download when a deity is opened, and automatically for anything saved or starred. Audio is always on demand.

Details: [content-pipeline](../architecture/content-pipeline.md).

## Consequences

- The app stays small, and content fixes ship without an app release.
- The first time a devotee opens a deity outside the core bundle, they need a connection once. Browsing and search still work offline.
- Content requests carry nothing identifying, and beyond P1 they are grouped so one request doesn't reveal one deity ([privacy of downloads](../architecture/content-pipeline.md#privacy-of-downloads)).
- The pack format decouples authoring from delivery: a CMS can replace git as the source later without changing the app.

---
status: accepted
date: 2026-09-23
---

# Catalog schemas use Zod

## Context

Content in `content/` and the packs built from it are checked against one schema in `packages/shared` ([content-pipeline](../architecture/content-pipeline.md#source-content)). Two programs run it: the content build, on Node, and the app, on iOS, Android and web, when it reads a pack. The app can't trust a pack's shape just because the manifest signature verifies, since a build bug would still ship. The types in `packages/shared/src/types` are hand-written from the [data model](../architecture/data-model.md) and stay the contract.

## Decision

**Use [Zod](https://zod.dev) 4 as a runtime dependency of `packages/shared`.** It is the most widely used TypeScript schema library, it has no platform dependencies (so `packages/shared` stays platform-agnostic), and it has what the catalog needs: discriminated unions for practice kinds, partial records for text by script and language, and refinements for rules that span fields.

The schemas are written against the existing types, not the other way round. A compile-time test checks each schema's output against its type in both directions, so neither can change without the other.

Each catalog entity has two forms, built from one set of shapes:

- **Content** — the YAML in `content/`. Strict, so a misspelt field is an error. Text carries exactly the master scripts: the source script and IAST.
- **Export** — what packs carry. Unknown fields are dropped, so an app can read a pack with fields added after it was released. Text carries at least the source script, IAST and `latin`.

## Alternatives

- **Valibot.** Smaller when tree-shaken, but less familiar, and bundle size is not the constraint: text packs are parsed rarely and the schema code is a few kilobytes either way.
- **Hand-written validators.** No dependency, but the discriminated unions and error paths are exactly the fiddly parts, and they would drift from the types unnoticed.

## Consequences

- One more runtime dependency in the app bundle, listed in [TECH-VERSIONS](../../TECH-VERSIONS.md).
- A pack that fails its schema is rejected like one whose checksum doesn't match, and the app keeps what it has.
- Rules that span files — a practice's deities exist, a deity's parent exists, a version never goes down, a new step count comes with a new version — belong to the content build, not the schemas.

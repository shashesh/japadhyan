# Technology Versions

**Last updated:** 2026-09-24

Single source of truth for versions used in this repo. Update in the same PR as any dependency change.

## Runtime

| Tool    | Version                           | Notes                                                     |
| ------- | --------------------------------- | --------------------------------------------------------- |
| Node.js | `^22.13.0 \|\| ^24.3.0 \|\| >=25` | `.nvmrc` pins 24. Range matches React Native 0.86 / Metro |
| npm     | >= 10                             | Workspaces: `apps/*`, `packages/*`, `tools/*`             |

## App (`apps/mobile`) — iOS, Android, web

| Package                        | Version  | Notes                                                 |
| ------------------------------ | -------- | ----------------------------------------------------- |
| expo                           | ~57.0.24 | SDK 57                                                |
| react-native                   | 0.86.3   | Ships with SDK 57                                     |
| react / react-dom              | 19.2.3   | Pinned via root `overrides`                           |
| expo-router                    | ~57.0.22 | File-based routes in `src/app/`; web `output: static` |
| react-native-web               | ~0.21.2  | Web target                                            |
| expo-haptics                   | ~57.0.3  | Bead and meru feedback                                |
| expo-keep-awake                | ~57.0.2  | Screen stays on while chanting                        |
| expo-crypto                    | ~57.0.3  | Native RNG for UUIDv7; injected in `src/lib/id.ts`    |
| react-native-safe-area-context | ~5.7.0   |                                                       |
| react-native-screens           | ~4.26.0  |                                                       |

## Shared (`packages/shared`)

| Package           | Version       | Notes                                                                                                                                                                   |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript source | —             | Consumed directly by Metro; no build step                                                                                                                               |
| zod               | ^4.6.5        | Catalog schemas for `content/` and packs ([decision](docs/decisions/2026-09-23-schema-library-zod.md))                                                                  |
| @noble/hashes     | 2.4.0 (exact) | SHA-1 for the derived ids (UUIDv5): pure JavaScript, since React Native has no `crypto.subtle`. ES modules only, so `apps/mobile/jest.config.mjs` has Jest transform it |

## Content build (`tools/content-build`)

Runs locally, never ships in the app.

| Package         | Version        | Notes                                                                                                                                                                                                                  |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| yaml            | ^2.9.1         | Parses `content/` as YAML 1.2: dates stay strings, duplicate keys are errors                                                                                                                                           |
| zod             | ^4.6.5         | Same as shared; the schemas come from `@japadhyan/shared`                                                                                                                                                              |
| @siva-sh/vidyut | 0.3.0 (exact)  | vidyut-lipi's WebAssembly build: generates the Indic scripts and reads the source as IAST ([decision](docs/decisions/2026-09-23-transliteration-library.md)). Upgrade deliberately and read the diff of generated text |
| esbuild         | 0.28.2 (exact) | Bundles the build so it can run under `node --permission`, which `tsx` can't (`npm run content:build`). Pinned: it runs with the owner's permissions                                                                   |
| tsx             | ^4.23.15       | Runs the TypeScript CLI (`npm run content:validate`)                                                                                                                                                                   |
| @types/node     | ^24            | Matches the Node 24 in `.nvmrc`                                                                                                                                                                                        |
| Vitest          | ^4.1.11        | Tests, with the same 80% coverage floor as shared; also checks the real content                                                                                                                                        |

## Tooling

| Tool                          | Version                       | Notes                                                                                  |
| ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript                    | ~6.0.3                        | Version the Expo SDK 57 template ships                                                 |
| ESLint                        | ^10 (10.11)                   | Flat config, `eslint.config.mjs`                                                       |
| typescript-eslint             | ^8.70                         |                                                                                        |
| eslint-plugin-react-hooks     | ^7.1                          |                                                                                        |
| Prettier                      | ^3                            | `.prettierrc`; also formats Markdown                                                   |
| markdownlint-cli2             | ^0.23.3 (markdownlint 0.41.1) | `.markdownlint-cli2.jsonc`; same markdownlint as the VS Code extension                 |
| Vitest                        | ^4.1.11                       | `packages/shared` tests                                                                |
| @vitest/coverage-v8           | ^4.1.11                       | Runs as part of `npm test`; 80% thresholds in `packages/shared/vitest.config.ts`       |
| Jest                          | ^30.5                         | `apps/mobile` tests, `jest-expo` preset                                                |
| jest-expo                     | ^57.0.5                       |                                                                                        |
| @testing-library/react-native | ^14.0.1                       | `render` and `fireEvent` are async — always `await` them                               |
| yaml                          | ^2.9.1                        | Root dev dependency; `scripts/ci/draft-triggers.test.mjs` parses the workflows with it |

## Planned (not installed yet)

| Area           | Choice                                                                                                                    | When |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| Local storage  | SQLite through PowerSync (op-sqlite on phones, wa-sqlite on web)                                                          | P1   |
| Backend        | Supabase (auth, Postgres, storage)                                                                                        | P1   |
| Sync           | PowerSync Cloud on Sync Streams ([decision](docs/decisions/2026-09-22-sync-engine-powersync.md)); a prototype confirms it | P1   |
| i18n           | i18next or Lingui                                                                                                         | P1   |
| Apple Watch    | SwiftUI via expo-apple-targets                                                                                            | P2   |
| Wear OS        | Kotlin + Compose                                                                                                          | P2   |
| Voice counting | Native module (LiteRT or Picovoice) — prototype first                                                                     | P2   |

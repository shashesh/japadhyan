---
status: active
updated: 2026-09-24
---

# Monorepo structure

npm workspaces, one app for three platforms, one shared package, and build tools that never ship in the app.

```text
japadhyan/
├─ apps/
│  └─ mobile/                 Expo app — iOS, Android AND web (Expo Router)
│     ├─ app.json             Expo config (name, scheme, web output: static)
│     ├─ AGENTS.md            Expo-specific agent guidance (from the SDK template)
│     └─ src/
│        ├─ app/              Routes only (file-based). Keep thin.
│        ├─ features/<name>/  Screens, hooks and platform code per feature
│        ├─ data/             Repositories: the only code that touches local storage and sync (P1)
│        └─ theme.ts          Colours and spacing tokens
├─ packages/
│  └─ shared/                 @japadhyan/shared — platform-agnostic
│     └─ src/
│        ├─ types/            Domain types (snake_case fields)
│        ├─ logic/            Pure business logic + Vitest tests
│        └─ constants/        Round sizes and other fixed values
├─ tools/
│  └─ content-build/          Builds content/ into packs, under Node's permission model. Runs locally
├─ content/                   Deities, practices, programs as YAML — built into packs
├─ content-snapshot/          Each practice with every generated script, as reviewed. Written by the build
├─ docs/                      Product, architecture, decisions, plans
├─ scripts/                   Repo tooling: git hooks setup, CI guard tests (node:test)
├─ .githooks/                 Git hooks: no commits or pushes to master; Markdown checks
├─ .github/                   CI workflow, PR template
├─ .vscode/                   Recommended extensions; format Markdown on save
├─ .markdownlint-cli2.jsonc   markdownlint rules (Prettier formats, markdownlint lints)
├─ CLAUDE.md                  Rules for coding agents
└─ TECH-VERSIONS.md           Pinned versions
```

## Why one app for web too

Per the [tech stack decision](../decisions/2026-09-21-tech-stack.md), the web app is the same Expo Router codebase rendered with react-native-web and statically exported (`output: static`), so article pages are real HTML that search engines can read. If the content site outgrows this, a separate `apps/web` (Next.js) can be added later and would reuse `packages/shared`.

## Import rules

| From              | May import                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `apps/mobile`     | `@japadhyan/shared`, React, React Native, Expo packages                                        |
| `packages/shared` | Nothing platform-specific. No `react`, `react-native`, `expo-*`, `next` — ESLint enforces this |
| `tools/*`         | `@japadhyan/shared` and Node packages. Nothing imports from `tools/`                           |

Shared code is consumed as TypeScript source (`main: src/index.ts`, `"type": "module"`); Metro transpiles it for the app and tsx runs it for the tools, so there is no build step.

## Future apps and packages

| Path                                | Phase | Purpose                                          |
| ----------------------------------- | ----- | ------------------------------------------------ |
| `apps/mobile/targets/watch`         | P2    | Apple Watch app (SwiftUI via expo-apple-targets) |
| `apps/wear`                         | P2    | Wear OS app (Kotlin + Compose)                   |
| `apps/mobile/modules/voice-counter` | P2    | Native on-device voice counting module           |
| `supabase/`                         | P1    | Database migrations and policies                 |

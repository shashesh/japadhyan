---
status: active
updated: 2026-09-21
---

# Monorepo structure

npm workspaces, one app for three platforms, one shared package.

```text
naam-japam/
├─ apps/
│  └─ mobile/                 Expo app — iOS, Android AND web (Expo Router)
│     ├─ app.json             Expo config (name, scheme, web output: static)
│     ├─ AGENTS.md            Expo-specific agent guidance (from the SDK template)
│     └─ src/
│        ├─ app/              Routes only (file-based). Keep thin.
│        ├─ features/<name>/  Screens, hooks and platform code per feature
│        └─ theme.ts          Colours and spacing tokens
├─ packages/
│  └─ shared/                 @naam-japam/shared — platform-agnostic
│     └─ src/
│        ├─ types/            Domain types (snake_case fields)
│        ├─ logic/            Pure business logic + Vitest tests
│        └─ constants/        Starter mantras, round sizes
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
| `apps/mobile`     | `@naam-japam/shared`, React, React Native, Expo packages                                       |
| `packages/shared` | Nothing platform-specific. No `react`, `react-native`, `expo-*`, `next` — ESLint enforces this |

Shared code is consumed as TypeScript source (`main: src/index.ts`); Metro transpiles it, so there is no build step.

## Future apps and packages

| Path                                | Phase | Purpose                                          |
| ----------------------------------- | ----- | ------------------------------------------------ |
| `apps/mobile/targets/watch`         | P2    | Apple Watch app (SwiftUI via expo-apple-targets) |
| `apps/wear`                         | P2    | Wear OS app (Kotlin + Compose)                   |
| `apps/mobile/modules/voice-counter` | P2    | Native on-device voice counting module           |
| `supabase/`                         | P1    | Database migrations and policies                 |

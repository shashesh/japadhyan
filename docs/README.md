# docs/

How the documentation in this repo is organized.

| Folder | What lives here |
|---|---|
| `product/` | Vision, roadmap, open questions |
| `product/features/` | One spec per feature area — what it is, why, and which phase it ships in |
| `architecture/` | How the system is built: platform principles now, stack and data model later |
| `decisions/` | Dated decision records (`YYYY-MM-DD-short-name.md`). Never edited after acceptance — supersede with a new record |
| `research/` | Inspiration, competitor notes, user research |

## Conventions

- **Every doc is listed in [INDEX.md](INDEX.md).** Add, move or retire a doc → update the index in the same commit.
- **Frontmatter carries status.** Each doc starts with:

  ```yaml
  ---
  status: draft | active | superseded
  updated: YYYY-MM-DD
  ---
  ```

- **Phases** always refer to the four phases in [product/roadmap.md](product/roadmap.md): P1 Launch, P2 Deepen practice, P3 Chant together, P4 Every faith & ecosystem.
- **Build effort** tags used in specs: `easy`, `medium`, `hard`.
- **Terms.** Use the devotional terms consistently and explain them once, in the [glossary](product/glossary.md).

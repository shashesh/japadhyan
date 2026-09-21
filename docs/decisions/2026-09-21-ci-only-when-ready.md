---
status: accepted
date: 2026-09-21
---

# CI runs only on pull requests that are ready for review

## Context

The repo is private on GitHub Free, which includes 2,000 GitHub Actions minutes a month. GitHub bills each job rounded up to a whole minute. The CI job (install, lint, type-check, tests, web export) takes about 2 minutes, and Copilot's code review also runs on Actions minutes.

Without a rule, CI runs on every push to every PR, including early drafts that will change many times before they are ready.

Rulesets and branch protection are not available on this plan: the rulesets API returns 403 "Upgrade to GitHub Pro or make this repository public". Nothing can be enforced on GitHub itself.

The same rules were adopted for the owner's Nepally repo on 2026-09-19.

## Decision

**GitHub Actions minutes are spent only on code that is ready to merge.**

1. **Every PR opens as a draft.** Agents open PRs with `gh pr create --draft`.
2. **Copilot reviews the draft first.** Agents request that review themselves (`gh pr edit <number> --add-reviewer @copilot`) and again after pushing fixes. Copilot does not review drafts on its own.
3. **The owner marks the PR ready for review** once every Copilot comment is resolved and the review recommends approval. Agents never mark a PR ready.
4. **Draft PRs run no CI.** Every job in a workflow that runs on pull requests has `if: ${{ !github.event.pull_request.draft }}`. Skipped jobs cost nothing. Marking the PR ready (`ready_for_review`) starts CI.
5. **Turning a ready PR back into a draft cancels its run.** Workflows also listen for `converted_to_draft`, which starts a skipped run that cancels the run in flight through the per-PR concurrency group.
6. **Docs-only changes never start CI** (`paths-ignore` for `docs/**` and `**/*.md`).
7. **CI still runs on every push to `master`.** With no branch protection, it is the only check of the merged result.

`scripts/ci/draft-triggers.test.mjs` checks the triggers, the concurrency group and the per-job draft guard of every workflow that runs on pull requests, so a new workflow cannot skip the rule. It runs as part of `npm test`.

## Consequences

- Pushes to a draft PR cost 0 minutes. A PR is tested when it is marked ready, and again on each later push.
- Draft PRs show skipped checks. Skipped does not mean passed: commits pushed while in draft are first tested when the PR is marked ready.
- Run `npm run check` locally before asking for the PR to be marked ready, so the first CI run is also the last. Don't re-run workflows or push empty commits to trigger CI.
- Docs-only pushes to a code PR still run full CI, because path filters compare the whole PR with `master`, not the latest push.
- If the repo moves to GitHub Pro or goes public and turns on required status checks, docs-only PRs would wait forever for checks that never start. Before that, replace `paths-ignore` with a job that detects changed files and skips the rest, since skipped jobs satisfy required checks.

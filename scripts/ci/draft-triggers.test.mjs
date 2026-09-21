// Draft PRs must cost no GitHub Actions minutes (docs/decisions/2026-09-21-ci-only-when-ready.md).
// Every workflow that runs on pull requests is checked, so a new workflow can't skip the rule.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const WORKFLOWS_DIR = join(import.meta.dirname, '../../.github/workflows');
const PR_TYPES = ['opened', 'synchronize', 'reopened', 'ready_for_review', 'converted_to_draft'];
const DRAFT_GUARD = '!github.event.pull_request.draft';

// `on:` can be a string, a list or a map of triggers.
function triggersOf(workflow) {
  const on = workflow.on ?? {};
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map((name) => [name, null]));
  return on;
}

// The guard may be the whole condition or ANDed with more; `||` would let drafts through.
function isDraftGuarded(condition) {
  const expression = String(condition ?? '')
    .replace(/^\s*\$\{\{|\}\}\s*$/g, '')
    .trim();
  return expression === DRAFT_GUARD || expression.startsWith(`${DRAFT_GUARD} && `);
}

const pullRequestWorkflows = readdirSync(WORKFLOWS_DIR)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, workflow: parse(readFileSync(join(WORKFLOWS_DIR, file), 'utf8')) }))
  .filter(({ workflow }) => 'pull_request' in triggersOf(workflow));

test('at least one workflow runs on pull requests', () => {
  assert.ok(pullRequestWorkflows.length > 0);
});

for (const { file, workflow } of pullRequestWorkflows) {
  test(`${file} starts on ready_for_review and cancels in-flight runs on converted_to_draft`, () => {
    assert.deepEqual(triggersOf(workflow).pull_request?.types, PR_TYPES);
    assert.equal(
      workflow.concurrency?.['cancel-in-progress'],
      true,
      `${file} needs a concurrency group with cancel-in-progress, or converted_to_draft cancels nothing`,
    );
  });

  test(`${file} skips every job while the PR is a draft`, () => {
    const jobs = Object.entries(workflow.jobs ?? {});
    assert.ok(jobs.length > 0, `${file} has no jobs`);
    for (const [name, job] of jobs) {
      assert.ok(
        isDraftGuarded(job.if),
        `job "${name}" in ${file} needs "if: \${{ ${DRAFT_GUARD} }}"`,
      );
    }
  });
}

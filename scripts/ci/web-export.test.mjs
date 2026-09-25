// The web export needs PowerSync's worker and WASM, which the app's `export:web` script copies
// into apps/mobile/public/ first (`web:assets`). A workflow that calls `expo export` itself gets
// an export whose workers 404, and still passes.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const WORKFLOWS_DIR = join(import.meta.dirname, '../../.github/workflows');
const APP_EXPORT = 'npm run export:web --workspace=apps/mobile';

function runSteps() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((file) => /\.ya?ml$/.test(file))
    .flatMap((file) => {
      const workflow = parse(readFileSync(join(WORKFLOWS_DIR, file), 'utf8'));
      return Object.values(workflow.jobs ?? {}).flatMap((job) =>
        (job.steps ?? []).filter((step) => step.run).map((step) => ({ file, run: step.run })),
      );
    });
}

test('no workflow calls expo export directly', () => {
  const direct = runSteps().filter(({ run }) => /expo export/.test(run));
  assert.deepEqual(direct, [], 'Use `' + APP_EXPORT + '`, which copies the PowerSync assets first');
});

test('CI exports the web build through the app script', () => {
  assert.ok(
    runSteps().some(({ file, run }) => file === 'ci.yml' && run.includes(APP_EXPORT)),
    `ci.yml should run \`${APP_EXPORT}\``,
  );
});

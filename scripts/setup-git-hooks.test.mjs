import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'setup-git-hooks.mjs');
let sandbox;

function copyProjectInto(dir) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(dir, 'scripts', 'setup-git-hooks.mjs'));
  return join(dir, 'scripts', 'setup-git-hooks.mjs');
}

function hooksPathOf(repo) {
  try {
    return execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null; // unset
  }
}

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

test('points git at .githooks when the project is a git checkout', () => {
  sandbox = mkdtempSync(join(tmpdir(), 'hooks-'));
  execFileSync('git', ['init', '-q', sandbox]);
  const script = copyProjectInto(sandbox);

  execFileSync(process.execPath, [script], { cwd: sandbox, stdio: 'ignore' });

  assert.equal(hooksPathOf(sandbox), '.githooks');
});

test('leaves an enclosing repo alone when the project has no .git of its own', () => {
  sandbox = mkdtempSync(join(tmpdir(), 'hooks-'));
  execFileSync('git', ['init', '-q', sandbox]);
  const project = join(sandbox, 'vendored-copy');
  const script = copyProjectInto(project);

  execFileSync(process.execPath, [script], { cwd: project, stdio: 'ignore' });

  assert.equal(hooksPathOf(sandbox), null);
});

// Points git at the repo's hooks in .githooks/ (see docs/guides/setup.md).
// Runs on `npm install` via the root `prepare` script. Only changes git config when the
// project root is itself a git checkout. Without .git there (a build server, a ZIP download,
// a copy inside another repo) it skips, so installs still work and no other repo is touched.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');

// .git is a folder in a normal clone and a file in worktrees and submodules.
if (!existsSync(join(projectRoot, '.git'))) {
  console.log('Skipping git hooks setup: not a git checkout.');
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

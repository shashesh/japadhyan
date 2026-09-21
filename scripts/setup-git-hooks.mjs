// Points git at the repo's hooks in .githooks/ (see docs/guides/setup.md).
// Runs on `npm install` via the root `prepare` script. Skips when there is no
// git checkout (a build server or ZIP download without .git) so installs still work.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
} catch {
  console.log('Skipping git hooks setup: not a git checkout.');
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });

/**
 * `npm run content:validate` — checks `content/` and lists every problem.
 * `npm test` runs the same check through `files.test.ts`.
 */

import { CONTENT_ROOT, readContentTree } from './files';
import { validateContent } from './validate';

const { catalog, issues } = validateContent(readContentTree(CONTENT_ROOT));

for (const { file, line, path, message } of issues) {
  const where = line === undefined ? file : `${file}:${line}`;
  const field = path.length > 0 ? ` ${path.map(String).join('.')}:` : '';
  console.error(`content/${where}${field} ${message}`);
}

if (issues.length > 0) {
  console.error(`\n${issues.length} problem${issues.length === 1 ? '' : 's'} in content/`);
  process.exit(1);
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
console.log(
  `content/ is valid: ${[
    count(catalog.traditions.length, 'tradition'),
    count(catalog.deities.length, 'deity').replace(/deitys$/, 'deities'),
    count(catalog.practices.length, 'practice'),
    count(catalog.programs.length, 'program'),
  ].join(', ')}`,
);

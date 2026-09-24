/**
 * `npm run content:validate` — checks `content/` and lists every problem.
 * `npm test` runs the same check through `files.test.ts`.
 */

import { CONTENT_ROOT, readContentTree } from './files';
import { formatIssue, plural } from './report';
import { validateContent } from './validate';

const { catalog, issues } = validateContent(readContentTree(CONTENT_ROOT));

for (const issue of issues) {
  console.error(formatIssue({ ...issue, file: `content/${issue.file}` }));
}

if (issues.length > 0) {
  console.error(`\n${plural(issues.length, 'problem')} in content/`);
  process.exit(1);
}

console.log(
  `content/ is valid: ${[
    plural(catalog.traditions.length, 'tradition'),
    plural(catalog.deities.length, 'deity'),
    plural(catalog.practices.length, 'practice'),
    plural(catalog.programs.length, 'program'),
  ].join(', ')}`,
);

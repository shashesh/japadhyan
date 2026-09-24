/** How the command-line tools print what they found. */

import type { ContentIssue } from './parse';

/** `file:line field: message`, leaving out what isn't known. */
export function formatIssue({ file, line, path, message }: ContentIssue): string {
  const where = line === undefined ? file : `${file}:${line}`;
  const field = path.length > 0 ? ` ${path.map(String).join('.')}:` : '';
  return `${where}${field} ${message}`;
}

/** `1 problem`, `2 problems`, `3 deities`. */
export function plural(n: number, noun: string): string {
  if (n === 1) return `${n} ${noun}`;
  return `${n} ${noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;
}

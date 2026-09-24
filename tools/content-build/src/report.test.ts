import { describe, expect, test } from 'vitest';

import { formatIssue, plural } from './report';

describe('formatIssue', () => {
  test('file, line, field and message', () => {
    expect(
      formatIssue({ file: 'content/a.yaml', line: 3, path: ['steps', 0, 'text'], message: 'Bad' }),
    ).toBe('content/a.yaml:3 steps.0.text: Bad');
  });

  test('no line and no field', () => {
    expect(formatIssue({ file: 'content/a.yaml', path: [], message: 'Bad' })).toBe(
      'content/a.yaml Bad',
    );
  });
});

describe('plural', () => {
  test('one, many, and nouns ending in y', () => {
    expect(plural(1, 'problem')).toBe('1 problem');
    expect(plural(2, 'problem')).toBe('2 problems');
    expect(plural(0, 'deity')).toBe('0 deities');
    expect(plural(1, 'deity')).toBe('1 deity');
  });
});

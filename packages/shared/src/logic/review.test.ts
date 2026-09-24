import { describe, expect, test } from 'vitest';

import { isReviewed } from './review';

const practice = (version: number, reviewedVersion: number | null) => ({
  version,
  review:
    reviewedVersion === null
      ? null
      : { advisor: 'Pandit A', reviewed_on: '2026-09-20', version: reviewedVersion },
});

describe('isReviewed', () => {
  test('a practice reviewed at its current version is reviewed', () => {
    expect(isReviewed(practice(2, 2))).toBe(true);
  });

  test('a practice never reviewed is not', () => {
    expect(isReviewed(practice(1, null))).toBe(false);
  });

  test('a practice changed since its review is not: the change goes back to the advisor', () => {
    expect(isReviewed(practice(3, 2))).toBe(false);
  });
});

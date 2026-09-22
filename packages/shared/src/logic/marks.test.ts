import { describe, expect, test } from 'vitest';

import {
  countMarks,
  createMarks,
  isPassComplete,
  isStepChanted,
  markStep,
  unionMarks,
} from './marks';

describe('createMarks', () => {
  test('allocates one bit per step, rounded up to whole bytes', () => {
    expect(createMarks(108)).toHaveLength(14);
    expect(createMarks(8)).toHaveLength(1);
    expect(createMarks(9)).toHaveLength(2);
    expect(createMarks(1)).toHaveLength(1);
  });

  test('starts with nothing chanted', () => {
    expect(countMarks(createMarks(108))).toBe(0);
  });

  test('rejects a step count that is not a positive integer', () => {
    expect(() => createMarks(0)).toThrow(RangeError);
    expect(() => createMarks(-1)).toThrow(RangeError);
    expect(() => createMarks(1.5)).toThrow(RangeError);
  });
});

describe('markStep', () => {
  test('marks a step as chanted', () => {
    const marks = markStep(createMarks(108), 0);

    expect(isStepChanted(marks, 0)).toBe(true);
  });

  test('leaves the other steps unchanted', () => {
    const marks = markStep(createMarks(108), 5);

    expect(isStepChanted(marks, 4)).toBe(false);
    expect(isStepChanted(marks, 6)).toBe(false);
  });

  test('marks a step in a later byte', () => {
    const marks = markStep(createMarks(108), 107);

    expect(isStepChanted(marks, 107)).toBe(true);
    expect(countMarks(marks)).toBe(1);
  });

  test('does not mutate the marks it is given', () => {
    const before = createMarks(108);

    markStep(before, 3);

    expect(isStepChanted(before, 3)).toBe(false);
  });

  test('marking the same step twice counts once', () => {
    const marks = markStep(markStep(createMarks(108), 7), 7);

    expect(countMarks(marks)).toBe(1);
  });

  test('rejects a step outside the bitset', () => {
    expect(() => markStep(createMarks(8), 8)).toThrow(RangeError);
    expect(() => markStep(createMarks(8), -1)).toThrow(RangeError);
  });
});

describe('unionMarks', () => {
  test('a name chanted on either device stays chanted', () => {
    const a = markStep(markStep(createMarks(108), 0), 1);
    const b = markStep(markStep(createMarks(108), 1), 2);

    const merged = unionMarks(a, b);

    expect(isStepChanted(merged, 0)).toBe(true);
    expect(isStepChanted(merged, 1)).toBe(true);
    expect(isStepChanted(merged, 2)).toBe(true);
    expect(countMarks(merged)).toBe(3);
  });

  test('does not mutate either side', () => {
    const a = markStep(createMarks(108), 0);
    const b = markStep(createMarks(108), 1);

    unionMarks(a, b);

    expect(countMarks(a)).toBe(1);
    expect(countMarks(b)).toBe(1);
  });

  test('rejects bitsets of different lengths', () => {
    expect(() => unionMarks(createMarks(8), createMarks(16))).toThrow(RangeError);
  });
});

describe('isPassComplete', () => {
  test('is false until every step has been chanted', () => {
    let marks = createMarks(3);
    marks = markStep(marks, 0);
    marks = markStep(marks, 1);

    expect(isPassComplete(marks, 3)).toBe(false);
  });

  test('is true once every step has been chanted', () => {
    let marks = createMarks(3);
    for (let i = 0; i < 3; i += 1) marks = markStep(marks, i);

    expect(isPassComplete(marks, 3)).toBe(true);
  });

  test('ignores the spare bits in the last byte', () => {
    let marks = createMarks(108);
    for (let i = 0; i < 108; i += 1) marks = markStep(marks, i);

    expect(isPassComplete(marks, 108)).toBe(true);
  });
});

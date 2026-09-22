import { describe, expect, test } from 'vitest';

import {
  countMarks,
  createMarks,
  isPassComplete,
  isStepChanted,
  markStep,
  unionMarks,
} from './marks';

const NAMES = 108;

describe('createMarks', () => {
  test('allocates one bit per step, rounded up to whole bytes', () => {
    expect(createMarks(NAMES)).toHaveLength(14);
    expect(createMarks(8)).toHaveLength(1);
    expect(createMarks(9)).toHaveLength(2);
    expect(createMarks(1)).toHaveLength(1);
  });

  test('starts with nothing chanted', () => {
    expect(countMarks(createMarks(NAMES), NAMES)).toBe(0);
  });

  test('rejects a step count that is not a positive integer', () => {
    expect(() => createMarks(0)).toThrow(RangeError);
    expect(() => createMarks(-1)).toThrow(RangeError);
    expect(() => createMarks(1.5)).toThrow(RangeError);
  });
});

describe('markStep', () => {
  test('marks a step as chanted', () => {
    const marks = markStep(createMarks(NAMES), 0, NAMES);

    expect(isStepChanted(marks, 0, NAMES)).toBe(true);
  });

  test('leaves the other steps unchanted', () => {
    const marks = markStep(createMarks(NAMES), 5, NAMES);

    expect(isStepChanted(marks, 4, NAMES)).toBe(false);
    expect(isStepChanted(marks, 6, NAMES)).toBe(false);
  });

  test('marks the last name', () => {
    const marks = markStep(createMarks(NAMES), NAMES - 1, NAMES);

    expect(isStepChanted(marks, NAMES - 1, NAMES)).toBe(true);
    expect(countMarks(marks, NAMES)).toBe(1);
  });

  test('does not mutate the marks it is given', () => {
    const before = createMarks(NAMES);

    markStep(before, 3, NAMES);

    expect(isStepChanted(before, 3, NAMES)).toBe(false);
  });

  test('marking the same step twice counts once', () => {
    const marks = markStep(markStep(createMarks(NAMES), 7, NAMES), 7, NAMES);

    expect(countMarks(marks, NAMES)).toBe(1);
  });

  test('rejects a step past the last real name, not merely past the last bit', () => {
    // 108 names occupy 14 bytes, so bits 108..111 exist but are not names.
    const marks = createMarks(NAMES);

    expect(() => markStep(marks, NAMES, NAMES)).toThrow(RangeError);
    expect(() => markStep(marks, NAMES + 3, NAMES)).toThrow(RangeError);
    expect(() => markStep(marks, -1, NAMES)).toThrow(RangeError);
  });
});

describe('isStepChanted', () => {
  test('rejects a step past the last real name', () => {
    expect(() => isStepChanted(createMarks(NAMES), NAMES, NAMES)).toThrow(RangeError);
  });
});

describe('countMarks', () => {
  test('never counts the padding bits as chanted names', () => {
    // A corrupt or hostile bitset arriving from sync with every bit set must
    // still report at most the number of real names.
    const everyBitSet = new Uint8Array(14).fill(0xff);

    expect(countMarks(everyBitSet, NAMES)).toBe(NAMES);
  });

  test('counts only the marks that are set', () => {
    let marks = createMarks(NAMES);
    for (const i of [0, 5, 107]) marks = markStep(marks, i, NAMES);

    expect(countMarks(marks, NAMES)).toBe(3);
  });
});

describe('unionMarks', () => {
  test('a name chanted on either device stays chanted', () => {
    const a = markStep(markStep(createMarks(NAMES), 0, NAMES), 1, NAMES);
    const b = markStep(markStep(createMarks(NAMES), 1, NAMES), 2, NAMES);

    const merged = unionMarks(a, b);

    expect(isStepChanted(merged, 0, NAMES)).toBe(true);
    expect(isStepChanted(merged, 1, NAMES)).toBe(true);
    expect(isStepChanted(merged, 2, NAMES)).toBe(true);
    expect(countMarks(merged, NAMES)).toBe(3);
  });

  test('does not mutate either side', () => {
    const a = markStep(createMarks(NAMES), 0, NAMES);
    const b = markStep(createMarks(NAMES), 1, NAMES);

    unionMarks(a, b);

    expect(countMarks(a, NAMES)).toBe(1);
    expect(countMarks(b, NAMES)).toBe(1);
  });

  test('rejects bitsets of different lengths', () => {
    expect(() => unionMarks(createMarks(8), createMarks(16))).toThrow(RangeError);
  });
});

describe('isPassComplete', () => {
  test('is false until every step has been chanted', () => {
    let marks = createMarks(3);
    marks = markStep(marks, 0, 3);
    marks = markStep(marks, 1, 3);

    expect(isPassComplete(marks, 3)).toBe(false);
  });

  test('is true once every step has been chanted', () => {
    let marks = createMarks(3);
    for (let i = 0; i < 3; i += 1) marks = markStep(marks, i, 3);

    expect(isPassComplete(marks, 3)).toBe(true);
  });

  test('ignores the spare bits in the last byte', () => {
    let marks = createMarks(NAMES);
    for (let i = 0; i < NAMES; i += 1) marks = markStep(marks, i, NAMES);

    expect(isPassComplete(marks, NAMES)).toBe(true);
  });
});

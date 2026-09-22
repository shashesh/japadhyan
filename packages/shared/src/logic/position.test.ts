import { describe, expect, test } from 'vitest';

import type { Hlc, PracticePosition } from '../types';
import { countMarks, createMarks, isStepChanted, markStep } from './marks';
import { mergePositions } from './position';

const STEPS = 108;

const hlc = (millis: number, device_id = 'a'): Hlc => ({ millis, counter: 0, device_id });

function position(overrides: Partial<PracticePosition> = {}): PracticePosition {
  return {
    id: 'pos-1',
    user_id: 'user-1',
    practice_id: 'vishnu-ashtottara',
    practice_version: 1,
    step_index: 0,
    chanted_steps: createMarks(STEPS),
    pass_ordinal: 1,
    hlc: hlc(1000),
    deleted_at: null,
    ...overrides,
  };
}

/** A position with the given steps marked as chanted. */
function withMarks(indices: readonly number[], overrides: Partial<PracticePosition> = {}) {
  let marks = createMarks(STEPS);
  for (const i of indices) marks = markStep(marks, i, STEPS);
  return position({ chanted_steps: marks, ...overrides });
}

describe('mergePositions: practice_version', () => {
  test('a newer version wins, so a content reset holds', () => {
    const old = withMarks([0, 1, 2], { practice_version: 1, hlc: hlc(9000) });
    const reset = withMarks([], { practice_version: 2, hlc: hlc(1000) });

    const merged = mergePositions(old, reset);

    expect(merged.practice_version).toBe(2);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(0);
  });

  test('an old version never wins however late it syncs', () => {
    const stale = withMarks([0, 1, 2], { practice_version: 1, hlc: hlc(999_999) });
    const current = withMarks([5], { practice_version: 2, hlc: hlc(1) });

    expect(mergePositions(stale, current).practice_version).toBe(2);
    expect(mergePositions(current, stale).practice_version).toBe(2);
  });
});

describe('mergePositions: pass_ordinal', () => {
  test('a higher pass wins, so a finished recitation cannot come back', () => {
    const behind = withMarks([0, 1, 2], { pass_ordinal: 4, hlc: hlc(9000) });
    const ahead = withMarks([7], { pass_ordinal: 5, hlc: hlc(1000) });

    const merged = mergePositions(behind, ahead);

    expect(merged.pass_ordinal).toBe(5);
    expect(isStepChanted(merged.chanted_steps, 7, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 0, STEPS)).toBe(false);
  });

  test('pass_ordinal is only compared within the same version', () => {
    const oldVersionHighPass = withMarks([], { practice_version: 1, pass_ordinal: 99 });
    const newVersionLowPass = withMarks([], { practice_version: 2, pass_ordinal: 1 });

    const merged = mergePositions(oldVersionHighPass, newVersionLowPass);

    expect(merged.practice_version).toBe(2);
    expect(merged.pass_ordinal).toBe(1);
  });
});

describe('mergePositions: same version and pass', () => {
  test('combines the marks, so a name chanted on either device stays chanted', () => {
    const phone = withMarks([0, 1], { hlc: hlc(1000, 'phone') });
    const tablet = withMarks([1, 2], { hlc: hlc(2000, 'tablet') });

    const merged = mergePositions(phone, tablet);

    expect(isStepChanted(merged.chanted_steps, 0, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 1, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 2, STEPS)).toBe(true);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(3);
  });

  test('takes step_index from the higher hlc, not the higher index', () => {
    const earlierButFurther = withMarks([0], { step_index: 90, hlc: hlc(1000) });
    const laterButNearer = withMarks([0], { step_index: 3, hlc: hlc(2000) });

    expect(mergePositions(earlierButFurther, laterButNearer).step_index).toBe(3);
  });

  test('keeps the higher hlc so the merge propagates', () => {
    const merged = mergePositions(
      withMarks([0], { hlc: hlc(1000) }),
      withMarks([1], { hlc: hlc(2000) }),
    );

    expect(merged.hlc.millis).toBe(2000);
  });

  test('never loses a mark the loser of the hlc comparison had', () => {
    const losesOnHlc = withMarks([50, 51, 52], { hlc: hlc(1000) });
    const winsOnHlc = withMarks([0], { hlc: hlc(2000) });

    const merged = mergePositions(losesOnHlc, winsOnHlc);

    expect(countMarks(merged.chanted_steps, STEPS)).toBe(4);
  });
});

describe('mergePositions: general', () => {
  test('gives the same result whichever way round the devices merge', () => {
    const phone = withMarks([0, 1], { step_index: 5, hlc: hlc(1000, 'phone') });
    const tablet = withMarks([2], { step_index: 9, hlc: hlc(2000, 'tablet') });

    const a = mergePositions(phone, tablet);
    const b = mergePositions(tablet, phone);

    expect(a.step_index).toBe(b.step_index);
    expect(a.pass_ordinal).toBe(b.pass_ordinal);
    expect([...a.chanted_steps]).toEqual([...b.chanted_steps]);
  });

  test('merging a position with itself changes nothing', () => {
    const only = withMarks([0, 1, 2], { step_index: 3 });

    const merged = mergePositions(only, only);

    expect(merged.step_index).toBe(3);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(3);
  });

  test('does not mutate either side', () => {
    const phone = withMarks([0], { hlc: hlc(1000) });
    const tablet = withMarks([1], { hlc: hlc(2000) });

    mergePositions(phone, tablet);

    expect(countMarks(phone.chanted_steps, STEPS)).toBe(1);
    expect(countMarks(tablet.chanted_steps, STEPS)).toBe(1);
  });

  test('refuses to merge positions for different practices', () => {
    expect(() => mergePositions(position(), position({ practice_id: 'om-namah-shivaya' }))).toThrow(
      /different practices/i,
    );
  });
});

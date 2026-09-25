import { describe, expect, test } from 'vitest';

import type { Hlc, PracticePosition } from '../types';
import { countMarks, createMarks, isStepChanted, markStep } from './marks';
import { isPositionDeleted, mergePositions } from './position';

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
    deleted_hlc: null,
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

    const merged = mergePositions(old, reset, STEPS);

    expect(merged.practice_version).toBe(2);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(0);
  });

  test('an old version never wins however late it syncs', () => {
    const stale = withMarks([0, 1, 2], { practice_version: 1, hlc: hlc(999_999) });
    const current = withMarks([5], { practice_version: 2, hlc: hlc(1) });

    expect(mergePositions(stale, current, STEPS).practice_version).toBe(2);
    expect(mergePositions(current, stale, STEPS).practice_version).toBe(2);
  });
});

describe('mergePositions: pass_ordinal', () => {
  test('a higher pass wins, so a finished recitation cannot come back', () => {
    const behind = withMarks([0, 1, 2], { pass_ordinal: 4, hlc: hlc(9000) });
    const ahead = withMarks([7], { pass_ordinal: 5, hlc: hlc(1000) });

    const merged = mergePositions(behind, ahead, STEPS);

    expect(merged.pass_ordinal).toBe(5);
    expect(isStepChanted(merged.chanted_steps, 7, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 0, STEPS)).toBe(false);
  });

  test('pass_ordinal is only compared within the same version', () => {
    const oldVersionHighPass = withMarks([], { practice_version: 1, pass_ordinal: 99 });
    const newVersionLowPass = withMarks([], { practice_version: 2, pass_ordinal: 1 });

    const merged = mergePositions(oldVersionHighPass, newVersionLowPass, STEPS);

    expect(merged.practice_version).toBe(2);
    expect(merged.pass_ordinal).toBe(1);
  });
});

describe('mergePositions: same version and pass', () => {
  test('combines the marks, so a name chanted on either device stays chanted', () => {
    const phone = withMarks([0, 1], { hlc: hlc(1000, 'phone') });
    const tablet = withMarks([1, 2], { hlc: hlc(2000, 'tablet') });

    const merged = mergePositions(phone, tablet, STEPS);

    expect(isStepChanted(merged.chanted_steps, 0, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 1, STEPS)).toBe(true);
    expect(isStepChanted(merged.chanted_steps, 2, STEPS)).toBe(true);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(3);
  });

  test('takes step_index from the higher hlc, not the higher index', () => {
    const earlierButFurther = withMarks([0], { step_index: 90, hlc: hlc(1000) });
    const laterButNearer = withMarks([0], { step_index: 3, hlc: hlc(2000) });

    expect(mergePositions(earlierButFurther, laterButNearer, STEPS).step_index).toBe(3);
  });

  test('keeps the higher hlc so the merge propagates', () => {
    const merged = mergePositions(
      withMarks([0], { hlc: hlc(1000) }),
      withMarks([1], { hlc: hlc(2000) }),
      STEPS,
    );

    expect(merged.hlc.millis).toBe(2000);
  });

  test('never loses a mark the loser of the hlc comparison had', () => {
    const losesOnHlc = withMarks([50, 51, 52], { hlc: hlc(1000) });
    const winsOnHlc = withMarks([0], { hlc: hlc(2000) });

    const merged = mergePositions(losesOnHlc, winsOnHlc, STEPS);

    expect(countMarks(merged.chanted_steps, STEPS)).toBe(4);
  });
});

describe('mergePositions: deletions', () => {
  test('a deletion is not resurrected by a higher pass from an earlier edit', () => {
    const deleted = withMarks([], {
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });
    const livePastIt = withMarks([0], { pass_ordinal: 99, hlc: hlc(1000) });

    expect(isPositionDeleted(mergePositions(deleted, livePastIt, STEPS))).toBe(true);
  });

  test('a deletion is not resurrected by a newer practice version from an earlier edit', () => {
    const deleted = withMarks([], {
      practice_version: 1,
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });
    const livePastIt = withMarks([0], { practice_version: 2, hlc: hlc(1000) });

    expect(isPositionDeleted(mergePositions(deleted, livePastIt, STEPS))).toBe(true);
  });

  test('chanting again after a deletion brings the position back', () => {
    const deleted = withMarks([], {
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(1000),
      hlc: hlc(0),
    });
    const chantedSince = withMarks([0], { hlc: hlc(9000) });

    expect(isPositionDeleted(mergePositions(deleted, chantedSince, STEPS))).toBe(false);
  });

  test('settles the same way whichever device merges', () => {
    const deleted = withMarks([], {
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });
    const live = withMarks([0], { pass_ordinal: 99, hlc: hlc(1000) });

    expect(isPositionDeleted(mergePositions(deleted, live, STEPS))).toBe(
      isPositionDeleted(mergePositions(live, deleted, STEPS)),
    );
  });

  test('a tie on deleted_hlc settles on the later deleted_at, whichever device merges', () => {
    // Only a corrupt row pairs one clock with two times, but the merge must
    // still not depend on which side it arrives on.
    const earlier = position({
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });
    const later = position({
      deleted_at: '2026-09-22T12:05:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });

    expect(mergePositions(earlier, later, STEPS).deleted_at).toBe('2026-09-22T12:05:00.000Z');
    expect(mergePositions(later, earlier, STEPS).deleted_at).toBe('2026-09-22T12:05:00.000Z');
  });

  test('a tie on deleted_hlc with an unparsable deleted_at still settles one way', () => {
    const garbled = position({ deleted_at: 'not a time', deleted_hlc: hlc(9000), hlc: hlc(0) });
    const valid = position({
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      hlc: hlc(0),
    });

    expect(mergePositions(garbled, valid, STEPS)).toEqual(mergePositions(valid, garbled, STEPS));
  });

  test('a tombstone is accepted even when its bitset is a stale size', () => {
    // A deleted bookmark's marks mean nothing, so they are not worth rejecting.
    const deleted = position({
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      chanted_steps: createMarks(9),
      hlc: hlc(0),
    });
    const live = withMarks([0], { hlc: hlc(1000) });

    expect(() => mergePositions(deleted, live, STEPS)).not.toThrow();
  });
});

describe('mergePositions: associativity', () => {
  // Devices and the server merge in whatever order rows arrive, so the
  // grouping must not change the answer or replicas never converge.
  const deletedAt = '2026-09-22T12:00:00.000Z';

  test('a tombstone between two live edits does not depend on grouping', () => {
    const a = withMarks([0], { id: 'pos-a', hlc: hlc(1) });
    const tombstone = position({
      id: 'pos-t',
      deleted_at: deletedAt,
      deleted_hlc: hlc(2),
      hlc: hlc(0),
    });
    const b = withMarks([1], { id: 'pos-b', hlc: hlc(3) });

    const left = mergePositions(mergePositions(a, tombstone, STEPS), b, STEPS);
    const right = mergePositions(a, mergePositions(tombstone, b, STEPS), STEPS);

    expect([...left.chanted_steps]).toEqual([...right.chanted_steps]);
    expect(isPositionDeleted(left)).toBe(isPositionDeleted(right));
    expect(left.step_index).toBe(right.step_index);
  });

  test('three live edits do not depend on grouping', () => {
    const a = withMarks([0], { id: 'pos-a', hlc: hlc(1) });
    const b = withMarks([1], { id: 'pos-b', hlc: hlc(2) });
    const c = withMarks([2], { id: 'pos-c', hlc: hlc(3) });

    const left = mergePositions(mergePositions(a, b, STEPS), c, STEPS);
    const right = mergePositions(a, mergePositions(b, c, STEPS), STEPS);

    expect([...left.chanted_steps]).toEqual([...right.chanted_steps]);
    expect(left.step_index).toBe(right.step_index);
  });

  test('a newer version among three does not depend on grouping', () => {
    const a = withMarks([0], { id: 'pos-a', practice_version: 1, hlc: hlc(1) });
    const reset = withMarks([], { id: 'pos-r', practice_version: 2, hlc: hlc(2) });
    const c = withMarks([2], { id: 'pos-c', practice_version: 1, hlc: hlc(3) });

    const left = mergePositions(mergePositions(a, reset, STEPS), c, STEPS);
    const right = mergePositions(a, mergePositions(reset, c, STEPS), STEPS);

    expect(left.practice_version).toBe(right.practice_version);
    expect([...left.chanted_steps]).toEqual([...right.chanted_steps]);
  });
});

describe('mergePositions: general', () => {
  test('gives the same result whichever way round the devices merge', () => {
    const phone = withMarks([0, 1], { step_index: 5, hlc: hlc(1000, 'phone') });
    const tablet = withMarks([2], { step_index: 9, hlc: hlc(2000, 'tablet') });

    const a = mergePositions(phone, tablet, STEPS);
    const b = mergePositions(tablet, phone, STEPS);

    expect(a.step_index).toBe(b.step_index);
    expect(a.pass_ordinal).toBe(b.pass_ordinal);
    expect([...a.chanted_steps]).toEqual([...b.chanted_steps]);
  });

  test('merging a position with itself changes nothing', () => {
    const only = withMarks([0, 1, 2], { step_index: 3 });

    const merged = mergePositions(only, only, STEPS);

    expect(merged.step_index).toBe(3);
    expect(countMarks(merged.chanted_steps, STEPS)).toBe(3);
  });

  test('does not mutate either side', () => {
    const phone = withMarks([0], { hlc: hlc(1000) });
    const tablet = withMarks([1], { hlc: hlc(2000) });

    mergePositions(phone, tablet, STEPS);

    expect(countMarks(phone.chanted_steps, STEPS)).toBe(1);
    expect(countMarks(tablet.chanted_steps, STEPS)).toBe(1);
  });

  test('refuses a live winner whose step_index is not a real name', () => {
    // 108 names are indexes 0..107, so 108 addresses nothing.
    const past = withMarks([0], { step_index: STEPS, practice_version: 2 });
    const behind = withMarks([0], { practice_version: 1 });

    expect(() => mergePositions(past, behind, STEPS)).toThrow(RangeError);
    expect(() => mergePositions(behind, past, STEPS)).toThrow(RangeError);
  });

  test('refuses a live winner with a negative step_index', () => {
    const negative = withMarks([0], { step_index: -1, practice_version: 2 });
    const behind = withMarks([0], { practice_version: 1 });

    expect(() => mergePositions(negative, behind, STEPS)).toThrow(RangeError);
  });

  test('accepts the last real name as a step_index', () => {
    const onLastName = withMarks([0], { step_index: STEPS - 1, practice_version: 2 });
    const behind = withMarks([0], { practice_version: 1 });

    expect(mergePositions(onLastName, behind, STEPS).step_index).toBe(STEPS - 1);
  });

  test('does not police the step_index of a tombstone', () => {
    // A deleted bookmark points nowhere; its index means as little as its marks.
    const deleted = position({
      deleted_at: '2026-09-22T12:00:00.000Z',
      deleted_hlc: hlc(9000),
      step_index: STEPS + 5,
      hlc: hlc(0),
    });
    const live = withMarks([0], { hlc: hlc(1000) });

    expect(() => mergePositions(deleted, live, STEPS)).not.toThrow();
  });

  test('refuses to return a malformed position through the early-exit paths', () => {
    // A newer version wins outright, so it never reaches unionMarks. It must
    // still be rejected rather than propagated to the rest of the app.
    const valid = withMarks([0], { practice_version: 1 });
    const malformed = position({ practice_version: 2, chanted_steps: new Uint8Array(1) });

    expect(() => mergePositions(valid, malformed, STEPS)).toThrow(RangeError);
    expect(() => mergePositions(malformed, valid, STEPS)).toThrow(RangeError);
  });

  test('a losing position of a different size does not block the merge', () => {
    // A version bump may change the step count, so the older position's
    // bitset is legitimately a different size. It loses; it is not corrupt.
    const oldVersionNineSteps = position({
      practice_version: 1,
      chanted_steps: createMarks(9),
    });
    const current = withMarks([0], { practice_version: 2 });

    expect(mergePositions(oldVersionNineSteps, current, STEPS).practice_version).toBe(2);
  });

  test('settles the same way on both devices when the clocks are identical', () => {
    // compareHlc returns 0 only for the very same clock; without a further
    // tie-break the first argument would always win and replicas diverge.
    const sameClock = hlc(1000, 'same-device');
    const a = withMarks([0], { id: 'pos-a', step_index: 5, hlc: sameClock });
    const b = withMarks([1], { id: 'pos-b', step_index: 9, hlc: sameClock });

    const ab = mergePositions(a, b, STEPS);
    const ba = mergePositions(b, a, STEPS);

    expect(ab.step_index).toBe(ba.step_index);
    expect(ab.id).toBe(ba.id);
    expect([...ab.chanted_steps]).toEqual([...ba.chanted_steps]);
  });

  test('refuses to merge two devotees’ positions for the same practice', () => {
    // Positions are unique per (user_id, practice_id). Combining across
    // owners would pool their marks and return them under one devotee.
    expect(() => mergePositions(position(), position({ user_id: 'user-2' }), STEPS)).toThrow(
      /different (owners|devotees)/i,
    );
  });

  test('refuses to merge positions for different practices', () => {
    expect(() =>
      mergePositions(position(), position({ practice_id: 'om-namah-shivaya' }), STEPS),
    ).toThrow(/different practices/i);
  });
});

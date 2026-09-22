import { describe, expect, test } from 'vitest';

import type { Hlc, PracticePosition } from '../types';
import { createMarks, markStep } from './marks';
import { mergePositions } from './position';

/**
 * The merge exists to make devices converge. That rests on three properties,
 * and examples do not establish them: a two-element example cannot show
 * associativity at all, which is how a non-associative deletion branch once
 * shipped here with the example tests green.
 *
 * These run every combination from a small pool that varies each field the
 * merge looks at.
 */

const STEPS = 16;

const hlc = (millis: number, device_id: string): Hlc => ({ millis, counter: 0, device_id });

function marksOf(indices: readonly number[]): Uint8Array {
  let marks = createMarks(STEPS);
  for (const i of indices) marks = markStep(marks, i, STEPS);
  return marks;
}

function position(id: string, overrides: Partial<PracticePosition> = {}): PracticePosition {
  return {
    id,
    user_id: 'user-1',
    practice_id: 'vishnu-ashtottara',
    practice_version: 1,
    step_index: 0,
    chanted_steps: createMarks(STEPS),
    pass_ordinal: 1,
    hlc: hlc(1, 'a'),
    deleted_at: null,
    deleted_hlc: null,
    ...overrides,
  };
}

/** Varies every field the merge branches on, including ties. */
const POOL: readonly PracticePosition[] = [
  position('p1', { chanted_steps: marksOf([0]), step_index: 1, hlc: hlc(1, 'a') }),
  position('p2', { chanted_steps: marksOf([1]), step_index: 2, hlc: hlc(2, 'b') }),
  position('p3', { chanted_steps: marksOf([2]), step_index: 3, hlc: hlc(3, 'c') }),
  // Same clock as p3, to exercise the tie-break.
  position('p4', { chanted_steps: marksOf([3]), step_index: 4, hlc: hlc(3, 'c') }),
  position('p5', { pass_ordinal: 2, chanted_steps: marksOf([4]), step_index: 5, hlc: hlc(2, 'a') }),
  position('p6', {
    practice_version: 2,
    chanted_steps: marksOf([5]),
    step_index: 6,
    hlc: hlc(1, 'b'),
  }),
  position('p7', {
    deleted_at: '2026-09-22T12:00:00.000Z',
    deleted_hlc: hlc(2, 'c'),
    step_index: 7,
    hlc: hlc(0, 'c'),
  }),
  position('p8', {
    deleted_at: '2026-09-22T13:00:00.000Z',
    deleted_hlc: hlc(4, 'a'),
    step_index: 8,
    hlc: hlc(0, 'a'),
  }),
];

/** The fields that must agree for two devices to have converged. */
const shape = (p: PracticePosition) => ({
  practice_version: p.practice_version,
  pass_ordinal: p.pass_ordinal,
  step_index: p.step_index,
  deleted_at: p.deleted_at,
  deleted_hlc: p.deleted_hlc,
  hlc: p.hlc,
  marks: [...p.chanted_steps],
});

const merge = (a: PracticePosition, b: PracticePosition) => mergePositions(a, b, STEPS);

describe('mergePositions is a proper merge', () => {
  test('is idempotent: merging a position with itself changes nothing', () => {
    for (const p of POOL) {
      expect(shape(merge(p, p))).toEqual(shape(p));
    }
  });

  test('is commutative: the order of two devices never matters', () => {
    for (const a of POOL) {
      for (const b of POOL) {
        expect(shape(merge(a, b))).toEqual(shape(merge(b, a)));
      }
    }
  });

  test('is associative: how rows are grouped during sync never matters', () => {
    for (const a of POOL) {
      for (const b of POOL) {
        for (const c of POOL) {
          const left = merge(merge(a, b), c);
          const right = merge(a, merge(b, c));
          expect({ a: a.id, b: b.id, c: c.id, shape: shape(left) }).toEqual({
            a: a.id,
            b: b.id,
            c: c.id,
            shape: shape(right),
          });
        }
      }
    }
  });

  test('every ordering of the same three edits reaches one answer', () => {
    // What convergence actually means: whatever order rows arrive in, and
    // however they are grouped, every device ends up with the same position.
    for (const a of POOL) {
      for (const b of POOL) {
        for (const c of POOL) {
          const orderings = [
            merge(merge(a, b), c),
            merge(merge(a, c), b),
            merge(merge(b, c), a),
            merge(merge(b, a), c),
            merge(merge(c, a), b),
            merge(merge(c, b), a),
          ].map(shape);

          for (const result of orderings) {
            expect(result).toEqual(orderings[0]);
          }
        }
      }
    }
  });
});

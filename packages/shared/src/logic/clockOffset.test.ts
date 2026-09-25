import { describe, expect, test } from 'vitest';

import type { Hlc, PracticePosition } from '../types';
import { RESTAMP_MARGIN_MS, clockForEdit, clockOffsetMs, restampPosition } from './clockOffset';
import { compareHlc } from './hlc';
import { createMarks } from './marks';
import { isPositionDeleted } from './position';

const NOW = 1_727_190_000_000;
const TEN_MINUTES = 10 * 60 * 1000;
const DEVICE = 'device-b';

const hlc = (millis: number, counter = 0, device_id = DEVICE): Hlc => ({
  millis,
  counter,
  device_id,
});

function position(overrides: Partial<PracticePosition> = {}): PracticePosition {
  return {
    id: '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
    user_id: '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79',
    practice_id: 'vishnu-ashtottara',
    practice_version: 1,
    step_index: 3,
    chanted_steps: createMarks(108),
    pass_ordinal: 0,
    hlc: hlc(NOW),
    deleted_hlc: null,
    deleted_at: null,
    ...overrides,
  };
}

/** Within the margin of the corrected time, and stamped by this device. */
function expectOnTime(clock: Hlc | null): void {
  expect(clock).not.toBeNull();
  expect(clock!.millis - NOW).toBeLessThanOrEqual(RESTAMP_MARGIN_MS);
  expect(clock!.device_id).toBe(DEVICE);
}

describe('clockOffsetMs', () => {
  test('is the server time minus the midpoint of the request', () => {
    expect(clockOffsetMs(10_000, 1_000, 1_200)).toBe(8_900);
  });

  test('is negative for a device whose clock runs fast', () => {
    expect(clockOffsetMs(NOW, NOW + TEN_MINUTES, NOW + TEN_MINUTES + 100)).toBe(-TEN_MINUTES - 50);
  });

  test('rejects a reply received before the request was sent, and times that are not finite', () => {
    expect(() => clockOffsetMs(NOW, 2_000, 1_000)).toThrow(RangeError);
    expect(() => clockOffsetMs(Number.NaN, 1_000, 1_000)).toThrow(RangeError);
    expect(() => clockOffsetMs(NOW, 1_000, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('restampPosition', () => {
  test('leaves a position alone when neither clock runs more than the margin ahead', () => {
    const atTheMargin = position({
      hlc: hlc(NOW + RESTAMP_MARGIN_MS),
      deleted_hlc: hlc(NOW - 1),
      deleted_at: '2026-09-24T05:30:00.000Z',
    });

    expect(restampPosition(atTheMargin, NOW, DEVICE)).toBeNull();
  });

  test('restamps a live position whose hlc runs ahead', () => {
    const ahead = position({ hlc: hlc(NOW + RESTAMP_MARGIN_MS + 1) });

    const restamped = restampPosition(ahead, NOW, DEVICE);

    expectOnTime(restamped!.hlc);
    expect(restamped!.deleted_hlc).toBeNull();
  });

  test('restamps both clocks when either runs ahead, and a deleted position stays deleted', () => {
    const deleted = position({
      hlc: hlc(NOW + TEN_MINUTES),
      deleted_hlc: hlc(NOW + TEN_MINUTES, 1),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });

    const restamped = restampPosition(deleted, NOW, DEVICE)!;

    expectOnTime(restamped.hlc);
    expectOnTime(restamped.deleted_hlc);
    expect(isPositionDeleted(restamped)).toBe(true);
  });

  test('a position deleted then chanted on again stays live', () => {
    const revived = position({
      hlc: hlc(NOW + TEN_MINUTES, 1),
      deleted_hlc: hlc(NOW + TEN_MINUTES),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });

    const restamped = restampPosition(revived, NOW, DEVICE)!;

    expect(isPositionDeleted(restamped)).toBe(false);
  });

  test('a deletion running ahead of an on-time hlc is restamped with it, and stays a deletion', () => {
    const deleted = position({
      hlc: hlc(NOW - 5_000, 0, 'device-a'),
      deleted_hlc: hlc(NOW + TEN_MINUTES),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });

    const restamped = restampPosition(deleted, NOW, DEVICE)!;

    expectOnTime(restamped.hlc);
    expectOnTime(restamped.deleted_hlc);
    expect(isPositionDeleted(restamped)).toBe(true);
  });

  test('equal clocks mean live, and stay live', () => {
    const tied = position({
      hlc: hlc(NOW + TEN_MINUTES),
      deleted_hlc: hlc(NOW + TEN_MINUTES),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });
    expect(isPositionDeleted(tied)).toBe(false);

    expect(isPositionDeleted(restampPosition(tied, NOW, DEVICE)!)).toBe(false);
  });

  test('keeps every other field, and does not change its argument', () => {
    const ahead = position({
      hlc: hlc(NOW + TEN_MINUTES),
      deleted_hlc: hlc(NOW + TEN_MINUTES, 1),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });
    const before = {
      ...ahead,
      hlc: { ...ahead.hlc },
      deleted_hlc: { ...ahead.deleted_hlc! },
      chanted_steps: Uint8Array.from(ahead.chanted_steps),
    };

    const restamped = restampPosition(ahead, NOW, DEVICE)!;

    expect(ahead).toEqual(before);
    expect({ ...restamped, hlc: ahead.hlc, deleted_hlc: ahead.deleted_hlc }).toEqual(ahead);
  });

  test('whether a position is deleted never changes, whichever clocks run ahead', () => {
    const offsets = [-TEN_MINUTES, -1, 0, RESTAMP_MARGIN_MS, RESTAMP_MARGIN_MS + 1, TEN_MINUTES];
    const counters = [0, 1];
    for (const hlcOffset of offsets) {
      for (const deletedOffset of [null, ...offsets]) {
        for (const hlcCounter of counters) {
          for (const deletedCounter of counters) {
            const original = position({
              hlc: hlc(NOW + hlcOffset, hlcCounter, 'device-a'),
              deleted_hlc:
                deletedOffset === null
                  ? null
                  : hlc(NOW + deletedOffset, deletedCounter, 'device-c'),
              deleted_at: deletedOffset === null ? null : '2026-09-24T05:40:00.000Z',
            });

            const restamped = restampPosition(original, NOW, DEVICE) ?? original;

            expect(isPositionDeleted(restamped), JSON.stringify(original)).toBe(
              isPositionDeleted(original),
            );
          }
        }
      }
    }
  });
});

describe('clockForEdit', () => {
  test("a device's first edit to a practice takes the corrected time", () => {
    expect(clockForEdit(null, NOW, DEVICE)).toEqual({ base: null, hlc: hlc(NOW) });
  });

  test('an edit sorts after both clocks, so chanting after a deletion brings the position back', () => {
    const deleted = position({
      hlc: hlc(NOW - 2_000, 0, 'device-a'),
      deleted_hlc: hlc(NOW - 1_000, 0, 'device-a'),
      deleted_at: '2026-09-24T05:30:00.000Z',
    });

    const { base, hlc: next } = clockForEdit(deleted, NOW - 5_000, DEVICE);

    expect(base).toBe(deleted);
    expect(compareHlc(next, deleted.deleted_hlc!)).toBeGreaterThan(0);
    expect(isPositionDeleted({ ...deleted, hlc: next })).toBe(false);
  });

  test('a clock received from another device still counts, if it is within the margin', () => {
    const received = position({ hlc: hlc(NOW + 30_000, 4, 'device-a') });

    const { hlc: next } = clockForEdit(received, NOW, DEVICE);

    expect(next).toEqual(hlc(NOW + 30_000, 5));
  });

  test('clocks that ran ahead are restamped first, so their lead is not carried into the edit', () => {
    const ahead = position({
      hlc: hlc(NOW + TEN_MINUTES),
      deleted_hlc: hlc(NOW + TEN_MINUTES, 1),
      deleted_at: '2026-09-24T05:40:00.000Z',
    });

    const { base, hlc: next } = clockForEdit(ahead, NOW, DEVICE);

    expectOnTime(base!.deleted_hlc);
    expectOnTime(next);
    expect(compareHlc(next, base!.deleted_hlc!)).toBeGreaterThan(0);
  });
});

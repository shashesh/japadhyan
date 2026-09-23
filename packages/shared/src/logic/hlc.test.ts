import { describe, expect, test } from 'vitest';

import type { Hlc } from '../types';
import { MAX_CLOCK_DRIFT_MS, compareHlc, isTooFarAhead, issueHlc, receiveHlc } from './hlc';

const hlc = (millis: number, counter: number, device_id: string): Hlc => ({
  millis,
  counter,
  device_id,
});

describe('compareHlc', () => {
  test('orders by millis first', () => {
    expect(compareHlc(hlc(2, 0, 'a'), hlc(1, 99, 'z'))).toBeGreaterThan(0);
  });

  test('orders by counter when millis are equal', () => {
    expect(compareHlc(hlc(1, 2, 'a'), hlc(1, 1, 'z'))).toBeGreaterThan(0);
  });

  test('breaks an exact tie by device id, so every device settles the same way', () => {
    expect(compareHlc(hlc(1, 1, 'b'), hlc(1, 1, 'a'))).toBeGreaterThan(0);
    expect(compareHlc(hlc(1, 1, 'a'), hlc(1, 1, 'b'))).toBeLessThan(0);
  });

  test('is zero for the same clock', () => {
    expect(compareHlc(hlc(1, 1, 'a'), hlc(1, 1, 'a'))).toBe(0);
  });
});

describe('issueHlc', () => {
  test('uses the wall clock on a device that has issued nothing', () => {
    expect(issueHlc(null, 1000, 'a')).toEqual(hlc(1000, 0, 'a'));
  });

  test('increments the counter when the wall clock has not moved', () => {
    const first = issueHlc(null, 1000, 'a');

    const second = issueHlc(first, 1000, 'a');

    expect(second).toEqual(hlc(1000, 1, 'a'));
  });

  test('resets the counter once the wall clock advances', () => {
    const first = issueHlc(null, 1000, 'a');

    const second = issueHlc(first, 1001, 'a');

    expect(second).toEqual(hlc(1001, 0, 'a'));
  });

  test('never goes backwards when the phone clock does', () => {
    const first = issueHlc(null, 5000, 'a');

    const second = issueHlc(first, 1000, 'a');

    expect(compareHlc(second, first)).toBeGreaterThan(0);
    expect(second.millis).toBe(5000);
  });

  test('every issued clock is greater than the last', () => {
    let last = issueHlc(null, 1000, 'a');
    for (let i = 0; i < 50; i += 1) {
      const next = issueHlc(last, 1000, 'a');
      expect(compareHlc(next, last)).toBeGreaterThan(0);
      last = next;
    }
  });
});

describe('receiveHlc', () => {
  test('an edit made after seeing another edit wins, even with a slow phone clock', () => {
    // This device's clock is far behind the one that made the remote edit.
    const remote = hlc(9000, 0, 'b');

    const afterSync = receiveHlc(issueHlc(null, 1000, 'a'), remote, 1000, 'a');
    const ourEdit = issueHlc(afterSync, 1000, 'a');

    expect(compareHlc(ourEdit, remote)).toBeGreaterThan(0);
  });

  test('moves the clock forward to the remote time', () => {
    const afterSync = receiveHlc(null, hlc(9000, 3, 'b'), 1000, 'a');

    expect(afterSync.millis).toBe(9000);
  });

  test('keeps the local time when it is already ahead of the remote', () => {
    const local = issueHlc(null, 9000, 'a');

    const afterSync = receiveHlc(local, hlc(1000, 0, 'b'), 9000, 'a');

    expect(afterSync.millis).toBe(9000);
    expect(compareHlc(afterSync, local)).toBeGreaterThan(0);
  });

  test('uses the wall clock when it is ahead of both', () => {
    const afterSync = receiveHlc(issueHlc(null, 1000, 'a'), hlc(2000, 0, 'b'), 5000, 'a');

    expect(afterSync).toEqual(hlc(5000, 0, 'a'));
  });

  test('receiving the same remote edit twice still moves forward', () => {
    const remote = hlc(9000, 0, 'b');
    const once = receiveHlc(null, remote, 1000, 'a');

    const twice = receiveHlc(once, remote, 1000, 'a');

    expect(compareHlc(twice, once)).toBeGreaterThan(0);
  });
});

describe('isTooFarAhead', () => {
  test('accepts a clock within the drift allowance', () => {
    expect(isTooFarAhead(hlc(1000 + MAX_CLOCK_DRIFT_MS - 1, 0, 'a'), 1000)).toBe(false);
  });

  test('rejects a clock more than five minutes ahead of the server', () => {
    expect(isTooFarAhead(hlc(1000 + MAX_CLOCK_DRIFT_MS + 1, 0, 'a'), 1000)).toBe(true);
  });

  test('accepts a clock behind the server', () => {
    expect(isTooFarAhead(hlc(1, 0, 'a'), 1000)).toBe(false);
  });

  test('is five minutes', () => {
    expect(MAX_CLOCK_DRIFT_MS).toBe(5 * 60 * 1000);
  });
});

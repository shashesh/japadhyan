import { describe, expect, test } from 'vitest';

import type { Hlc } from '../types';
import { compareHlc } from './hlc';
import { hlcFromText, hlcToText } from './hlcText';

const clock = (millis: number, counter: number, device_id: string): Hlc => ({
  millis,
  counter,
  device_id,
});

describe('hlcToText', () => {
  test('is fixed width: 15 digits of millis, 10 of counter, then the device', () => {
    expect(hlcToText(clock(1727190000000, 3, 'device-a'))).toBe(
      '001727190000000:0000000003:device-a',
    );
  });

  test('round-trips', () => {
    for (const hlc of [
      clock(0, 0, 'a'),
      clock(1727190000000, 3, 'device-a'),
      clock(999_999_999_999_999, 9_999_999_999, '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79'),
    ]) {
      expect(hlcFromText(hlcToText(hlc))).toEqual(hlc);
    }
  });

  /**
   * SQLite and Postgres compare the text with a plain `>`, so its byte order
   * must be `compareHlc`'s order for every pair — including ties on `millis`
   * and `counter`, and devices that differ only in punctuation, which a
   * collation that ignores punctuation would get backwards.
   */
  test('text order matches compareHlc', () => {
    const pool: readonly Hlc[] = [
      clock(9, 0, 'a'),
      clock(10, 0, 'a'),
      clock(10, 1, 'a'),
      clock(10, 10, 'a'),
      clock(10, 2, 'a'),
      clock(10, 1, 'b'),
      clock(10, 1, 'a-c'),
      clock(10, 1, 'ab'),
      clock(10, 1, '0'),
      clock(10, 1, '-'),
      clock(10, 1, 'a-'),
      clock(0, 9_999_999_999, 'z'),
      clock(1, 0, '0'),
    ];
    const sign = (n: number) => Math.sign(n);
    const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

    for (const a of pool) {
      for (const b of pool) {
        expect(
          sign(textOrder(hlcToText(a), hlcToText(b))),
          `${a.device_id} vs ${b.device_id}`,
        ).toBe(sign(compareHlc(a, b)));
      }
    }
  });

  test('rejects millis that are negative, fractional or beyond 15 digits', () => {
    for (const millis of [-1, 1.5, 1_000_000_000_000_000, Number.NaN]) {
      expect(() => hlcToText(clock(millis, 0, 'a'))).toThrow(RangeError);
    }
  });

  test('rejects a counter that is negative, fractional or beyond 10 digits', () => {
    for (const counter of [-1, 0.5, 10_000_000_000]) {
      expect(() => hlcToText(clock(0, counter, 'a'))).toThrow(RangeError);
    }
  });

  test('rejects a device_id outside lowercase letters, digits and hyphens', () => {
    for (const device_id of ['', 'Device', 'a:b', 'a b', 'é']) {
      expect(() => hlcToText(clock(0, 0, device_id))).toThrow(RangeError);
    }
  });
});

describe('hlcFromText', () => {
  test('rejects malformed text', () => {
    for (const text of [
      '',
      '1727190000000:0000000003:device-a', // millis too short
      '001727190000000:3:device-a', // counter too short
      '001727190000000:0000000003', // no device
      '001727190000000:0000000003:', // empty device
      '001727190000000:0000000003:device:a', // extra `:`
      '001727190000000:0000000003:Device', // not lowercase
      '00172719000000x:0000000003:device-a', // not a digit
    ]) {
      expect(() => hlcFromText(text), text).toThrow(RangeError);
    }
  });
});

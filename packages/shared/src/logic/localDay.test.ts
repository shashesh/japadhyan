import { describe, expect, test } from 'vitest';

import { MINUTES_PER_DAY, localDay, tzOffsetMinutes } from './localDay';

describe('localDay', () => {
  test('uses the local date, not the UTC date', () => {
    // 23:30 UTC is already the next day in India (+05:30).
    expect(localDay('2026-09-21T23:30:00.000Z', 330)).toBe('2026-09-22');
  });

  test('rolls back a day west of UTC', () => {
    // 02:00 UTC is still the previous evening in New York (-05:00).
    expect(localDay('2026-09-22T02:00:00.000Z', -300)).toBe('2026-09-21');
  });

  test('matches the UTC date at offset zero', () => {
    expect(localDay('2026-09-22T12:00:00.000Z', 0)).toBe('2026-09-22');
  });

  test('treats local midnight as the new day', () => {
    // 18:30 UTC is exactly 00:00 in India.
    expect(localDay('2026-09-21T18:30:00.000Z', 330)).toBe('2026-09-22');
  });

  test('treats the last moment before local midnight as the old day', () => {
    expect(localDay('2026-09-21T18:29:59.999Z', 330)).toBe('2026-09-21');
  });

  test('handles Brahma muhurta, the reason any of this matters', () => {
    // 04:30 IST is 23:00 UTC the previous day; it belongs to the Indian date.
    expect(localDay('2026-09-21T23:00:00.000Z', 330)).toBe('2026-09-22');
  });

  test('crosses a month boundary', () => {
    expect(localDay('2026-09-30T23:30:00.000Z', 330)).toBe('2026-10-01');
  });

  test('crosses a year boundary', () => {
    expect(localDay('2026-12-31T23:30:00.000Z', 330)).toBe('2027-01-01');
  });

  test('handles a leap day', () => {
    expect(localDay('2028-02-28T23:30:00.000Z', 330)).toBe('2028-02-29');
  });

  test('handles the widest real offsets', () => {
    expect(localDay('2026-09-22T00:00:00.000Z', 840)).toBe('2026-09-22'); // +14:00
    expect(localDay('2026-09-22T00:00:00.000Z', -720)).toBe('2026-09-21'); // -12:00
  });

  test('rejects a timestamp it cannot parse', () => {
    expect(() => localDay('not a timestamp', 0)).toThrow(RangeError);
  });

  test('rejects an offset beyond a whole day', () => {
    expect(() => localDay('2026-09-22T00:00:00.000Z', MINUTES_PER_DAY)).toThrow(RangeError);
    expect(() => localDay('2026-09-22T00:00:00.000Z', -MINUTES_PER_DAY)).toThrow(RangeError);
    expect(() => localDay('2026-09-22T00:00:00.000Z', 1.5)).toThrow(RangeError);
  });
});

describe('tzOffsetMinutes', () => {
  test('is positive east of UTC', () => {
    // Date#getTimezoneOffset is minutes *behind* UTC, so it inverts.
    expect(tzOffsetMinutes({ getTimezoneOffset: () => -330 } as Date)).toBe(330);
  });

  test('is negative west of UTC', () => {
    expect(tzOffsetMinutes({ getTimezoneOffset: () => 300 } as Date)).toBe(-300);
  });

  test('is zero at UTC', () => {
    expect(tzOffsetMinutes({ getTimezoneOffset: () => 0 } as Date)).toBe(0);
  });
});

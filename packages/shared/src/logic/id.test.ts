import { describe, expect, test } from 'vitest';

import { uuidv7 } from './id';

/** A random source that is not random, so ids are predictable in tests. */
const fixedBytes =
  (fill: number) =>
  (n: number): Uint8Array =>
    new Uint8Array(n).fill(fill);

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  test('looks like a version 7 UUID', () => {
    expect(uuidv7()).toMatch(UUID_V7);
  });

  test('sets the version nibble to 7', () => {
    expect(uuidv7({ nowMs: 0, randomBytes: fixedBytes(0xff) })[14]).toBe('7');
  });

  test('sets the variant bits to 10xx', () => {
    for (const fill of [0x00, 0xff, 0x55, 0xaa]) {
      const id = uuidv7({ nowMs: 0, randomBytes: fixedBytes(fill) });
      expect('89ab').toContain(id[19]);
    }
  });

  test('sorts by time, so ids made later sort after ids made earlier', () => {
    const early = uuidv7({ nowMs: 1_000_000_000_000, randomBytes: fixedBytes(0xff) });
    const late = uuidv7({ nowMs: 1_000_000_000_001, randomBytes: fixedBytes(0x00) });

    expect(early < late).toBe(true);
  });

  test('sorts by time across a long span', () => {
    const times = [0, 1, 1_000, 1_700_000_000_000, 2_000_000_000_000, 281_474_976_710_655];
    const ids = times.map((nowMs) => uuidv7({ nowMs, randomBytes: fixedBytes(0x00) }));

    expect([...ids].sort()).toEqual(ids);
  });

  test('is distinct for two ids made in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uuidv7({ nowMs: 1000 })));

    expect(ids.size).toBe(200);
  });

  test('encodes the timestamp in the leading hex digits', () => {
    const id = uuidv7({ nowMs: 0x0123456789ab, randomBytes: fixedBytes(0x00) });

    expect(id.slice(0, 8) + id.slice(9, 13)).toBe('0123456789ab');
  });

  test('is the same id for the same time and the same random bytes', () => {
    const options = { nowMs: 1000, randomBytes: fixedBytes(0x42) };

    expect(uuidv7(options)).toBe(uuidv7(options));
  });

  test('rejects a time that does not fit in 48 bits', () => {
    expect(() => uuidv7({ nowMs: 2 ** 48 })).toThrow(RangeError);
    expect(() => uuidv7({ nowMs: -1 })).toThrow(RangeError);
    expect(() => uuidv7({ nowMs: 1.5 })).toThrow(RangeError);
  });
});

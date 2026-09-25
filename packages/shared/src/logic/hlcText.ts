/**
 * A hybrid logical clock as one text value, for SQLite and Postgres, which
 * compare it with a plain `>`: `<millis>:<counter>:<device_id>`, with
 * `millis` zero-padded to 15 digits and `counter` to 10. Fixed widths make
 * byte order the same as {@link compareHlc}'s order.
 *
 * `device_id` is limited to lowercase letters, digits and hyphens, where byte
 * order and JavaScript's string order agree. Postgres must still compare the
 * column with `collate "C"`: other collations skip punctuation.
 *
 * See docs/architecture/data-model.md#conflict-rule.
 */

import type { Hlc } from '../types';

const MILLIS_DIGITS = 15;
const COUNTER_DIGITS = 10;
const DEVICE_ID = /^[a-z0-9-]+$/;
const HLC_TEXT = new RegExp(`^(\\d{${MILLIS_DIGITS}}):(\\d{${COUNTER_DIGITS}}):([a-z0-9-]+)$`);

function assertDigits(value: number, digits: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= 10 ** digits) {
    throw new RangeError(
      `${field} must be a whole number of at most ${digits} digits, got ${value}`,
    );
  }
}

export function hlcToText(hlc: Hlc): string {
  assertDigits(hlc.millis, MILLIS_DIGITS, 'millis');
  assertDigits(hlc.counter, COUNTER_DIGITS, 'counter');
  if (!DEVICE_ID.test(hlc.device_id)) {
    throw new RangeError(
      `device_id must be lowercase letters, digits and hyphens, got "${hlc.device_id}"`,
    );
  }
  const millis = String(hlc.millis).padStart(MILLIS_DIGITS, '0');
  const counter = String(hlc.counter).padStart(COUNTER_DIGITS, '0');
  return `${millis}:${counter}:${hlc.device_id}`;
}

export function hlcFromText(text: string): Hlc {
  const match = HLC_TEXT.exec(text);
  if (match === null) {
    throw new RangeError(`Not an hlc: "${text}"`);
  }
  // Safe: the pattern has exactly three groups, all required.
  return { millis: Number(match[1]!), counter: Number(match[2]!), device_id: match[3]! };
}

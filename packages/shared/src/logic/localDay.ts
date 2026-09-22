/**
 * Local day keys. A day of practice is the devotee's own day, so a session
 * in Brahma muhurta belongs to the date on their wall, not to UTC.
 *
 * Count events store `local_day` when they are sealed and are grouped by it
 * for ever after; nothing downstream converts `created_at` again.
 * See docs/architecture/data-model.md#countevent.
 */

import type { DayKey } from '../types';

export const MINUTES_PER_DAY = 24 * 60;

const MS_PER_MINUTE = 60 * 1000;

/**
 * The local day a moment falls on.
 *
 * @param isoTimestamp ISO 8601 instant, e.g. `2026-09-21T23:30:00.000Z`
 * @param tzOffsetMin minutes **east** of UTC, e.g. 330 for IST
 */
export function localDay(isoTimestamp: string, tzOffsetMin: number): DayKey {
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Cannot parse timestamp: ${isoTimestamp}`);
  }
  if (!Number.isInteger(tzOffsetMin) || Math.abs(tzOffsetMin) >= MINUTES_PER_DAY) {
    throw new RangeError(
      `tzOffsetMin must be a whole number of minutes within a day, got ${tzOffsetMin}`,
    );
  }
  return new Date(ms + tzOffsetMin * MS_PER_MINUTE).toISOString().slice(0, 10);
}

/**
 * This device's offset in minutes east of UTC, the sign `local_day` expects.
 * `Date#getTimezoneOffset` reports minutes *behind* UTC, so it is inverted.
 * Subtracting from zero rather than negating keeps UTC as `0`, not `-0`.
 */
export function tzOffsetMinutes(date: Date = new Date()): number {
  return 0 - date.getTimezoneOffset();
}

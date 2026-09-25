/**
 * Correcting a device's clock before its positions upload.
 *
 * Positions are ordered within a pass by `hlc`, and the server drops one more
 * than `MAX_CLOCK_DRIFT_MS` ahead of its time, answering success. A
 * phone whose clock runs fast would then keep its marks locally, see the
 * upload succeed, and lose them at the next download. So the device learns
 * the server's time when it connects, stamps new edits with the corrected
 * time, and restamps any queued edit that still runs ahead before sending it.
 *
 * See docs/architecture/data-model.md#conflict-rule.
 */

import type { Hlc, PracticePosition } from '../types';
import { compareHlc, issueHlc } from './hlc';

/**
 * A clock further ahead of the corrected time than this is restamped before
 * it uploads. It leaves room, inside the server's `MAX_CLOCK_DRIFT_MS`,
 * for the round trip that measured the offset.
 */
export const RESTAMP_MARGIN_MS = 60 * 1000;

/**
 * The server's time minus this device's, in milliseconds, from one round
 * trip: the server is taken to have read its clock halfway through it. Add it
 * to the device's clock to get the corrected time.
 */
export function clockOffsetMs(serverMs: number, sentMs: number, receivedMs: number): number {
  if (![serverMs, sentMs, receivedMs].every(Number.isFinite)) {
    throw new RangeError(`times must be finite, got ${serverMs}, ${sentMs}, ${receivedMs}`);
  }
  if (receivedMs < sentMs) {
    throw new RangeError(`the reply came before the request: sent ${sentMs}, got ${receivedMs}`);
  }
  return Math.round(serverMs - (sentMs + receivedMs) / 2);
}

function runsAhead(clock: Hlc | null, correctedNowMs: number): boolean {
  return clock !== null && clock.millis - correctedNowMs > RESTAMP_MARGIN_MS;
}

/**
 * The position with new clocks from the corrected time, or `null` when
 * neither of its clocks runs more than {@link RESTAMP_MARGIN_MS} ahead.
 *
 * When either runs ahead, **both** are restamped, in their original order:
 * restamping only one could move it to the other side of the other, so a
 * deleted position would come back or a live one would vanish. Equal clocks
 * mean live, so the deletion is issued first then too.
 */
export function restampPosition(
  position: PracticePosition,
  correctedNowMs: number,
  deviceId: string,
): PracticePosition | null {
  const { hlc, deleted_hlc } = position;
  if (!runsAhead(hlc, correctedNowMs) && !runsAhead(deleted_hlc, correctedNowMs)) return null;

  const first = issueHlc(null, correctedNowMs, deviceId);
  if (deleted_hlc === null) return { ...position, hlc: first };

  const second = issueHlc(first, correctedNowMs, deviceId);
  return compareHlc(deleted_hlc, hlc) > 0
    ? { ...position, hlc: first, deleted_hlc: second }
    : { ...position, deleted_hlc: first, hlc: second };
}

/**
 * The clock for a new edit to a position, and the position to apply it to.
 *
 * Clocks that ran ahead are restamped first, so their lead isn't carried
 * into the edit: this is how a device's own too-far-ahead clocks stop
 * counting. The new clock is then later than both of the position's, so the
 * edit wins and chanting after a deletion brings the position back. Clocks
 * received from other devices, being within the margin, still count.
 */
export function clockForEdit(
  position: PracticePosition | null,
  correctedNowMs: number,
  deviceId: string,
): { base: PracticePosition | null; hlc: Hlc } {
  if (position === null) return { base: null, hlc: issueHlc(null, correctedNowMs, deviceId) };

  const base = restampPosition(position, correctedNowMs, deviceId) ?? position;
  const latest =
    base.deleted_hlc !== null && compareHlc(base.deleted_hlc, base.hlc) > 0
      ? base.deleted_hlc
      : base.hlc;
  return { base, hlc: issueHlc(latest, correctedNowMs, deviceId) };
}

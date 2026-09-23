/**
 * Hybrid logical clock. Records where the latest edit wins are ordered by
 * this, not by the phone's clock alone: every edit takes a clock greater
 * than any the device has made *or received*, so an edit made after seeing
 * another edit always wins, even when the phone's clock is behind.
 *
 * See docs/architecture/data-model.md#conflict-rule.
 */

import type { Hlc } from '../types';

/**
 * How far ahead of the server a clock may be before the server rejects it.
 * The app then corrects its offset from the server's time and retries, so a
 * phone with a wildly wrong clock can't keep winning.
 */
export const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000;

/** Orders by `millis`, then `counter`, then `device_id`. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.millis !== b.millis) return a.millis - b.millis;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0;
}

/**
 * The next clock for an edit this device makes. Greater than `last` even if
 * the phone's wall clock has gone backwards.
 */
export function issueHlc(last: Hlc | null, nowMs: number, deviceId: string): Hlc {
  if (last !== null && last.millis >= nowMs) {
    return { millis: last.millis, counter: last.counter + 1, device_id: deviceId };
  }
  return { millis: nowMs, counter: 0, device_id: deviceId };
}

/**
 * Move this device's clock forward on receiving a record during sync, so the
 * next edit it makes sorts after the one it just saw.
 */
export function receiveHlc(last: Hlc | null, remote: Hlc, nowMs: number, deviceId: string): Hlc {
  const lastMillis = last?.millis ?? 0;
  const millis = Math.max(lastMillis, remote.millis, nowMs);

  if (millis === lastMillis && millis === remote.millis) {
    const counter = Math.max(last?.counter ?? 0, remote.counter) + 1;
    return { millis, counter, device_id: deviceId };
  }
  if (millis === lastMillis) {
    return { millis, counter: (last?.counter ?? 0) + 1, device_id: deviceId };
  }
  if (millis === remote.millis) {
    return { millis, counter: remote.counter + 1, device_id: deviceId };
  }
  return { millis, counter: 0, device_id: deviceId };
}

/** The server rejects a clock more than {@link MAX_CLOCK_DRIFT_MS} ahead of it. */
export function isTooFarAhead(hlc: Hlc, serverNowMs: number): boolean {
  return hlc.millis - serverNowMs > MAX_CLOCK_DRIFT_MS;
}

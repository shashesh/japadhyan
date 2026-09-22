/**
 * Merging a devotee's place in a namavali across devices.
 *
 * This is deliberately **not** a plain latest-edit-wins record. Comparing by
 * `hlc` alone would discard the names chanted on the losing device, so the
 * same-pass branch combines the marks and takes only `step_index` from the
 * higher `hlc`.
 *
 * See docs/architecture/data-model.md#practiceposition.
 */

import type { PracticePosition } from '../types';
import { compareHlc } from './hlc';
import { unionMarks } from './marks';

/**
 * Combine two devices' positions for the same practice. Compared by
 * `practice_version`, then `pass_ordinal`; within the same version and pass
 * the marks are unioned, so a name chanted on either device stays chanted.
 *
 * The result is the same whichever way round the two are merged, so every
 * device and the server settle on it.
 */
export function mergePositions(a: PracticePosition, b: PracticePosition): PracticePosition {
  // A position is unique per (user_id, practice_id). Merging across owners
  // would pool two devotees' marks and hand them to whichever hlc won.
  if (a.user_id !== b.user_id) {
    throw new Error(
      `Cannot merge positions belonging to different devotees: ${a.user_id} and ${b.user_id}`,
    );
  }
  if (a.practice_id !== b.practice_id) {
    throw new Error(
      `Cannot merge positions for different practices: ${a.practice_id} and ${b.practice_id}`,
    );
  }

  // A position saved against an older version never wins, so a content reset
  // holds however late an old device syncs.
  if (a.practice_version !== b.practice_version) {
    return a.practice_version > b.practice_version ? a : b;
  }

  // A device still on pass 4 can never bring it back over another's pass 5.
  // The finished recitation is already its own count event, so nothing is lost.
  if (a.pass_ordinal !== b.pass_ordinal) {
    return a.pass_ordinal > b.pass_ordinal ? a : b;
  }

  // Same version, same pass: both devices are in this recitation together.
  const [behind, ahead] = compareHlc(a.hlc, b.hlc) >= 0 ? [b, a] : [a, b];
  return {
    ...ahead,
    chanted_steps: unionMarks(behind.chanted_steps, ahead.chanted_steps),
  };
}

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
import { assertMarksSize, marksFit, unionMarks } from './marks';

/**
 * A total order over two positions in the same version and pass.
 *
 * `compareHlc` returns 0 for the very same clock, which would leave the
 * winner depending on argument order and let two devices diverge. Falling
 * back to `id`, then `step_index`, keeps the result identical on both.
 */
function comparePositions(a: PracticePosition, b: PracticePosition): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.step_index - b.step_index;
}

/**
 * Combine two devices' positions for the same practice. Compared by
 * `practice_version`, then `pass_ordinal`; within the same version and pass
 * the marks are unioned, so a name chanted on either device stays chanted.
 *
 * The result is the same whichever way round the two are merged, so every
 * device and the server settle on it.
 *
 * @param stepCount the practice's step count at the version being merged
 *   into. Only the **winner** is checked against it: a version bump may
 *   change the number of steps, so a losing position from an older version
 *   is legitimately a different size rather than corrupt.
 */
export function mergePositions(
  a: PracticePosition,
  b: PracticePosition,
  stepCount: number,
): PracticePosition {
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

  const merged = select(a, b, stepCount);
  // Every path out of this function is checked, including the early exits
  // that never reach unionMarks, so a malformed position can't be propagated.
  // A deleted bookmark points nowhere, so its marks and index mean nothing.
  if (merged.deleted_at === null) {
    assertMarksSize(merged.chanted_steps, stepCount);
    if (
      !Number.isInteger(merged.step_index) ||
      merged.step_index < 0 ||
      merged.step_index >= stepCount
    ) {
      throw new RangeError(`step_index must be 0..${stepCount - 1}, got ${merged.step_index}`);
    }
  }
  return merged;
}

function select(a: PracticePosition, b: PracticePosition, stepCount: number): PracticePosition {
  // Deletion is settled first, by the ordinary latest-edit-wins rule. A
  // bookmark that was deleted must not come back because another device's
  // stale row carries a higher version or pass; equally, chanting again
  // after a deletion brings it back.
  //
  // The marks are still combined rather than dropped. A tombstone that
  // erased them would not be associative: with a live edit either side of a
  // deletion, `(live ⊔ tombstone) ⊔ live` would lose the first device's
  // names while `live ⊔ (tombstone ⊔ live)` kept them, and replicas that
  // merged in different orders would never converge. Whether a revived
  // bookmark *should* keep names chanted before the deletion is a design
  // question: docs/product/open-questions.md#marks-across-a-deleted-position.
  if (a.deleted_at !== null || b.deleted_at !== null) {
    const winner = comparePositions(a, b) >= 0 ? a : b;
    const canCombine = marksFit(a.chanted_steps, stepCount) && marksFit(b.chanted_steps, stepCount);
    return canCombine
      ? { ...winner, chanted_steps: unionMarks(a.chanted_steps, b.chanted_steps, stepCount) }
      : winner;
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
  const [behind, ahead] = comparePositions(a, b) >= 0 ? [b, a] : [a, b];
  return {
    ...ahead,
    chanted_steps: unionMarks(behind.chanted_steps, ahead.chanted_steps, stepCount),
  };
}

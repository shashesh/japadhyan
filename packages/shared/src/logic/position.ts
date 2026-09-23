/**
 * Merging a devotee's place in a namavali across devices.
 *
 * Every part of the merge is a semilattice — a maximum, or a union — so the
 * whole is commutative, associative and idempotent, and devices converge
 * whatever order rows arrive in and however they are grouped:
 *
 * - **generation** (`practice_version`, then `pass_ordinal`): the higher wins,
 *   so a content reset holds and a finished recitation can't come back.
 * - **marks**: the union of the marks at the winning generation, so a name
 *   chanted on either device stays chanted. Comparing by `hlc` alone would
 *   discard the losing device's names.
 * - **`step_index`**: from the highest `hlc` at the winning generation.
 * - **`deleted_hlc`** with its `deleted_at`: one register, the later of the
 *   two, settled on its own and never competing with the generation. They
 *   travel together — storing only whether the row is *currently* deleted
 *   would lose the timestamp whenever a later edit revived it, and the merge
 *   would stop converging. Whether a position is deleted right now is derived
 *   by {@link isPositionDeleted}, never stored.
 *
 * See docs/decisions/2026-09-22-position-deletion-barrier.md.
 */

import type { Hlc, PracticePosition } from '../types';
import { compareHlc } from './hlc';
import { assertMarksSize, marksFit, unionMarks } from './marks';

/**
 * Whether a position is deleted **right now**: the deletion happened after
 * the last time the devotee chanted. Chanting again gives the row a later
 * `hlc` and so brings the bookmark back, without erasing the record of the
 * deletion that the merge needs to keep converging.
 */
export function isPositionDeleted(position: PracticePosition): boolean {
  return position.deleted_hlc !== null && compareHlc(position.deleted_hlc, position.hlc) > 0;
}

/** `practice_version`, then `pass_ordinal`. Higher is later. */
function compareGeneration(a: PracticePosition, b: PracticePosition): number {
  if (a.practice_version !== b.practice_version) {
    return a.practice_version - b.practice_version;
  }
  return a.pass_ordinal - b.pass_ordinal;
}

/**
 * A total order within one generation. `compareHlc` returns 0 for the very
 * same clock, which would leave the winner depending on argument order, so
 * ties fall back to `id` and then `step_index`.
 */
function compareWithinGeneration(a: PracticePosition, b: PracticePosition): number {
  const byHlc = compareHlc(a.hlc, b.hlc);
  if (byHlc !== 0) return byHlc;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.step_index - b.step_index;
}

/** The later of two deletions; empty when neither was ever deleted. */
function laterDeletion(
  a: PracticePosition,
  b: PracticePosition,
): { hlc: Hlc; at: string | null } | null {
  if (a.deleted_hlc === null && b.deleted_hlc === null) return null;
  if (a.deleted_hlc === null) return { hlc: b.deleted_hlc!, at: b.deleted_at };
  if (b.deleted_hlc === null) return { hlc: a.deleted_hlc, at: a.deleted_at };
  return compareHlc(a.deleted_hlc, b.deleted_hlc) >= 0
    ? { hlc: a.deleted_hlc, at: a.deleted_at }
    : { hlc: b.deleted_hlc, at: b.deleted_at };
}

/** The live half: generation, marks and the bookmark itself. */
function mergeLive(a: PracticePosition, b: PracticePosition, stepCount: number): PracticePosition {
  const byGeneration = compareGeneration(a, b);
  if (byGeneration !== 0) return byGeneration > 0 ? a : b;

  const [behind, ahead] = compareWithinGeneration(a, b) >= 0 ? [b, a] : [a, b];
  // Marks only combine within one generation; a stale-sized bitset from a
  // corrupt row can't be unioned, so the winner's stand and are checked below.
  const canCombine = marksFit(a.chanted_steps, stepCount) && marksFit(b.chanted_steps, stepCount);
  return canCombine
    ? {
        ...ahead,
        chanted_steps: unionMarks(behind.chanted_steps, ahead.chanted_steps, stepCount),
      }
    : ahead;
}

/**
 * Combine two devices' positions for the same practice.
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

  const live = mergeLive(a, b, stepCount);
  const deletion = laterDeletion(a, b);

  const merged: PracticePosition = {
    ...live,
    deleted_hlc: deletion?.hlc ?? null,
    deleted_at: deletion?.at ?? null,
  };

  // A deleted bookmark points nowhere, so its marks and index mean nothing.
  if (!isPositionDeleted(merged)) {
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

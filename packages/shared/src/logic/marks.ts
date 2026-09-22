/**
 * Which steps have been chanted in the current pass of a namavali: a bitset,
 * 14 bytes for 108 names. Kept apart from counting — marks are a bookmark,
 * totals always come from count events.
 *
 * **A bitset does not know its own length.** 108 names round up to 14 bytes,
 * so bits 108–111 exist without being names. Every operation therefore takes
 * the practice's `stepCount` and ignores the padding, so a spare bit can
 * neither be set locally nor arrive from another device and be counted.
 *
 * Every function returns a new bitset; none mutates its arguments, so two
 * devices can merge their marks without either losing a name it chanted.
 * See docs/architecture/data-model.md#practiceposition.
 */

const BITS_PER_BYTE = 8;

function assertStepCount(stepCount: number): void {
  if (!Number.isInteger(stepCount) || stepCount <= 0) {
    throw new RangeError(`stepCount must be a positive integer, got ${stepCount}`);
  }
}

/** Bounds an index against the real names, not the padded capacity. */
function assertIndex(index: number, stepCount: number): void {
  assertStepCount(stepCount);
  if (!Number.isInteger(index) || index < 0 || index >= stepCount) {
    throw new RangeError(`step index must be 0..${stepCount - 1}, got ${index}`);
  }
}

/** An empty bitset with room for `stepCount` steps. */
export function createMarks(stepCount: number): Uint8Array {
  assertStepCount(stepCount);
  return new Uint8Array(Math.ceil(stepCount / BITS_PER_BYTE));
}

/** A copy of `marks` with `index` chanted. Marking twice counts once. */
export function markStep(marks: Uint8Array, index: number, stepCount: number): Uint8Array {
  assertIndex(index, stepCount);
  const next = Uint8Array.from(marks);
  const byte = Math.floor(index / BITS_PER_BYTE);
  next[byte] = next[byte]! | (1 << (index % BITS_PER_BYTE));
  return next;
}

export function isStepChanted(marks: Uint8Array, index: number, stepCount: number): boolean {
  assertIndex(index, stepCount);
  return (marks[Math.floor(index / BITS_PER_BYTE)]! & (1 << (index % BITS_PER_BYTE))) !== 0;
}

/**
 * Combine two devices' marks for the same pass: a name chanted on either
 * device stays chanted.
 */
export function unionMarks(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new RangeError(`bitsets must be the same length, got ${a.length} and ${b.length}`);
  }
  const merged = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) merged[i] = a[i]! | b[i]!;
  return merged;
}

/**
 * How many of the practice's steps have been chanted in this pass. Padding
 * bits are never counted, even if a bitset arrives from sync with them set.
 */
export function countMarks(marks: Uint8Array, stepCount: number): number {
  assertStepCount(stepCount);
  let total = 0;
  for (let i = 0; i < stepCount; i += 1) {
    if ((marks[Math.floor(i / BITS_PER_BYTE)]! & (1 << (i % BITS_PER_BYTE))) !== 0) total += 1;
  }
  return total;
}

/**
 * A recitation counts only when every step in the pass has been chanted.
 * Spare bits in the last byte are ignored.
 */
export function isPassComplete(marks: Uint8Array, stepCount: number): boolean {
  return countMarks(marks, stepCount) === stepCount;
}

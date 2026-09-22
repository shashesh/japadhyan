/**
 * Which steps have been chanted in the current pass of a namavali: a bitset,
 * 14 bytes for 108 names. Kept apart from counting — marks are a bookmark,
 * totals always come from count events.
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

function assertIndex(marks: Uint8Array, index: number): void {
  const capacity = marks.length * BITS_PER_BYTE;
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    throw new RangeError(`step index must be 0..${capacity - 1}, got ${index}`);
  }
}

/** An empty bitset with room for `stepCount` steps. */
export function createMarks(stepCount: number): Uint8Array {
  assertStepCount(stepCount);
  return new Uint8Array(Math.ceil(stepCount / BITS_PER_BYTE));
}

/** A copy of `marks` with `index` chanted. Marking twice counts once. */
export function markStep(marks: Uint8Array, index: number): Uint8Array {
  assertIndex(marks, index);
  const next = Uint8Array.from(marks);
  const byte = Math.floor(index / BITS_PER_BYTE);
  // Safe: assertIndex has already bounded `index` to the bitset.
  next[byte] = next[byte]! | (1 << (index % BITS_PER_BYTE));
  return next;
}

export function isStepChanted(marks: Uint8Array, index: number): boolean {
  assertIndex(marks, index);
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

/** How many steps have been chanted in this pass. */
export function countMarks(marks: Uint8Array): number {
  let total = 0;
  for (const byte of marks) {
    let bits = byte;
    while (bits !== 0) {
      bits &= bits - 1;
      total += 1;
    }
  }
  return total;
}

/**
 * A recitation counts only when every step in the pass has been chanted.
 * Spare bits in the last byte are ignored.
 */
export function isPassComplete(marks: Uint8Array, stepCount: number): boolean {
  assertStepCount(stepCount);
  for (let i = 0; i < stepCount; i += 1) {
    if (!isStepChanted(marks, i)) return false;
  }
  return true;
}

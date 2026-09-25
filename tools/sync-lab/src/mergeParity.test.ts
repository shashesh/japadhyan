/**
 * The server's merge (`merge_practice_position`) must settle on exactly what
 * the device's `mergePositions` does, or a device and the server would each
 * think a different position is the truth. Random pairs and triples, crowded
 * so clocks, deletion times and step indexes tie, all within the step count:
 * rows that don't fit are pgTAP's alone (supabase/tests/merge_position.test.sql).
 *
 * The seed is printed on failure; rerun with SYNC_LAB_SEED=<seed>.
 */

import {
  derivedId,
  markStep,
  createMarks,
  mergePositions,
  positionToRow,
  type Hlc,
  type PracticePosition,
} from '@japadhyan/shared';
import { expect, test } from 'vitest';

import { createUser, mergeAsUser, NAMAVALI_STEPS, serverPosition } from './harness';

const CASES = 200;
const SEED = Number(process.env.SYNC_LAB_SEED ?? 20260925);

/** mulberry32: small, fast, and the same sequence for the same seed everywhere. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generator(seed: number) {
  const next = random(seed);
  const int = (below: number) => Math.floor(next() * below);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
  // An hour ago, so no clock is ever ahead of the server.
  const base = Date.now() - 60 * 60 * 1000;
  const hlc = (): Hlc => ({
    millis: base + int(3),
    counter: int(2),
    device_id: pick(['device-a', 'device-b']),
  });

  return (user_id: string, practice_id: string): PracticePosition => {
    let marks = createMarks(NAMAVALI_STEPS);
    for (let i = 0; i < NAMAVALI_STEPS; i++) {
      if (next() < 0.3) marks = markStep(marks, i, NAMAVALI_STEPS);
    }
    const deleted = next() < 0.4;
    return {
      id: derivedId({ table: 'practice_positions', user_id, practice_id }),
      user_id,
      practice_id,
      practice_version: 1 + int(2),
      step_index: int(NAMAVALI_STEPS),
      chanted_steps: marks,
      pass_ordinal: int(3),
      hlc: hlc(),
      deleted_hlc: deleted ? hlc() : null,
      deleted_at: deleted
        ? pick(['2026-09-24T05:30:00.000Z', '2026-09-24T05:30:00.500Z', '2026-09-24T06:00:00.000Z'])
        : null,
    };
  };
}

test(`the server's merge agrees with mergePositions (seed ${SEED})`, async () => {
  const user = await createUser();
  const newPosition = generator(SEED);
  const pickSize = random(SEED ^ 0x5eed);

  for (let n = 0; n < CASES; n++) {
    const practiceId = `parity-${n}`;
    const rows = Array.from({ length: pickSize() < 0.5 ? 2 : 3 }, () =>
      newPosition(user.user_id, practiceId),
    );

    for (const row of rows) await mergeAsUser(user, { ...positionToRow(row) });

    const expected = rows.reduce((merged, row) => mergePositions(merged, row, NAMAVALI_STEPS));
    const context = `seed ${SEED}, case ${n}: ${JSON.stringify(rows.map(positionToRow))}`;
    expect(await serverPosition(user, practiceId), context).toEqual(expected);
  }
});

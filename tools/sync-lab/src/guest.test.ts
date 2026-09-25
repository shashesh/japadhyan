/**
 * Criterion 1 of the sync engine decision, headless: a guest's practice
 * becomes account data on sign-in, following the documented order, and
 * nothing is downloaded or uploaded before sign-in and consent.
 * docs/product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data
 */

import { derivedId, isStepChanted, type PracticePosition } from '@japadhyan/shared';
import { describe, expect, test } from 'vitest';

import { inactiveView, readDeviceState, SYNCED_TABLES, type SyncMode } from './client';
import {
  createUser,
  guestDevice,
  NAMAVALI_STEPS,
  serverPosition,
  serverRowCount,
  serverTotal,
  signedInDevice,
  syncAll,
  type Device,
  type GuestDevice,
  type TestUser,
} from './harness';
import { startPowerSync, stopPowerSync } from './stack';

const MANTRA = 'om-namah-shivaya';
const NAMAVALI = 'vishnu-ashtottara';

function marked(position: PracticePosition | null): number[] {
  if (position === null) throw new Error('No position');
  return [...Array(NAMAVALI_STEPS).keys()].filter((i) =>
    isStepChanted(position.chanted_steps, i, NAMAVALI_STEPS),
  );
}

async function mark(device: Device, ...steps: number[]): Promise<void> {
  for (const step of steps) await device.markStep(NAMAVALI, step, NAMAVALI_STEPS);
}

/** Rows under the views that are not in use in `mode`. */
async function inactiveRows(device: Device, mode: SyncMode): Promise<number> {
  let rows = 0;
  for (const table of SYNCED_TABLES) {
    const { n } = await device.db.get<{ n: number }>(
      `SELECT count(*) AS n FROM ${inactiveView(table, mode)}`,
    );
    rows += n;
  }
  return rows;
}

/** An account whose device A has chanted 108 and marked names 0–2, all synced. */
async function accountWithPractice(): Promise<{ user: TestUser; a: Device }> {
  const user = await createUser();
  const a = await signedInDevice(user, 'a');
  await a.chant(MANTRA, 108);
  await mark(a, 0, 1, 2);
  await a.goOnline();
  return { user, a };
}

/** A guest who has chanted 27 and marked names 5–6. */
async function guestWithPractice(): Promise<GuestDevice> {
  const g = await guestDevice('g');
  await g.chant(MANTRA, 27);
  await mark(g, 5, 6);
  return g;
}

/** Everything a failed or refused sign-in must leave exactly as it was. */
async function expectStillAGuest(g: GuestDevice, user: TestUser, ownerId: string): Promise<void> {
  const state = await readDeviceState(g.db);
  expect(state).toMatchObject({ mode: 'guest', owner_id: ownerId });
  expect(await g.total(MANTRA)).toBe(27);
  expect(marked(await g.position(NAMAVALI))).toEqual([5, 6]);
  expect(await inactiveRows(g, 'guest')).toBe(0);
  expect((await g.db.getUploadQueueStats()).count).toBe(0);
  expect(await serverTotal(user, MANTRA)).toBe(108);
  expect(marked(await serverPosition(user, NAMAVALI))).toEqual([0, 1, 2]);
}

describe('before sign-in', () => {
  test('nothing leaves a guest device', async () => {
    const g = await guestWithPractice();

    expect((await g.db.getUploadQueueStats()).count).toBe(0);
    expect(await inactiveRows(g, 'guest')).toBe(0);
    expect(await g.total(MANTRA)).toBe(27);
    await expect(g.goOnline()).rejects.toThrow(/guest/);
  });

  test('without consent, nothing is downloaded or uploaded', async () => {
    const { user } = await accountWithPractice();
    const g = await guestWithPractice();
    const { owner_id } = (await readDeviceState(g.db))!;

    await expect(g.signIn(user, { consented: false })).rejects.toThrow(/consent/i);

    await expectStillAGuest(g, user, owner_id);
  });
});

describe('signing in', () => {
  test("a guest's counts arrive in the account on sign-in", async () => {
    const { user, a } = await accountWithPractice();
    const g = await guestWithPractice();

    await g.signIn(user);
    await syncAll(g, a);

    expect(await serverTotal(user, MANTRA)).toBe(108 + 27);
    expect(await a.total(MANTRA)).toBe(108 + 27);
    expect(await g.total(MANTRA)).toBe(108 + 27);
    expect(await serverRowCount(user, 'sessions')).toBe(2);
  });

  test("a guest's position merges with the account's for the same practice", async () => {
    const { user, a } = await accountWithPractice();
    const g = await guestWithPractice();

    await g.signIn(user);
    // The device's own merge, before the server's comes back.
    expect(marked(await g.position(NAMAVALI))).toEqual([0, 1, 2, 5, 6]);
    await syncAll(g, a);

    const position = await serverPosition(user, NAMAVALI);
    expect(position!.id).toBe(
      derivedId({ table: 'practice_positions', user_id: user.user_id, practice_id: NAMAVALI }),
    );
    expect(marked(position)).toEqual([0, 1, 2, 5, 6]);
    expect(await g.position(NAMAVALI)).toEqual(position);
    expect(await a.position(NAMAVALI)).toEqual(position);
    expect(await serverRowCount(user, 'practice_positions')).toBe(1);
  });

  test("a guest's position on an older pass gives way to the account's", async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    await mark(a, ...Array(NAMAVALI_STEPS).keys());
    await a.finishPass(NAMAVALI, NAMAVALI_STEPS);
    await mark(a, 0);
    await a.goOnline();
    const g = await guestWithPractice();

    await g.signIn(user);
    expect((await g.position(NAMAVALI))!.pass_ordinal).toBe(1);
    await syncAll(g, a);

    const position = await serverPosition(user, NAMAVALI);
    expect(position!.pass_ordinal).toBe(1);
    expect(marked(position)).toEqual([0]);
    expect(await g.position(NAMAVALI)).toEqual(position);
  });

  test('the guest tables are empty after sign-in, and device_state records the account', async () => {
    const { user } = await accountWithPractice();
    const g = await guestWithPractice();
    const guestState = (await readDeviceState(g.db))!;

    await g.signIn(user);

    expect(await inactiveRows(g, 'signed_in')).toBe(0);
    expect(await readDeviceState(g.db)).toEqual({
      ...guestState,
      owner_id: user.user_id,
      mode: 'signed_in',
      clock_offset_ms: expect.any(Number),
    });
    const owners = await g.db.getAll<{ user_id: string }>(
      'SELECT user_id FROM count_events UNION SELECT user_id FROM sessions',
    );
    expect(owners).toEqual([{ user_id: user.user_id }]);
  });

  test('if the download fails, nothing changes and the guest can try again', async () => {
    const { user } = await accountWithPractice();
    const g = await guestWithPractice();
    const { owner_id } = (await readDeviceState(g.db))!;

    stopPowerSync();
    try {
      await expect(g.signIn(user, { downloadTimeoutMs: 3_000 })).rejects.toThrow(/download/i);
      await expectStillAGuest(g, user, owner_id);
    } finally {
      await startPowerSync();
    }

    await g.signIn(user);
    await g.goOnline();

    expect(await serverTotal(user, MANTRA)).toBe(108 + 27);
    expect(marked(await serverPosition(user, NAMAVALI))).toEqual([0, 1, 2, 5, 6]);
  });
});

/**
 * Criterion 2 of the sync engine decision: devices chanting offline reconcile
 * to exact totals and one namavali position. A failure here is a finding
 * about PowerSync or the design; write it down before changing anything.
 */

import {
  countEventToRow,
  isPositionDeleted,
  isStepChanted,
  RESTAMP_MARGIN_MS,
  uuidv7,
  type CountEvent,
  type Hlc,
  type PracticePosition,
} from '@japadhyan/shared';
import { describe, expect, test } from 'vitest';

import {
  createUser,
  mergeAsUser,
  NAMAVALI_STEPS,
  serverNow,
  serverPosition,
  serverTotal,
  signedInDevice,
  syncAll,
  type Device,
  type TestUser,
} from './harness';
import { requireDeviceState } from './client';
import * as practice from './practice';

const MANTRA = 'om-namah-shivaya';
const NAMAVALI = 'vishnu-ashtottara';
const TEN_MINUTES = 10 * 60 * 1000;

function marked(position: PracticePosition | null): number[] {
  if (position === null) throw new Error('No position');
  return [...Array(NAMAVALI_STEPS).keys()].filter((i) =>
    isStepChanted(position.chanted_steps, i, NAMAVALI_STEPS),
  );
}

async function mark(device: Device, ...steps: number[]): Promise<void> {
  for (const step of steps) await device.markStep(NAMAVALI, step, NAMAVALI_STEPS);
}

/** The same position on every device and on the server; returns it. */
async function onePosition(
  user: TestUser,
  devices: readonly Device[],
  practiceId = NAMAVALI,
): Promise<PracticePosition> {
  const server = await serverPosition(user, practiceId);
  expect(server).not.toBeNull();
  for (const device of devices) {
    expect(await device.position(practiceId), device.name).toEqual(server);
  }
  return server!;
}

async function expectTotals(
  user: TestUser,
  devices: readonly Device[],
  practiceId: string,
  expected: number,
): Promise<void> {
  expect(await serverTotal(user, practiceId)).toBe(expected);
  for (const device of devices) expect(await device.total(practiceId), device.name).toBe(expected);
}

async function expectOnTime(user: TestUser, clock: Hlc | null): Promise<void> {
  expect(clock).not.toBeNull();
  expect(Math.abs(clock!.millis - (await serverNow(user)))).toBeLessThanOrEqual(RESTAMP_MARGIN_MS);
}

/** An event whose session the server never received: a foreign key violation. */
function orphanEvent(user: TestUser): CountEvent {
  return {
    id: uuidv7(),
    user_id: user.user_id,
    practice_id: MANTRA,
    session_id: uuidv7(),
    mode: 'mala_tap',
    count: 27,
    estimated: false,
    device_id: 'a',
    created_at: new Date().toISOString(),
    local_day: new Date().toISOString().slice(0, 10),
    tz_offset_min: 0,
    steps_per_repetition: 1,
  };
}

describe('counts', () => {
  test('counts chanted offline on two devices add up exactly', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const b = await signedInDevice(user, 'b');

    for (let i = 0; i < 3; i++) await a.chant(MANTRA, 108);
    await a.chant(MANTRA, -5);
    for (let i = 0; i < 2; i++) await b.chant(MANTRA, 108);
    await syncAll(a, b);

    await expectTotals(user, [a, b], MANTRA, 3 * 108 - 5 + 2 * 108);
  });

  test('an upload repeated after the server stored it is not counted twice', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    await a.chant(MANTRA, 108);
    const pending = await a.db.getNextCrudTransaction();
    expect(pending?.crud.map((op) => op.table)).toEqual(['sessions', 'count_events']);

    await a.goOnline();
    await a.connector.uploadTransaction(a.db, pending!.crud);

    expect(await serverTotal(user, MANTRA)).toBe(108);
    expect(await a.uploadFailures()).toEqual([]);
  });

  test("a session's ended_at set on one device reaches the other", async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const b = await signedInDevice(user, 'b');
    await a.chant(MANTRA, 108);
    await syncAll(a, b);

    await a.endSession(MANTRA);
    await syncAll(a, b);

    const endedOn = async (device: Device) =>
      device.db.getAll<{ ended_at: string | null }>('SELECT ended_at FROM sessions');
    const onA = await endedOn(a);
    expect(onA).toHaveLength(1);
    expect(onA[0]!.ended_at).not.toBeNull();
    expect(Date.parse((await endedOn(b))[0]!.ended_at!)).toBe(Date.parse(onA[0]!.ended_at!));
  });

  test('a permanently rejected upload is set aside, not lost', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const orphan = orphanEvent(user);
    await practice.insert(a.db, 'count_events', { ...countEventToRow(orphan) });
    await a.chant(MANTRA, 108);

    await a.goOnline();

    expect(await serverTotal(user, MANTRA)).toBe(108);
    const failures = await a.uploadFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      table_name: 'count_events',
      op: 'PUT',
      row_id: orphan.id,
      error_code: '23503',
    });
    expect(failures[0]!.payload).toMatchObject({ id: orphan.id, count: 27, estimated: false });
  });

  test('a refusal mid-transaction sets aside what follows it, and nothing already sent', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const orphan = orphanEvent(user);
    let sent = '';
    let after = '';
    await a.db.writeTransaction(async (tx) => {
      const ctx = { tx, state: await requireDeviceState(tx), nowMs: Date.now() };
      sent = (await practice.chant(ctx, MANTRA, 108)).id; // the session and an event: sent
      await practice.insert(tx, 'count_events', { ...countEventToRow(orphan) }); // refused
      await tx.execute('UPDATE count_events SET count = 1 WHERE id = ?', [sent]); // never happens
      after = (await practice.chant(ctx, MANTRA, 9)).id; // not sent, after the refusal
    });

    await a.goOnline();

    expect(await serverTotal(user, MANTRA)).toBe(108);
    const failures = await a.uploadFailures();
    expect(failures.map(({ op, row_id, error_code }) => ({ op, row_id, error_code }))).toEqual([
      { op: 'PUT', row_id: orphan.id, error_code: '23503' },
      { op: 'PATCH', row_id: sent, error_code: 'unexpected_op' },
      { op: 'PUT', row_id: after, error_code: 'not_sent' },
    ]);
    expect(failures[2]!.payload).toMatchObject({ id: after, count: 9 });
  });
});

describe('positions', () => {
  test.each([['a first'], ['b first']])(
    'two devices on the same pass end with one position and every mark (%s)',
    async (order) => {
      const user = await createUser();
      const a = await signedInDevice(user, 'a');
      const b = await signedInDevice(user, 'b');
      await mark(a, 0, 1, 2);
      await mark(b, 5, 6);

      await syncAll(...(order === 'a first' ? [a, b] : [b, a]));

      const position = await onePosition(user, [a, b]);
      expect(marked(position)).toEqual([0, 1, 2, 5, 6]);
      expect(position.step_index).toBe(6); // b's edit came later
    },
  );

  test("a device that finished the pass wins; the other's marks are not combined in", async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const b = await signedInDevice(user, 'b');
    await mark(a, ...Array(NAMAVALI_STEPS).keys());
    await a.finishPass(NAMAVALI, NAMAVALI_STEPS);
    await mark(a, 0);
    await mark(b, 5, 6);

    await syncAll(a, b);

    const position = await onePosition(user, [a, b]);
    expect(position.pass_ordinal).toBe(1);
    expect(marked(position)).toEqual([0]);
    await expectTotals(user, [a, b], NAMAVALI, 1);
  });

  const ORDERS = [
    ['a', 'b', 'c'],
    ['a', 'c', 'b'],
    ['b', 'a', 'c'],
    ['b', 'c', 'a'],
    ['c', 'a', 'b'],
    ['c', 'b', 'a'],
  ] as const;

  test.each(ORDERS)(
    'three devices converge whatever order they reconnect in: %s %s %s',
    async (...order) => {
      const user = await createUser();
      const devices = {
        a: await signedInDevice(user, 'a'),
        b: await signedInDevice(user, 'b'),
        c: await signedInDevice(user, 'c'),
      };
      await devices.a.chant(MANTRA, 108);
      await mark(devices.a, 0, 1, 2);
      await devices.b.chant(MANTRA, 27);
      await mark(devices.b, 5, 6);
      await devices.b.deletePosition(NAMAVALI);
      await devices.c.chant(MANTRA, 54);
      await mark(devices.c, 8); // after b's deletion, so it brings the position back

      await syncAll(...order.map((name) => devices[name]));

      const all = Object.values(devices);
      await expectTotals(user, all, MANTRA, 108 + 27 + 54);
      const position = await onePosition(user, all);
      expect(isPositionDeleted(position)).toBe(false);
      expect(position.deleted_hlc).not.toBeNull();
      expect(marked(position)).toEqual([0, 1, 2, 5, 6, 8]);
      expect(position.step_index).toBe(8);
    },
  );

  test('chanting after a deletion on another device brings the position back', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const b = await signedInDevice(user, 'b');
    await mark(a, 0, 1, 2);
    await syncAll(a, b);
    await b.deletePosition(NAMAVALI);
    await syncAll(b, a);
    expect(isPositionDeleted((await a.position(NAMAVALI))!)).toBe(true);

    await mark(a, 3);
    await syncAll(a, b);

    const position = await onePosition(user, [a, b]);
    expect(isPositionDeleted(position)).toBe(false);
    // A revived position keeps the names marked before it was deleted.
    expect(marked(position)).toEqual([0, 1, 2, 3]);
  });
});

describe('a clock that runs fast', () => {
  test('a device whose clock runs 10 minutes fast keeps its marks', async () => {
    const user = await createUser();
    const a = await signedInDevice(user, 'a');
    const b = await signedInDevice(user, 'b', { clockSkewMs: TEN_MINUTES });
    await mark(b, 5, 6);
    await mark(a, 0, 1, 2);

    await syncAll(a, b);

    const position = await onePosition(user, [a, b]);
    expect(marked(position)).toEqual([0, 1, 2, 5, 6]);
    await expectOnTime(user, position.hlc);
  });

  test("restamping keeps a deletion's meaning", async () => {
    const user = await createUser();
    const b = await signedInDevice(user, 'b', { clockSkewMs: TEN_MINUTES });

    // Deleted while 10 minutes fast: still deleted after the restamp.
    await b.markStep('p-deleted', 1, NAMAVALI_STEPS);
    await b.deletePosition('p-deleted');
    await b.goOnline();
    const deleted = await serverPosition(user, 'p-deleted');
    expect(isPositionDeleted(deleted!)).toBe(true);
    await expectOnTime(user, deleted!.deleted_hlc);

    // The clock jumps again while offline: deleted, then chanted on again, stays live.
    await b.goOffline();
    b.setClockSkew(2 * TEN_MINUTES);
    await b.markStep('p-revived', 1, NAMAVALI_STEPS);
    await b.deletePosition('p-revived');
    await b.markStep('p-revived', 2, NAMAVALI_STEPS);
    await b.goOnline();
    const revived = await serverPosition(user, 'p-revived');
    expect(isPositionDeleted(revived!)).toBe(false);
    await expectOnTime(user, revived!.hlc);

    // hlc on time, deleted_hlc 10 minutes ahead: still deleted.
    await b.goOffline();
    await b.markStep('p-ahead', 1, NAMAVALI_STEPS);
    b.setClockSkew(3 * TEN_MINUTES);
    await b.deletePosition('p-ahead');
    const local = (await b.position('p-ahead'))!;
    expect(local.deleted_hlc!.millis - local.hlc.millis).toBeGreaterThan(RESTAMP_MARGIN_MS);
    await b.goOnline();
    const ahead = await serverPosition(user, 'p-ahead');
    expect(isPositionDeleted(ahead!)).toBe(true);
    await expectOnTime(user, ahead!.deleted_hlc);
  });

  test("after reconnecting, a fast device's new edits use the corrected clock", async () => {
    const user = await createUser();
    const b = await signedInDevice(user, 'b', { clockSkewMs: TEN_MINUTES });
    await mark(b, 0);
    expect((await b.position(NAMAVALI))!.hlc.millis - (await serverNow(user))).toBeGreaterThan(
      TEN_MINUTES - RESTAMP_MARGIN_MS,
    );
    await b.goOnline();
    await b.goOffline();

    await mark(b, 1);

    // Checked before it uploads, so the restamp can't be what put it on time.
    await expectOnTime(user, (await b.position(NAMAVALI))!.hlc);
    await b.goOnline();
    await expectOnTime(user, (await serverPosition(user, NAMAVALI))!.hlc);
  });

  test('a set-aside position keeps its whole row', async () => {
    const user = await createUser();
    const other = await createUser();
    const a = await signedInDevice(user, 'a');
    await mark(a, 0, 1, 2);
    await a.goOnline();
    await a.goOffline();

    // By hand, so the server refuses the upload as someone else's (42501).
    await a.db.execute('UPDATE practice_positions SET user_id = ? WHERE practice_id = ?', [
      other.user_id,
      NAMAVALI,
    ]);
    await mark(a, 3);
    await a.goOnline();

    const failures = await a.uploadFailures();
    expect(failures.length).toBeGreaterThan(0);
    const refused = failures.at(-1)!;
    expect(refused).toMatchObject({
      table_name: 'practice_positions',
      op: 'PATCH',
      error_code: '42501',
    });
    expect(Object.keys(refused.payload).sort()).toEqual(
      [
        'chanted_steps',
        'deleted_at',
        'deleted_hlc',
        'hlc',
        'id',
        'pass_ordinal',
        'practice_id',
        'practice_version',
        'step_index',
        'user_id',
      ].sort(),
    );

    await mergeAsUser(user, { ...refused.payload, user_id: user.user_id });

    expect(marked(await serverPosition(user, NAMAVALI))).toEqual([0, 1, 2, 3]);
  });
});

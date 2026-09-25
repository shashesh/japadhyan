/**
 * How the app opens its database (apps/mobile/src/data/powersync/database.ts):
 * always with the guest schema, since the mode is stored inside the database,
 * then `prepareDevice` sets up a first launch or restores how the device was
 * left. No stack needed: nothing connects.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uuidv7 } from '@japadhyan/shared';
import { PowerSyncDatabase } from '@powersync/node';
import { afterEach, describe, expect, test } from 'vitest';

import {
  createDeviceState,
  inactiveView,
  makeSchema,
  prepareDevice,
  readDeviceState,
  type SyncMode,
} from './client';
import { chant, readEvents, writePractice } from './practice';

const MANTRA = 'om-namah-shivaya';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const dirs: string[] = [];
const open: PowerSyncDatabase[] = [];

async function openDb(dir: string, mode: SyncMode): Promise<PowerSyncDatabase> {
  const db = new PowerSyncDatabase({
    schema: makeSchema(mode),
    database: { dbFilename: 'device.db', dbLocation: dir },
  });
  await db.init();
  open.push(db);
  return db;
}

async function close(db: PowerSyncDatabase): Promise<void> {
  open.splice(open.indexOf(db), 1);
  await db.close();
}

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'japadhyan-open-device-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe('prepareDevice', () => {
  test('a first launch is a guest, with a new owner id and device id', async () => {
    const db = await openDb(newDir(), 'guest');

    const state = await prepareDevice(db, () => uuidv7());

    expect(state.mode).toBe('guest');
    expect(state.owner_id).toMatch(ID_PATTERN);
    expect(state.device_id).toMatch(ID_PATTERN);
    expect(state.device_id).not.toBe(state.owner_id);
    expect(state.clock_offset_ms).toBe(0);
    expect(await readDeviceState(db)).toEqual(state);
  });

  test('reopening keeps the device as it was, and its guest practice', async () => {
    const dir = newDir();
    const first = await openDb(dir, 'guest');
    const state = await prepareDevice(first, () => uuidv7());
    await writePractice(first, { nowMs: Date.now() }, (ctx) => chant(ctx, MANTRA, 3));
    await close(first);

    const again = await openDb(dir, 'guest');
    expect(await prepareDevice(again, () => uuidv7())).toEqual(state);
    expect((await readEvents(again, MANTRA)).map((e) => e.count)).toEqual([3]);
  });

  test('a signed-in device reopens signed in, reading its synced rows', async () => {
    const dir = newDir();
    const first = await openDb(dir, 'signed_in');
    await createDeviceState(first, {
      owner_id: uuidv7(),
      device_id: uuidv7(),
      mode: 'signed_in',
      clock_offset_ms: 1234,
    });
    await writePractice(first, { nowMs: Date.now() }, (ctx) => chant(ctx, MANTRA, 108));
    await close(first);

    const again = await openDb(dir, 'guest');
    const state = await prepareDevice(again, () => uuidv7());

    expect(state.mode).toBe('signed_in');
    expect(state.clock_offset_ms).toBe(1234);
    expect((await readEvents(again, MANTRA)).map((e) => e.count)).toEqual([108]);
    const { n } = await again.get<{ n: number }>(
      `SELECT count(*) AS n FROM ${inactiveView('count_events', 'signed_in')}`,
    );
    expect(n).toBe(0);
  });
});

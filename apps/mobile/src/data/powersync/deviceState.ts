/**
 * The one `device_state` row: whose practice this device holds, its device
 * id, whether it syncs, and the offset that corrects its clock to the
 * server's. Kept in the database rather than in a storage package, so it
 * travels with the data it describes.
 */

import type { CommonPowerSyncDatabase } from '@powersync/common';

import { makeSchema, type Sql, type SyncMode } from './schema';

export interface DeviceState {
  /** The local owner id while a guest; the account's user id once signed in. */
  owner_id: string;
  device_id: string;
  mode: SyncMode;
  /** Server time minus this device's, learned on connect. 0 until then. */
  clock_offset_ms: number;
}

const ROW_ID = 'device';

/** The device's state, or `null` on a database that was never set up. */
export async function readDeviceState(db: Sql): Promise<DeviceState | null> {
  const row = await db.getOptional<DeviceState>(
    'SELECT owner_id, device_id, mode, clock_offset_ms FROM device_state WHERE id = ?',
    [ROW_ID],
  );
  if (row === null) return null;
  if (row.mode !== 'guest' && row.mode !== 'signed_in') {
    throw new Error(`device_state holds an unknown mode: ${String(row.mode)}`);
  }
  return row;
}

/** Like {@link readDeviceState}, for code that runs only once the device is set up. */
export async function requireDeviceState(db: Sql): Promise<DeviceState> {
  const state = await readDeviceState(db);
  if (state === null) throw new Error('This device has no device_state yet');
  return state;
}

/** Sets up a device. Refuses a database that already has a state. */
export async function createDeviceState(db: Sql, state: DeviceState): Promise<void> {
  if ((await readDeviceState(db)) !== null) {
    throw new Error('This device already has a device_state');
  }
  await db.execute(
    'INSERT INTO device_state (id, owner_id, device_id, mode, clock_offset_ms) VALUES (?, ?, ?, ?, ?)',
    [ROW_ID, state.owner_id, state.device_id, state.mode, state.clock_offset_ms],
  );
}

/**
 * Readies a freshly opened database: a first launch becomes a guest, with a
 * new local owner id and device id; afterwards the device is as it was left.
 *
 * The mode is stored inside the database, so it always opens with the guest
 * schema. A signed-in device then points its tables back at the synced
 * views, before anything reads them and before it connects.
 */
export async function prepareDevice(
  db: CommonPowerSyncDatabase,
  newId: () => string,
): Promise<DeviceState> {
  let state = await readDeviceState(db);
  if (state === null) {
    state = { owner_id: newId(), device_id: newId(), mode: 'guest', clock_offset_ms: 0 };
    await createDeviceState(db, state);
  }
  if (state.mode !== 'guest') await db.updateSchema(makeSchema(state.mode));
  return state;
}

export async function setOwner(db: Sql, ownerId: string, mode: SyncMode): Promise<void> {
  await db.execute('UPDATE device_state SET owner_id = ?, mode = ? WHERE id = ?', [
    ownerId,
    mode,
    ROW_ID,
  ]);
}

export async function setClockOffset(db: Sql, offsetMs: number): Promise<void> {
  await db.execute('UPDATE device_state SET clock_offset_ms = ? WHERE id = ?', [offsetMs, ROW_ID]);
}

/** The device's clock corrected to the server's, as last measured. */
export function correctedNow(state: DeviceState, nowMs: number): number {
  return nowMs + state.clock_offset_ms;
}

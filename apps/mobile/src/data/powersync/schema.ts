/**
 * The device's PowerSync database.
 *
 * Each synced table has a local-only twin, which holds a guest's practice.
 * `viewName` points the table's name at one or the other, so the app's SQL is
 * the same in both modes (PowerSync's local-only recipe):
 *
 * - **guest:** `count_events` is the local-only twin. Nothing is queued for
 *   upload, so nothing leaves the device.
 * - **signed_in:** `count_events` is the synced table. The twin, now named
 *   `inactive_local_count_events`, is empty once sign-in has moved its rows.
 *
 * Columns mirror the row codecs in @japadhyan/shared (`rows.ts`): PowerSync
 * stores text, integer or real. Only the three tables S4 syncs are here; the
 * rest come with M3 and M10. See
 * docs/plans/active/2026-09-24-s4-sync-prototype.md#the-client.
 */

import { column, Schema, Table, type LockContext } from '@powersync/common';
import type { SyncedTable } from '@japadhyan/shared';

/** Whether the device syncs: only after sign-in and consent. */
export type SyncMode = 'guest' | 'signed_in';

/** What the device's helpers need from the database or a transaction. */
export type Sql = Pick<LockContext, 'execute' | 'get' | 'getAll' | 'getOptional'>;

export const SYNCED_TABLES = [
  'sessions',
  'count_events',
  'practice_positions',
] as const satisfies readonly SyncedTable[];

const COLUMNS = {
  sessions: {
    user_id: column.text,
    practice_id: column.text,
    device_id: column.text,
    started_at: column.text,
    ended_at: column.text,
    local_day: column.text,
    tz_offset_min: column.integer,
    practice_version: column.integer,
    steps_per_repetition: column.integer,
  },
  count_events: {
    user_id: column.text,
    practice_id: column.text,
    session_id: column.text,
    mode: column.text,
    count: column.integer,
    estimated: column.integer,
    device_id: column.text,
    created_at: column.text,
    local_day: column.text,
    tz_offset_min: column.integer,
    steps_per_repetition: column.integer,
  },
  practice_positions: {
    user_id: column.text,
    practice_id: column.text,
    practice_version: column.integer,
    step_index: column.integer,
    chanted_steps: column.text,
    pass_ordinal: column.integer,
    hlc: column.text,
    deleted_hlc: column.text,
    deleted_at: column.text,
  },
} satisfies Record<SyncedTable, Record<string, unknown>>;

const INDEXES = {
  sessions: { practice: ['practice_id'] },
  count_events: { practice: ['practice_id'] },
  practice_positions: { practice: ['practice_id'] },
} satisfies Record<SyncedTable, Record<string, string[]>>;

/** A synced table's columns, other than `id`. */
export function columnsOf(table: SyncedTable): string[] {
  return Object.keys(COLUMNS[table]);
}

/** The table holding a guest's rows for `table`. */
export function localTwin(table: SyncedTable): `local_${SyncedTable}` {
  return `local_${table}`;
}

/**
 * Where a table's rows can still be read while its name points at its twin:
 * the synced rows while a guest, the guest's rows once signed in.
 */
export function inactiveView(table: SyncedTable, mode: SyncMode): string {
  return mode === 'guest' ? `inactive_synced_${table}` : `inactive_local_${table}`;
}

/**
 * The device itself, never synced: whose practice this is, the device id, the
 * mode, and the offset that corrects the device's clock to the server's
 * (docs/architecture/data-model.md#conflict-rule). One row.
 */
const deviceState = new Table(
  {
    owner_id: column.text,
    device_id: column.text,
    mode: column.text,
    clock_offset_ms: column.integer,
  },
  { localOnly: true },
);

/**
 * Uploads the server refused for good. Kept, never discarded, so a count
 * can't vanish; a later fix can send `payload` again as it is.
 */
const uploadFailures = new Table(
  {
    table_name: column.text,
    op: column.text,
    row_id: column.text,
    error_code: column.text,
    payload: column.text,
    failed_at: column.text,
  },
  { localOnly: true },
);

function twins<T extends SyncedTable>(table: T, mode: SyncMode) {
  const signedIn = mode === 'signed_in';
  return {
    synced: new Table(COLUMNS[table], {
      indexes: INDEXES[table],
      viewName: signedIn ? table : inactiveView(table, 'guest'),
    }),
    local: new Table(COLUMNS[table], {
      indexes: INDEXES[table],
      localOnly: true,
      viewName: signedIn ? inactiveView(table, 'signed_in') : table,
    }),
  };
}

export function makeSchema(mode: SyncMode) {
  const sessions = twins('sessions', mode);
  const countEvents = twins('count_events', mode);
  const positions = twins('practice_positions', mode);
  return new Schema({
    sessions: sessions.synced,
    local_sessions: sessions.local,
    count_events: countEvents.synced,
    local_count_events: countEvents.local,
    practice_positions: positions.synced,
    local_practice_positions: positions.local,
    device_state: deviceState,
    upload_failures: uploadFailures,
  });
}

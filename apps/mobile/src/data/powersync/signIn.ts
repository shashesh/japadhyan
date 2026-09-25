/**
 * Signing in on a device that already holds a guest's practice, in the
 * documented order (docs/product/features/accounts-and-sync.md#signing-in-on-a-device-that-already-has-data):
 *
 * 1. **Seal the open count event.** The caller does this: the chant screen
 *    seals before it hands over to sign-in (M3).
 * 2. **Consent.** Checked here as well as on the screen, so a caller that
 *    skips the screen can't sync. Without it nothing happens at all: no
 *    sign-in, nothing downloaded or uploaded, and the device stays a guest.
 * 3. **Point the tables at the synced views**, while still disconnected.
 * 4. **Download the account completely.** The guest's rows sit under the
 *    inactive local views meanwhile, so nothing uploads yet.
 * 5. **Combine, in one write transaction:** re-key the guest's rows to the
 *    account, recompute derived ids, merge a position that collides with the
 *    account's, then clear the local tables. The copied rows join the upload
 *    queue like any other write.
 *
 * If anything after sign-in fails, the device goes back to being the guest it
 * was: synced data cleared, local views restored, signed out. The guest's own
 * rows were never touched, so they can try again.
 *
 * Imports only `@powersync/common` and `@japadhyan/shared`, so the headless
 * tests in tools/sync-lab run this very file.
 */

import {
  LogLevels,
  type CommonPowerSyncDatabase,
  type PowerSyncBackendConnector,
  type SyncOptions,
  type SyncStatus,
} from '@powersync/common';
import {
  derivedId,
  mergePositions,
  positionFromRow,
  positionToRow,
  type PracticePosition,
} from '@japadhyan/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireDeviceState, setOwner } from './deviceState';
import { columnsOf, inactiveView, makeSchema, SYNCED_TABLES, type Sql } from './schema';

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignInOptions {
  /** Whether the devotee agreed on the consent screen. */
  consented: boolean;
  connector: PowerSyncBackendConnector;
  /** A practice's step count at a version, from the catalog, for merging positions. */
  stepCount: (practiceId: string, version: number) => number;
  downloadTimeoutMs?: number;
  syncOptions?: SyncOptions;
}

export class ConsentRequired extends Error {
  constructor() {
    super('Consent is required before anything is downloaded or uploaded');
    this.name = 'ConsentRequired';
  }
}

export class DownloadFailed extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DownloadFailed';
  }
}

export class SignInInProgress extends Error {
  constructor() {
    super('A sign-in is already running on this device');
    this.name = 'SignInInProgress';
  }
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;

/** Databases with a sign-in running. A second one would combine the guest's rows twice. */
const signingIn = new WeakSet<CommonPowerSyncDatabase>();

export async function signInAndCombine(
  db: CommonPowerSyncDatabase,
  supabase: SupabaseClient,
  credentials: SignInCredentials,
  options: SignInOptions,
): Promise<void> {
  if (options.consented !== true) throw new ConsentRequired();
  // Claimed before the first await, so a call made meanwhile sees it.
  if (signingIn.has(db)) throw new SignInInProgress();
  signingIn.add(db);
  try {
    await signIn(db, supabase, credentials, options);
  } finally {
    signingIn.delete(db);
  }
}

async function signIn(
  db: CommonPowerSyncDatabase,
  supabase: SupabaseClient,
  credentials: SignInCredentials,
  options: SignInOptions,
): Promise<void> {
  const guest = await requireDeviceState(db);
  if (guest.mode !== 'guest') throw new Error('This device is already signed in');

  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error) throw error;
  const accountId = data.user.id;

  try {
    await db.updateSchema(makeSchema('signed_in'));
    await downloadAccount(db, options);
    await db.writeTransaction((tx) => combine(db, tx, accountId, options.stepCount));
  } catch (failure) {
    try {
      await backToGuest(db, supabase);
    } catch (restoreFailure) {
      throw new AggregateError([failure, restoreFailure], 'Sign-in failed, and so did undoing it', {
        cause: restoreFailure,
      });
    }
    throw failure;
  }
}

/** Connects, and waits for the first complete checkpoint since connecting. */
async function downloadAccount(
  db: CommonPowerSyncDatabase,
  { connector, syncOptions, downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS }: SignInOptions,
): Promise<void> {
  const startedAt = Date.now();
  const downloaded = (status: SyncStatus) => (status.lastSyncedAt?.getTime() ?? 0) >= startedAt;

  await db.connect(connector, syncOptions);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), downloadTimeoutMs);
  try {
    // Resolves on the timeout too, so the status is checked again below.
    await db.waitForStatus(downloaded, timeout.signal);
  } finally {
    clearTimeout(timer);
  }
  if (!downloaded(db.currentStatus)) {
    throw new DownloadFailed(`The account did not download within ${downloadTimeoutMs} ms`, {
      cause: db.currentStatus.downloadError,
    });
  }
}

async function combine(
  db: CommonPowerSyncDatabase,
  tx: Sql,
  accountId: string,
  stepCount: SignInOptions['stepCount'],
): Promise<void> {
  // Sessions first, so every count event's session uploads before it.
  for (const table of ['sessions', 'count_events'] as const) {
    const columns = columnsOf(table).filter((column) => column !== 'user_id');
    const list = columns.map((column) => `"${column}"`).join(', ');
    await tx.execute(
      `INSERT INTO ${table} (id, user_id, ${list})
         SELECT id, ?, ${list} FROM ${inactiveView(table, 'signed_in')}`,
      [accountId],
    );
  }

  const positions = await tx.getAll(
    `SELECT * FROM ${inactiveView('practice_positions', 'signed_in')}`,
  );
  for (const row of positions) {
    await combinePosition(db, tx, rekey(positionFromRow(row), accountId), stepCount);
  }

  await setOwner(tx, accountId, 'signed_in');
  for (const table of SYNCED_TABLES) {
    await tx.execute(`DELETE FROM ${inactiveView(table, 'signed_in')}`);
  }
}

function rekey(position: PracticePosition, accountId: string): PracticePosition {
  return {
    ...position,
    id: derivedId({
      table: 'practice_positions',
      user_id: accountId,
      practice_id: position.practice_id,
    }),
    user_id: accountId,
  };
}

/**
 * One position survives per practice: the account's row, updated with the
 * merged values. If the two can't be merged, because one doesn't fit the
 * catalog, the account's row stands; a position is a bookmark, not a count.
 */
async function combinePosition(
  db: CommonPowerSyncDatabase,
  tx: Sql,
  guest: PracticePosition,
  stepCount: SignInOptions['stepCount'],
): Promise<void> {
  const stored = await tx.getOptional('SELECT * FROM practice_positions WHERE id = ?', [guest.id]);
  const guestRow = positionToRow(guest);
  if (stored === null) {
    const columns = Object.keys(guestRow);
    await tx.execute(
      `INSERT INTO practice_positions (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
      Object.values(guestRow),
    );
    return;
  }

  const account = positionFromRow(stored);
  let merged: PracticePosition;
  try {
    const version = Math.max(account.practice_version, guest.practice_version);
    merged = mergePositions(account, guest, stepCount(guest.practice_id, version));
  } catch {
    db.logger.log({
      level: LogLevels.warn,
      message: `Kept the account's position ${account.id}: the guest's could not be merged`,
    });
    return;
  }

  const { id, ...fields } = positionToRow(merged);
  if (JSON.stringify({ id, ...fields }) === JSON.stringify(positionToRow(account))) return;
  const columns = Object.keys(fields);
  await tx.execute(
    `UPDATE practice_positions SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(fields), id],
  );
}

/** Undoes a sign-in that didn't finish. Local-only tables, the guest's rows among them, are kept. */
async function backToGuest(db: CommonPowerSyncDatabase, supabase: SupabaseClient): Promise<void> {
  await db.disconnectAndClear({ clearLocal: false });
  await db.updateSchema(makeSchema('guest'));
  await supabase.auth.signOut({ scope: 'local' });
}

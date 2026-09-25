/**
 * How the device talks to the backend: PowerSync downloads, Supabase takes
 * the uploads. Imports only `@powersync/common` and `@japadhyan/shared`, so
 * the headless tests in tools/sync-lab run this very file.
 *
 * Uploads, per table and operation (S4 plan, decision 6):
 *
 * - count events and sessions are inserted by id, ignoring an id the server
 *   already has, so a retry never counts twice. A session's `PATCH` fills in
 *   `ended_at`, once;
 * - a position is sent **whole**, as the local row reads at upload time, to
 *   `merge_practice_position`. `opData` holds only the changed columns, and
 *   the merge needs the version, pass and marks together. Sending a later
 *   state, or one the server already has, is harmless: the merge is a
 *   semilattice. Clocks that run ahead are restamped first.
 *
 * A refusal the server will always repeat is **set aside**, never discarded:
 * the transaction's operations go into `upload_failures` with the payload
 * each sent, and the queue moves on. Discarding would lose counts, and
 * retrying would block every upload behind it. Anything else is thrown, so
 * PowerSync retries.
 *
 * See docs/plans/active/2026-09-24-s4-sync-prototype.md#the-client.
 */

import {
  LogLevels,
  UpdateType,
  type CommonPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from '@powersync/common';
import {
  clockOffsetMs,
  positionFromRow,
  positionToRow,
  restampPosition,
  timestampFromDb,
  toServerRow,
} from '@japadhyan/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

import { correctedNow, requireDeviceState, setClockOffset } from './deviceState';

export interface ConnectorOptions {
  db: CommonPowerSyncDatabase;
  supabase: SupabaseClient;
  /** The PowerSync service. */
  powersyncUrl: string;
  /** The device's clock. Tests skew it; the app leaves the default. */
  now?: () => number;
}

/** A Postgres error that retrying can't fix, carrying its SQLSTATE. */
export class UploadRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UploadRefused';
  }
}

/**
 * Classes 22 (bad data) and 23 (a constraint), and 42501 (not allowed): the
 * server gives the same answer every time. Class 23 includes 23503, a count
 * event whose session never arrived; it is set aside, not dropped.
 */
export function isPermanent(code: string): boolean {
  return code.startsWith('22') || code.startsWith('23') || code === '42501';
}

/** What one operation sends, or why it sends nothing. */
type Payload =
  | { kind: 'send'; body: Record<string, unknown> }
  /** A position whose local row is gone: there is nothing left to send. */
  | { kind: 'skip' }
  /** An operation the upload rules say never happens. */
  | { kind: 'unexpected' };

const UNEXPECTED_OP = 'unexpected_op';

export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly db: CommonPowerSyncDatabase;
  private readonly supabase: SupabaseClient;
  private readonly powersyncUrl: string;
  private readonly now: () => number;

  constructor({ db, supabase, powersyncUrl, now = Date.now }: ConnectorOptions) {
    this.db = db;
    this.supabase = supabase;
    this.powersyncUrl = powersyncUrl;
    this.now = now;
  }

  /**
   * Also learns the clock offset. If that fails, this fails, so no upload
   * ever runs without a known offset.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    if (data.session === null) return null;

    await this.learnClockOffset();
    return {
      endpoint: this.powersyncUrl,
      token: data.session.access_token,
      expiresAt:
        data.session.expires_at === undefined
          ? undefined
          : new Date(data.session.expires_at * 1000),
    };
  }

  async uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    for (;;) {
      const transaction = await db.getNextCrudTransaction();
      if (transaction === null) return;
      await this.uploadTransaction(db, transaction.crud);
      await transaction.complete();
    }
  }

  /**
   * Uploads one transaction's operations, in order. Returns once they are on
   * the server or set aside; throws when PowerSync should retry.
   */
  async uploadTransaction(db: CommonPowerSyncDatabase, crud: readonly CrudEntry[]): Promise<void> {
    const payloads: Payload[] = [];
    for (const op of crud) payloads.push(await this.payloadFor(db, op));

    try {
      for (const [i, op] of crud.entries()) {
        const payload = payloads[i]!;
        if (payload.kind === 'unexpected') {
          await setAside(db, [{ op, body: op.opData ?? {} }], UNEXPECTED_OP);
        } else if (payload.kind === 'send') {
          await this.send(op, payload.body);
        }
      }
    } catch (error) {
      if (!(error instanceof UploadRefused) || !isPermanent(error.code)) throw error;
      const refused = crud.flatMap((op, i) => {
        const payload = payloads[i]!;
        return payload.kind === 'send' ? [{ op, body: payload.body }] : [];
      });
      await setAside(db, refused, error.code);
    }
  }

  private async learnClockOffset(): Promise<void> {
    const sentMs = this.now();
    const { data, error } = await this.supabase.rpc('server_now');
    const receivedMs = this.now();
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('server_now() did not return a timestamp');

    const serverMs = Date.parse(timestampFromDb(data));
    await setClockOffset(this.db, clockOffsetMs(serverMs, sentMs, receivedMs));
  }

  private async payloadFor(db: CommonPowerSyncDatabase, op: CrudEntry): Promise<Payload> {
    switch (op.table) {
      case 'count_events':
      case 'sessions':
        if (op.op === UpdateType.PUT) {
          return { kind: 'send', body: toServerRow(op.table, { ...op.opData, id: op.id }) };
        }
        if (op.table === 'sessions' && op.op === UpdateType.PATCH && isEndingOnly(op.opData)) {
          return { kind: 'send', body: { ended_at: op.opData.ended_at } };
        }
        return { kind: 'unexpected' };
      case 'practice_positions':
        return op.op === UpdateType.DELETE
          ? { kind: 'unexpected' }
          : this.positionPayload(db, op.id);
      default:
        return { kind: 'unexpected' };
    }
  }

  /**
   * The whole local row, restamped first if a clock runs ahead. Read and
   * restamped in one transaction, so a concurrent edit can't slip between.
   * A row that doesn't decode is sent as it is, and the server drops it.
   */
  private async positionPayload(db: CommonPowerSyncDatabase, id: string): Promise<Payload> {
    return db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<Record<string, unknown>>(
        'SELECT * FROM practice_positions WHERE id = ?',
        [id],
      );
      if (row === null) return { kind: 'skip' };

      let position;
      try {
        position = positionFromRow(row);
      } catch {
        return { kind: 'send', body: row };
      }
      const state = await requireDeviceState(tx);
      const restamped = restampPosition(position, correctedNow(state, this.now()), state.device_id);
      if (restamped === null) return { kind: 'send', body: row };

      const restampedRow = positionToRow(restamped);
      await tx.execute('UPDATE practice_positions SET hlc = ?, deleted_hlc = ? WHERE id = ?', [
        restampedRow.hlc,
        restampedRow.deleted_hlc,
        id,
      ]);
      return { kind: 'send', body: { ...restampedRow } };
    });
  }

  private async send(op: CrudEntry, body: Record<string, unknown>): Promise<void> {
    const { error } =
      op.table === 'practice_positions'
        ? await this.supabase.rpc('merge_practice_position', { row: body })
        : op.op === UpdateType.PATCH
          ? await this.supabase.from('sessions').update(body).eq('id', op.id).is('ended_at', null)
          : await this.supabase
              .from(op.table)
              .upsert(body, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      // A code means Postgres answered; without one the request itself failed, so retry.
      if (error.code) throw new UploadRefused(error.code, error.message);
      throw new Error(`Upload to ${op.table} failed: ${error.message}`);
    }
  }
}

function isEndingOnly(opData: Record<string, unknown> | undefined): opData is { ended_at: string } {
  return (
    opData !== undefined && Object.keys(opData).length === 1 && typeof opData.ended_at === 'string'
  );
}

/**
 * Keeps refused operations on the device with the payload each sent, so a
 * later fix can send it again. Logs name the table, id and code, never the
 * data: a practice id reveals religion.
 */
async function setAside(
  db: CommonPowerSyncDatabase,
  refused: readonly { op: CrudEntry; body: Record<string, unknown> }[],
  code: string,
): Promise<void> {
  const failedAt = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (const { op, body } of refused) {
      await tx.execute(
        `INSERT INTO upload_failures (id, table_name, op, row_id, error_code, payload, failed_at)
         VALUES (uuid(), ?, ?, ?, ?, ?, ?)`,
        [op.table, op.op, op.id, code, JSON.stringify(body), failedAt],
      );
    }
  });
  for (const { op } of refused) {
    db.logger.log({
      level: LogLevels.warn,
      message: `Upload set aside: ${op.table} ${op.op} ${op.id} (${code})`,
    });
  }
}

/**
 * The writes a lab device makes, as the app will make them: sealed count
 * events in a session, and a namavali position stamped with the corrected
 * clock. Each runs inside the caller's write transaction.
 *
 * M3 builds the app's real repositories; these are only what S4 needs.
 */

import {
  clockForEdit,
  countEventFromRow,
  countEventToRow,
  createMarks,
  derivedId,
  isPassComplete,
  isPositionDeleted,
  localDay,
  markStep as markInBitset,
  positionFromRow,
  positionToRow,
  sessionFromRow,
  sessionToRow,
  uuidv7,
  type CountEvent,
  type PracticePosition,
  type Session,
  type SyncedTable,
} from '@japadhyan/shared';

import { correctedNow, type DeviceState, type Sql } from './client';

/** Every practice in the lab is at version 1. */
export const PRACTICE_VERSION = 1;

/** What a write needs: the transaction, the device, and its wall clock now. */
export interface WriteContext {
  tx: Sql;
  state: DeviceState;
  nowMs: number;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** This device's open session for the practice today, or a new one. */
async function openSession(
  { tx, state, nowMs }: WriteContext,
  practiceId: string,
  steps: number,
): Promise<Session> {
  const today = localDay(iso(nowMs), 0);
  const open = await tx.getOptional(
    `SELECT * FROM sessions WHERE user_id = ? AND practice_id = ? AND device_id = ?
       AND ended_at IS NULL AND local_day = ? AND steps_per_repetition = ?`,
    [state.owner_id, practiceId, state.device_id, today, steps],
  );
  if (open !== null) return sessionFromRow(open);

  const session: Session = {
    id: uuidv7({ nowMs }),
    user_id: state.owner_id,
    practice_id: practiceId,
    device_id: state.device_id,
    started_at: iso(nowMs),
    ended_at: null,
    local_day: today,
    tz_offset_min: 0,
    practice_version: PRACTICE_VERSION,
    steps_per_repetition: steps,
  };
  await insert(tx, 'sessions', { ...sessionToRow(session) });
  return session;
}

async function recordEvent(
  ctx: WriteContext,
  practiceId: string,
  count: number,
  steps: number,
): Promise<CountEvent> {
  const session = await openSession(ctx, practiceId, steps);
  const event: CountEvent = {
    id: uuidv7({ nowMs: ctx.nowMs }),
    user_id: ctx.state.owner_id,
    practice_id: practiceId,
    session_id: session.id,
    mode: count < 0 ? 'correction' : 'mala_tap',
    count,
    estimated: false,
    device_id: ctx.state.device_id,
    created_at: iso(ctx.nowMs),
    local_day: session.local_day,
    tz_offset_min: session.tz_offset_min,
    steps_per_repetition: session.steps_per_repetition,
  };
  await insert(ctx.tx, 'count_events', { ...countEventToRow(event) });
  return event;
}

/** Repetitions of a mantra; a negative count is a correction to today's session. */
export function chant(ctx: WriteContext, practiceId: string, count: number): Promise<CountEvent> {
  return recordEvent(ctx, practiceId, count, 1);
}

export async function endSession(ctx: WriteContext, practiceId: string): Promise<void> {
  await ctx.tx.execute(
    `UPDATE sessions SET ended_at = ?
       WHERE user_id = ? AND practice_id = ? AND device_id = ? AND ended_at IS NULL`,
    [iso(ctx.nowMs), ctx.state.owner_id, practiceId, ctx.state.device_id],
  );
}

export async function markStep(
  ctx: WriteContext,
  practiceId: string,
  stepIndex: number,
  stepCount: number,
): Promise<PracticePosition> {
  const current = await readPosition(ctx.tx, practiceId);
  const { base, hlc } = clockForEdit(
    current,
    correctedNow(ctx.state, ctx.nowMs),
    ctx.state.device_id,
  );
  // A revived position keeps the names marked before it was deleted, as the
  // merge would bring them back anyway (docs/decisions/2026-09-22-position-deletion-barrier.md).
  const marks = base === null ? createMarks(stepCount) : base.chanted_steps;
  const next: PracticePosition = {
    id: derivedId({
      table: 'practice_positions',
      user_id: ctx.state.owner_id,
      practice_id: practiceId,
    }),
    user_id: ctx.state.owner_id,
    practice_id: practiceId,
    practice_version: PRACTICE_VERSION,
    pass_ordinal: 0,
    deleted_hlc: null,
    deleted_at: null,
    ...base,
    step_index: stepIndex,
    chanted_steps: markInBitset(marks, stepIndex, stepCount),
    hlc,
  };
  await writePosition(ctx.tx, next, current !== null);
  return next;
}

/** Records the recitation and resets the marks, in the caller's one transaction. */
export async function finishPass(
  ctx: WriteContext,
  practiceId: string,
  stepCount: number,
): Promise<CountEvent> {
  const current = await readPosition(ctx.tx, practiceId);
  if (current === null || isPositionDeleted(current)) {
    throw new Error(`No live position for ${practiceId}`);
  }
  if (!isPassComplete(current.chanted_steps, stepCount)) {
    throw new Error(`Pass ${current.pass_ordinal} of ${practiceId} is not complete`);
  }
  const event = await recordEvent(ctx, practiceId, 1, stepCount);
  const { base, hlc } = clockForEdit(
    current,
    correctedNow(ctx.state, ctx.nowMs),
    ctx.state.device_id,
  );
  await writePosition(
    ctx.tx,
    {
      ...base!,
      pass_ordinal: current.pass_ordinal + 1,
      chanted_steps: createMarks(stepCount),
      step_index: 0,
      hlc,
    },
    true,
  );
  return event;
}

export async function deletePosition(ctx: WriteContext, practiceId: string): Promise<void> {
  const current = await readPosition(ctx.tx, practiceId);
  if (current === null) throw new Error(`No position for ${practiceId}`);
  const nowMs = correctedNow(ctx.state, ctx.nowMs);
  const { base, hlc } = clockForEdit(current, nowMs, ctx.state.device_id);
  await writePosition(ctx.tx, { ...base!, deleted_hlc: hlc, deleted_at: iso(nowMs) }, true);
}

/** The device's one position for a practice, if any. */
export async function readPosition(sql: Sql, practiceId: string): Promise<PracticePosition | null> {
  const rows = await sql.getAll('SELECT * FROM practice_positions WHERE practice_id = ?', [
    practiceId,
  ]);
  if (rows.length > 1) throw new Error(`${rows.length} positions for ${practiceId}`);
  return rows.length === 0 ? null : positionFromRow(rows[0]);
}

export async function readEvents(sql: Sql, practiceId: string): Promise<CountEvent[]> {
  const rows = await sql.getAll('SELECT * FROM count_events WHERE practice_id = ?', [practiceId]);
  return rows.map(countEventFromRow);
}

async function writePosition(tx: Sql, position: PracticePosition, exists: boolean): Promise<void> {
  const { id, ...fields } = positionToRow(position);
  if (!exists) {
    await insert(tx, 'practice_positions', { id, ...fields });
    return;
  }
  const columns = Object.keys(fields);
  await tx.execute(
    `UPDATE practice_positions SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(fields), id],
  );
}

/** A plain insert, as the app's code makes one; tests use it to write rows by hand. */
export async function insert(
  tx: Sql,
  table: SyncedTable,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  await tx.execute(
    `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
    Object.values(row),
  );
}

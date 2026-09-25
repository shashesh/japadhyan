/**
 * The synced records as table rows. PowerSync's columns are text, integer or
 * real, so a row is the record with its richer values written down:
 *
 * - `estimated` as `0` or `1` (how PowerSync syncs a Postgres `boolean`);
 * - a position's marks as lowercase hex, and its clocks in their text form;
 * - timestamps as ISO strings. Reading accepts the forms the databases hand
 *   back — PowerSync's `2026-09-24 05:30:00.000Z`, PostgREST's `+00:00` —
 *   and normalises them, so a record reads the same whichever way it came.
 *
 * Reading validates: a row comes from storage or the network, never trusted.
 * See docs/architecture/data-model.md#storage-and-sync.
 */

import { z } from 'zod';

import type { ChantMode, CountEvent, PracticePosition, Session } from '../types';
import { hlcFromText, hlcToText } from './hlcText';
import { marksFromHex, marksToHex } from './marks';
import { UUID } from './uuidFormat';

export const CHANT_MODES = [
  'mala_tap',
  'word_tap',
  'likhita_typing',
  'silent_pace',
  'silent_breath',
  'volume_button',
  'manual',
  'correction',
  'voice',
  'watch',
  'chant_along',
  'listening',
  'handwriting',
  'ring',
] as const satisfies readonly ChantMode[];

export type SyncedTable = 'count_events' | 'sessions' | 'practice_positions';

export interface SessionRow {
  id: string;
  user_id: string;
  practice_id: string;
  device_id: string;
  started_at: string;
  ended_at: string | null;
  local_day: string;
  tz_offset_min: number;
  practice_version: number;
  steps_per_repetition: number;
}

export interface CountEventRow {
  id: string;
  user_id: string;
  practice_id: string;
  session_id: string;
  mode: ChantMode;
  count: number;
  estimated: 0 | 1;
  device_id: string;
  created_at: string;
  local_day: string;
  tz_offset_min: number;
  steps_per_repetition: number;
}

export interface PracticePositionRow {
  id: string;
  user_id: string;
  practice_id: string;
  practice_version: number;
  step_index: number;
  /** Lowercase hex. */
  chanted_steps: string;
  pass_ordinal: number;
  /** `hlcToText` form. */
  hlc: string;
  deleted_hlc: string | null;
  deleted_at: string | null;
}

/** Date, `T` or a space, time, up to nine fractional digits, then `Z` or an offset. */
const DB_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):?(\d{2})?)$/;

/**
 * Checks the calendar, not just the shape: `Date` would roll 30 February or
 * hour 24 forward into another day instead of rejecting them.
 */
const REAL_DATETIME = z.iso.datetime({ offset: true });

/**
 * To `YYYY-MM-DDTHH:MM:SS.sssZ`. Fractions beyond milliseconds are
 * truncated, not rounded, so a time never moves into the next second.
 */
function toIso(stored: string, ctx: z.RefinementCtx): string {
  const match = DB_TIMESTAMP.exec(stored);
  if (match === null) {
    ctx.addIssue({ code: 'custom', message: `Not a timestamp: "${stored}"` });
    return z.NEVER;
  }
  const [, date, time, fraction = '', zone, sign, hours, minutes = '00'] = match;
  const millis = fraction.padEnd(3, '0').slice(0, 3);
  const offset = zone === 'Z' ? 'Z' : `${sign}${hours}:${minutes}`;
  // The one form every JavaScript engine must parse, Hermes included.
  const candidate = `${date}T${time}.${millis}${offset}`;
  if (!REAL_DATETIME.safeParse(candidate).success) {
    ctx.addIssue({ code: 'custom', message: `Not a real time: "${stored}"` });
    return z.NEVER;
  }
  return new Date(candidate).toISOString();
}

const uuid = z.string().regex(UUID, 'Not a lowercase UUID');
const text = z.string().min(1);
const int = z.number().int();
const nonNegativeInt = int.nonnegative();
const positiveInt = int.positive();
const timestamp = z.string().transform(toIso);
/** A real calendar date, since `local_day` is stored as is and never self-corrects. */
const localDay = z.iso.date();
const hlcText = z.string().transform((value, ctx) => {
  try {
    return hlcFromText(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: `Not an hlc: "${value}"` });
    return z.NEVER;
  }
});
const marksHex = z
  .string()
  .regex(/^(?:[0-9a-f]{2})*$/, 'Not lowercase hex bytes')
  .transform(marksFromHex);

const sessionRow = z.object({
  id: uuid,
  user_id: uuid,
  practice_id: text,
  device_id: text,
  started_at: timestamp,
  ended_at: timestamp.nullable(),
  local_day: localDay,
  tz_offset_min: int,
  practice_version: positiveInt,
  steps_per_repetition: positiveInt,
});

const countEventRow = z.object({
  id: uuid,
  user_id: uuid,
  practice_id: text,
  session_id: uuid,
  mode: z.enum(CHANT_MODES),
  count: int,
  estimated: z.union([z.literal(0), z.literal(1)]).transform((flag) => flag === 1),
  device_id: text,
  created_at: timestamp,
  local_day: localDay,
  tz_offset_min: int,
  steps_per_repetition: positiveInt,
});

const positionRow = z.object({
  id: uuid,
  user_id: uuid,
  practice_id: text,
  practice_version: positiveInt,
  step_index: nonNegativeInt,
  chanted_steps: marksHex,
  pass_ordinal: nonNegativeInt,
  hlc: hlcText,
  deleted_hlc: hlcText.nullable(),
  deleted_at: timestamp.nullable(),
});

export function sessionToRow(session: Session): SessionRow {
  return { ...session };
}

export function sessionFromRow(row: unknown): Session {
  return sessionRow.parse(row);
}

export function countEventToRow(event: CountEvent): CountEventRow {
  return { ...event, estimated: event.estimated ? 1 : 0 };
}

export function countEventFromRow(row: unknown): CountEvent {
  return countEventRow.parse(row);
}

export function positionToRow(position: PracticePosition): PracticePositionRow {
  return {
    ...position,
    chanted_steps: marksToHex(position.chanted_steps),
    hlc: hlcToText(position.hlc),
    deleted_hlc: position.deleted_hlc === null ? null : hlcToText(position.deleted_hlc),
  };
}

export function positionFromRow(row: unknown): PracticePosition {
  return positionRow.parse(row);
}

/**
 * A row as Postgres takes it through PostgREST: the one difference is that
 * `estimated` is a real `boolean` there. Returns a new object.
 */
export function toServerRow(table: SyncedTable, row: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  if (table === 'count_events' && (copy.estimated === 0 || copy.estimated === 1)) {
    copy.estimated = copy.estimated === 1;
  }
  return copy;
}

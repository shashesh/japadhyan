import type { ChantMode, CountEvent } from '../types';

/** Modes whose counts are kept apart from the chanted total. */
export const SEPARATELY_COUNTED_MODES: readonly ChantMode[] = ['listening'];

export interface TotalOptions {
  mantraId?: string;
  /** Include listening japa in the total. Default false. */
  includeListening?: boolean;
}

function isIncluded(event: CountEvent, options: TotalOptions): boolean {
  if (options.mantraId !== undefined && event.mantra_id !== options.mantraId) return false;
  if (!options.includeListening && SEPARATELY_COUNTED_MODES.includes(event.mode)) return false;
  return true;
}

/** Total repetitions across all modes: one count, many inputs. */
export function totalCount(events: readonly CountEvent[], options: TotalOptions = {}): number {
  return events.reduce((sum, e) => (isIncluded(e, options) ? sum + e.count : sum), 0);
}

/** Repetitions per mode, for the "mode mix" insight. */
export function countsByMode(
  events: readonly CountEvent[],
  options: TotalOptions = {},
): Partial<Record<ChantMode, number>> {
  const result: Partial<Record<ChantMode, number>> = {};
  for (const e of events) {
    if (!isIncluded(e, { ...options, includeListening: true })) continue;
    result[e.mode] = (result[e.mode] ?? 0) + e.count;
  }
  return result;
}

export interface RoundProgress {
  /** Completed rounds (malas). */
  completed_rounds: number;
  /** Position in the current round, 0..round_size-1. */
  bead: number;
  /** True when the latest repetition finished a round (the meru bead). */
  at_meru: boolean;
}

export function roundProgress(total: number, roundSize: number): RoundProgress {
  if (!Number.isInteger(roundSize) || roundSize <= 0) {
    throw new RangeError(`roundSize must be a positive integer, got ${roundSize}`);
  }
  const safeTotal = Math.max(0, Math.floor(total));
  return {
    completed_rounds: Math.floor(safeTotal / roundSize),
    bead: safeTotal % roundSize,
    at_meru: safeTotal > 0 && safeTotal % roundSize === 0,
  };
}

/**
 * Merge event lists from several devices. Events are identified by id, so
 * syncing the same event twice never double-counts.
 */
export function mergeEvents(...lists: readonly (readonly CountEvent[])[]): CountEvent[] {
  const byId = new Map<string, CountEvent>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Daily totals keyed by local date (YYYY-MM-DD). The caller supplies
 * `toDayKey` so the device's own time zone decides what "today" is.
 */
export function dailyTotals(
  events: readonly CountEvent[],
  toDayKey: (isoTimestamp: string) => string,
  options: TotalOptions = {},
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of events) {
    if (!isIncluded(e, options)) continue;
    const key = toDayKey(e.created_at);
    result[key] = (result[key] ?? 0) + e.count;
  }
  return result;
}

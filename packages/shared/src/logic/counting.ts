/**
 * Deriving totals from count events. Nothing here stores a counter: every
 * total is summed from the append-only events, which is what makes offline
 * sync safe — merging can neither lose nor double a count.
 *
 * Totals are summed **per session**, with each session's net floored at
 * zero, so a correction can undo its own session and no other.
 * See docs/architecture/data-model.md#counting.
 */

import type { ChantMode, CountEvent, DayKey } from '../types';

/** Modes whose counts are kept apart from the chanted total. */
export const SEPARATELY_COUNTED_MODES: readonly ChantMode[] = ['listening'];

export interface TotalOptions {
  practiceId?: string;
  /** Include listening japa in the total. Default false. */
  includeListening?: boolean;
}

/**
 * A `correction` carries `mode: 'correction'`, not the mode it adjusts, so it
 * is filtered with the session it belongs to rather than with a mode. That
 * holds only while a session never mixes listening with chanted counts, which
 * is true in P1 because listening japa is P2. Settle it before building
 * listening: docs/product/open-questions.md#corrections-to-listening-japa-p2.
 */
function isIncluded(event: CountEvent, options: TotalOptions): boolean {
  if (options.practiceId !== undefined && event.practice_id !== options.practiceId) return false;
  if (!options.includeListening && SEPARATELY_COUNTED_MODES.includes(event.mode)) return false;
  return true;
}

/**
 * Sum `weigh` over the events, grouped by `groupBy` then by session, with
 * each session's net floored at zero before the groups are added up.
 */
function sumFlooredBySession<K>(
  events: readonly CountEvent[],
  options: TotalOptions,
  weigh: (event: CountEvent) => number,
  groupBy: (event: CountEvent) => K,
): Map<K, number> {
  const bySession = new Map<K, Map<string, number>>();
  for (const e of events) {
    if (!isIncluded(e, options)) continue;
    const key = groupBy(e);
    const sessions = bySession.get(key) ?? new Map<string, number>();
    sessions.set(e.session_id, (sessions.get(e.session_id) ?? 0) + weigh(e));
    bySession.set(key, sessions);
  }

  const totals = new Map<K, number>();
  for (const [key, sessions] of bySession) {
    let total = 0;
    for (const net of sessions.values()) total += Math.max(0, net);
    totals.set(key, total);
  }
  return totals;
}

const repetitions = (e: CountEvent): number => e.count;

/** Names chanted, using the steps stored on the event, never the practice's current count. */
const names = (e: CountEvent): number => e.count * e.steps_per_repetition;

const ALL = Symbol('all');

/** Total repetitions across all modes: one count, many inputs. */
export function totalCount(events: readonly CountEvent[], options: TotalOptions = {}): number {
  return sumFlooredBySession(events, options, repetitions, () => ALL).get(ALL) ?? 0;
}

/**
 * Total names chanted: `count × steps_per_repetition` per event. One
 * Ashtottara and one mala of a mantra weigh about the same, which is what
 * the annual heatmap and cross-practice totals compare.
 */
export function namesChanted(events: readonly CountEvent[], options: TotalOptions = {}): number {
  return sumFlooredBySession(events, options, names, () => ALL).get(ALL) ?? 0;
}

/**
 * Repetitions per local day. Days are grouped by the event's `local_day`,
 * never by converting `created_at`, so a session in Brahma muhurta belongs
 * to the date on the devotee's wall. Days with nothing left after
 * corrections are omitted.
 */
export function dailyTotals(
  events: readonly CountEvent[],
  options: TotalOptions = {},
): Record<DayKey, number> {
  const result: Record<DayKey, number> = {};
  for (const [day, total] of sumFlooredBySession(
    events,
    options,
    repetitions,
    (e) => e.local_day,
  )) {
    if (total > 0) result[day] = total;
  }
  return result;
}

/** The local days with at least one repetition left after corrections. */
export function practisedDays(
  events: readonly CountEvent[],
  options: TotalOptions = {},
): ReadonlySet<DayKey> {
  return new Set(Object.keys(dailyTotals(events, options)));
}

/**
 * Repetitions per mode, for the "mode mix" insight: how the devotee chanted.
 * Listening is included as its own mode.
 *
 * Corrections are left out. They adjust a session rather than being a way of
 * chanting, so counting them here would show a negative slice of the mix and
 * make the percentages nonsense. `manual` stays — practice done elsewhere is
 * still practice, only logged by hand.
 */
export function countsByMode(
  events: readonly CountEvent[],
  options: TotalOptions = {},
): Partial<Record<ChantMode, number>> {
  const result: Partial<Record<ChantMode, number>> = {};
  for (const e of events) {
    if (e.mode === 'correction') continue;
    if (!isIncluded(e, { ...options, includeListening: true })) continue;
    result[e.mode] = (result[e.mode] ?? 0) + e.count;
  }
  return result;
}

export interface RoundProgress {
  /** Completed rounds (malas for a mantra, recitations for a namavali). */
  completed_rounds: number;
  /** Position in the current round, 0..roundSize-1. */
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
 * syncing the same event twice never double-counts. Nothing else is
 * deduplicated: a recitation counts where it was chanted.
 */
export function mergeEvents(...lists: readonly (readonly CountEvent[])[]): CountEvent[] {
  const byId = new Map<string, CountEvent>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Gentle streaks. A single missed day is a "grace day": it doesn't break the
 * streak (but isn't counted in it). Two consecutive missed days end it.
 * See docs/product/features/sankalpa-and-progress.md.
 */
export interface StreakResult {
  /** Days practised in the current streak. */
  days: number;
  /** Grace days used within the current streak. */
  grace_days_used: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDayKey(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Invalid day key: ${key}`);
  return Date.parse(`${key}T00:00:00Z`);
}

function toDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param practisedDays local date keys (YYYY-MM-DD) with at least one repetition
 * @param today local date key for today. Today not yet practised doesn't break the streak.
 * @param maxConsecutiveGraceDays missed days in a row that are forgiven (default 1)
 */
export function computeStreak(
  practisedDays: Iterable<string>,
  today: string,
  maxConsecutiveGraceDays = 1,
): StreakResult {
  const practised = new Set(practisedDays);
  let cursor = parseDayKey(today);
  // Today not practised yet is not a miss: start from yesterday.
  if (!practised.has(today)) cursor -= DAY_MS;

  let days = 0;
  let graceUsed = 0;
  let missRun = 0;
  let pendingGrace = 0;
  for (;;) {
    const key = toDayKey(cursor);
    if (practised.has(key)) {
      days += 1;
      graceUsed += pendingGrace;
      pendingGrace = 0;
      missRun = 0;
    } else {
      missRun += 1;
      if (missRun > maxConsecutiveGraceDays) break;
      pendingGrace += 1;
    }
    cursor -= DAY_MS;
  }
  return { days, grace_days_used: graceUsed };
}

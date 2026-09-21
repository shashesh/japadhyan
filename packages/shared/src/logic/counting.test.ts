import { describe, expect, it } from 'vitest';
import type { ChantMode, CountEvent } from '../types';
import { countsByMode, dailyTotals, mergeEvents, roundProgress, totalCount } from './counting';

let seq = 0;
function ev(mode: ChantMode, count = 1, overrides: Partial<CountEvent> = {}): CountEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    mantra_id: 'om-namah-shivaya',
    session_id: 's1',
    mode,
    count,
    estimated: mode.startsWith('silent'),
    device_id: 'phone',
    created_at: `2026-09-21T0${seq % 10}:00:00Z`,
    ...overrides,
  };
}

describe('totalCount', () => {
  it('adds every mode into one count', () => {
    const events = [ev('mala_tap', 10), ev('word_tap', 5), ev('silent_pace', 20), ev('voice', 3)];
    expect(totalCount(events)).toBe(38);
  });

  it('keeps listening japa out of the chanted total unless asked', () => {
    const events = [ev('mala_tap', 10), ev('listening', 108)];
    expect(totalCount(events)).toBe(10);
    expect(totalCount(events, { includeListening: true })).toBe(118);
  });

  it('filters by mantra', () => {
    const events = [ev('mala_tap', 4), ev('mala_tap', 6, { mantra_id: 'other' })];
    expect(totalCount(events, { mantraId: 'other' })).toBe(6);
  });
});

describe('countsByMode', () => {
  it('reports the mode mix, including listening', () => {
    const events = [ev('mala_tap', 2), ev('mala_tap', 3), ev('listening', 7)];
    expect(countsByMode(events)).toEqual({ mala_tap: 5, listening: 7 });
  });
});

describe('roundProgress', () => {
  it('tracks beads and rounds', () => {
    expect(roundProgress(0, 108)).toEqual({ completed_rounds: 0, bead: 0, at_meru: false });
    expect(roundProgress(50, 108)).toEqual({ completed_rounds: 0, bead: 50, at_meru: false });
    expect(roundProgress(108, 108)).toEqual({ completed_rounds: 1, bead: 0, at_meru: true });
    expect(roundProgress(250, 108)).toEqual({ completed_rounds: 2, bead: 34, at_meru: false });
  });

  it('rejects invalid round sizes', () => {
    expect(() => roundProgress(1, 0)).toThrow(RangeError);
  });
});

describe('mergeEvents', () => {
  it('never double-counts an event synced twice', () => {
    const a = ev('mala_tap', 10);
    const b = ev('voice', 5, { device_id: 'watch' });
    const merged = mergeEvents([a, b], [a]);
    expect(merged).toHaveLength(2);
    expect(totalCount(merged)).toBe(15);
  });
});

describe('dailyTotals', () => {
  it('groups by the caller-supplied day key', () => {
    const events = [
      ev('mala_tap', 1, { created_at: '2026-09-20T23:30:00Z' }),
      ev('mala_tap', 2, { created_at: '2026-09-21T01:00:00Z' }),
    ];
    // New York is UTC-4: both events fall on 2026-09-20 locally.
    const nyDay = (iso: string) =>
      new Date(Date.parse(iso) - 4 * 3600_000).toISOString().slice(0, 10);
    expect(dailyTotals(events, nyDay)).toEqual({ '2026-09-20': 3 });
  });
});

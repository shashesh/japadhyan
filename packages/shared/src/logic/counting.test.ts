import { describe, expect, test } from 'vitest';

import type { ChantMode, CountEvent } from '../types';
import {
  countsByMode,
  dailyTotals,
  mergeEvents,
  namesChanted,
  practisedDays,
  roundProgress,
  totalCount,
} from './counting';

let seq = 0;

function event(overrides: Partial<CountEvent> = {}): CountEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    user_id: 'user-1',
    practice_id: 'om-namah-shivaya',
    session_id: 's1',
    mode: 'mala_tap' as ChantMode,
    count: 1,
    steps_per_repetition: 1,
    estimated: false,
    device_id: 'd1',
    created_at: `2026-09-22T10:00:0${seq % 10}.000Z`,
    local_day: '2026-09-22',
    tz_offset_min: 330,
    ...overrides,
  };
}

describe('totalCount', () => {
  test('sums repetitions across every chanted mode: one count, many inputs', () => {
    const events = [
      event({ mode: 'mala_tap', count: 108 }),
      event({ mode: 'word_tap', count: 20 }),
      event({ mode: 'silent_pace', count: 12, estimated: true }),
      event({ mode: 'manual', count: 60 }),
    ];

    expect(totalCount(events)).toBe(200);
  });

  test('includes estimated counts', () => {
    expect(totalCount([event({ mode: 'silent_breath', count: 5, estimated: true })])).toBe(5);
  });

  test('keeps listening japa out of the chanted total', () => {
    const events = [
      event({ mode: 'mala_tap', count: 10 }),
      event({ mode: 'listening', count: 90 }),
    ];

    expect(totalCount(events)).toBe(10);
  });

  test('includes listening only when asked', () => {
    const events = [
      event({ mode: 'mala_tap', count: 10 }),
      event({ mode: 'listening', count: 90 }),
    ];

    expect(totalCount(events, { includeListening: true })).toBe(100);
  });

  test('filters by practice', () => {
    const events = [
      event({ practice_id: 'om-namah-shivaya', count: 10 }),
      event({ practice_id: 'vishnu-ashtottara', count: 3 }),
    ];

    expect(totalCount(events, { practiceId: 'vishnu-ashtottara' })).toBe(3);
  });

  test('is zero for no events', () => {
    expect(totalCount([])).toBe(0);
  });
});

describe('totalCount: corrections', () => {
  test('a correction reduces the total', () => {
    const events = [
      event({ session_id: 's1', count: 108 }),
      event({ session_id: 's1', mode: 'correction', count: -8 }),
    ];

    expect(totalCount(events)).toBe(100);
  });

  test("a correction cannot drive a session's net below zero", () => {
    const events = [
      event({ session_id: 's1', count: 10 }),
      event({ session_id: 's1', mode: 'correction', count: -50 }),
    ];

    expect(totalCount(events)).toBe(0);
  });

  test('an over-correction in one session never eats another session', () => {
    const events = [
      event({ session_id: 's1', count: 10 }),
      event({ session_id: 's1', mode: 'correction', count: -50 }),
      event({ session_id: 's2', count: 108 }),
    ];

    expect(totalCount(events)).toBe(108);
  });
});

describe('namesChanted', () => {
  test('counts one recitation of an Ashtottara as 108 names', () => {
    const events = [
      event({ practice_id: 'vishnu-ashtottara', count: 1, steps_per_repetition: 108 }),
    ];

    expect(namesChanted(events)).toBe(108);
  });

  test('weighs a mala of a mantra and one Ashtottara about the same', () => {
    const mala = [event({ count: 108, steps_per_repetition: 1 })];
    const ashtottara = [event({ count: 1, steps_per_repetition: 108 })];

    expect(namesChanted(mala)).toBe(namesChanted(ashtottara));
  });

  test('uses the steps stored on the event, not a practice’s current step count', () => {
    // The practice was later corrected from 108 names to 110; history holds.
    const events = [
      event({ count: 1, steps_per_repetition: 108 }),
      event({ count: 1, steps_per_repetition: 110, session_id: 's2' }),
    ];

    expect(namesChanted(events)).toBe(218);
  });

  test('applies corrections in names, floored per session', () => {
    const events = [
      event({ session_id: 's1', count: 2, steps_per_repetition: 108 }),
      event({ session_id: 's1', mode: 'correction', count: -1, steps_per_repetition: 108 }),
    ];

    expect(namesChanted(events)).toBe(108);
  });

  test('keeps listening japa out', () => {
    const events = [
      event({ count: 1, steps_per_repetition: 108 }),
      event({ mode: 'listening', count: 1, steps_per_repetition: 108, session_id: 's2' }),
    ];

    expect(namesChanted(events)).toBe(108);
  });
});

describe('dailyTotals', () => {
  test('groups by the stored local day, never by converting created_at', () => {
    // 23:30 UTC is already the next day in India; the event says so.
    const events = [
      event({ created_at: '2026-09-21T23:30:00.000Z', local_day: '2026-09-22', count: 5 }),
      event({ created_at: '2026-09-22T04:00:00.000Z', local_day: '2026-09-22', count: 3 }),
    ];

    expect(dailyTotals(events)).toEqual({ '2026-09-22': 8 });
  });

  test('separates days', () => {
    const events = [
      event({ local_day: '2026-09-21', count: 5 }),
      event({ local_day: '2026-09-22', count: 3 }),
    ];

    expect(dailyTotals(events)).toEqual({ '2026-09-21': 5, '2026-09-22': 3 });
  });

  test('floors each session at zero within its day', () => {
    const events = [
      event({ local_day: '2026-09-22', session_id: 's1', count: 10 }),
      event({ local_day: '2026-09-22', session_id: 's1', mode: 'correction', count: -50 }),
      event({ local_day: '2026-09-22', session_id: 's2', count: 7 }),
    ];

    expect(dailyTotals(events)).toEqual({ '2026-09-22': 7 });
  });

  test('omits a day whose net is zero', () => {
    const events = [
      event({ local_day: '2026-09-22', session_id: 's1', count: 10 }),
      event({ local_day: '2026-09-22', session_id: 's1', mode: 'correction', count: -10 }),
    ];

    expect(dailyTotals(events)).toEqual({});
  });
});

describe('practisedDays', () => {
  test('is the days whose net count is above zero', () => {
    const events = [
      event({ local_day: '2026-09-20', count: 5 }),
      event({ local_day: '2026-09-21', session_id: 's2', count: 10 }),
      event({ local_day: '2026-09-21', session_id: 's2', mode: 'correction', count: -10 }),
    ];

    expect([...practisedDays(events)]).toEqual(['2026-09-20']);
  });

  test('counts a day practised for any practice', () => {
    const events = [
      event({ local_day: '2026-09-20', practice_id: 'om-namah-shivaya', count: 1 }),
      event({ local_day: '2026-09-21', practice_id: 'vishnu-ashtottara', count: 1 }),
    ];

    expect([...practisedDays(events)].sort()).toEqual(['2026-09-20', '2026-09-21']);
  });
});

describe('countsByMode', () => {
  test('reports repetitions per mode, listening included', () => {
    const events = [
      event({ mode: 'mala_tap', count: 108 }),
      event({ mode: 'mala_tap', count: 54 }),
      event({ mode: 'listening', count: 9 }),
    ];

    expect(countsByMode(events)).toEqual({ mala_tap: 162, listening: 9 });
  });

  test('keeps corrections out: they adjust a session, they are not a way of chanting', () => {
    const events = [
      event({ mode: 'mala_tap', count: 108 }),
      event({ mode: 'correction', count: -8 }),
    ];

    expect(countsByMode(events)).toEqual({ mala_tap: 108 });
  });

  test('never reports a negative slice of the mode mix', () => {
    const events = [event({ mode: 'correction', count: -50 })];

    expect(countsByMode(events)).toEqual({});
  });

  test('keeps manual logs, which are a way practice happened', () => {
    const events = [event({ mode: 'manual', count: 324 })];

    expect(countsByMode(events)).toEqual({ manual: 324 });
  });
});

describe('roundProgress', () => {
  test('reports completed rounds and the bead within the round', () => {
    expect(roundProgress(110, 108)).toEqual({
      completed_rounds: 1,
      bead: 2,
      at_meru: false,
    });
  });

  test('flags the meru bead when a round completes', () => {
    expect(roundProgress(108, 108)).toEqual({
      completed_rounds: 1,
      bead: 0,
      at_meru: true,
    });
  });

  test('is not at the meru before anything is chanted', () => {
    expect(roundProgress(0, 108).at_meru).toBe(false);
  });

  test('treats a namavali round of one as one recitation per round', () => {
    expect(roundProgress(3, 1)).toEqual({ completed_rounds: 3, bead: 0, at_meru: true });
  });

  test('rejects a round size that is not a positive integer', () => {
    expect(() => roundProgress(1, 0)).toThrow(RangeError);
  });
});

describe('mergeEvents', () => {
  test('syncing the same event twice never double counts', () => {
    const shared = event({ count: 10 });

    expect(totalCount(mergeEvents([shared], [shared]))).toBe(10);
  });

  test('keeps events from both devices', () => {
    const phone = event({ device_id: 'phone', count: 10 });
    const tablet = event({ device_id: 'tablet', count: 5, session_id: 's2' });

    expect(totalCount(mergeEvents([phone], [tablet]))).toBe(15);
  });
});

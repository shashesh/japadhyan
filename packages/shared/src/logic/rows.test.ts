import { describe, expect, expectTypeOf, test } from 'vitest';

import type { ChantMode, CountEvent, PracticePosition, Session } from '../types';
import { createMarks, markStep } from './marks';
import {
  CHANT_MODES,
  countEventFromRow,
  countEventToRow,
  positionFromRow,
  positionToRow,
  sessionFromRow,
  sessionToRow,
  toServerRow,
} from './rows';
import type { CountEventRow } from './rows';

const USER = '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79';
const DEVICE = '0192a4b0-0000-7000-8000-00000000000d';

const session: Session = {
  id: '0192a4b2-0000-7000-8000-000000000001',
  user_id: USER,
  practice_id: 'om-namah-shivaya',
  device_id: DEVICE,
  started_at: '2026-09-24T05:30:00.000Z',
  ended_at: null,
  local_day: '2026-09-24',
  tz_offset_min: 330,
  practice_version: 1,
  steps_per_repetition: 1,
};

const event: CountEvent = {
  id: '0192a4b2-0000-7000-8000-000000000002',
  user_id: USER,
  practice_id: 'om-namah-shivaya',
  session_id: session.id,
  mode: 'mala_tap',
  count: 108,
  estimated: false,
  device_id: DEVICE,
  created_at: '2026-09-24T05:42:10.123Z',
  local_day: '2026-09-24',
  tz_offset_min: 330,
  steps_per_repetition: 1,
};

const position: PracticePosition = {
  id: '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
  user_id: USER,
  practice_id: 'vishnu-ashtottara',
  practice_version: 2,
  step_index: 5,
  chanted_steps: markStep(markStep(createMarks(108), 0, 108), 4, 108),
  pass_ordinal: 3,
  hlc: { millis: 1727190000000, counter: 1, device_id: DEVICE },
  deleted_hlc: null,
  deleted_at: null,
};

describe('CHANT_MODES', () => {
  test('lists exactly the ChantMode values', () => {
    expectTypeOf<(typeof CHANT_MODES)[number]>().toEqualTypeOf<ChantMode>();
    expect(new Set(CHANT_MODES).size).toBe(CHANT_MODES.length);
  });
});

describe('each record round-trips through its row', () => {
  test('count event', () => {
    expect(countEventFromRow(countEventToRow(event))).toEqual(event);
    expect(countEventFromRow(countEventToRow({ ...event, estimated: true }))).toEqual({
      ...event,
      estimated: true,
    });
  });

  test('session, open and ended', () => {
    expect(sessionFromRow(sessionToRow(session))).toEqual(session);
    const ended = { ...session, ended_at: '2026-09-24T06:00:00.000Z' };
    expect(sessionFromRow(sessionToRow(ended))).toEqual(ended);
  });

  test('position, live and deleted', () => {
    expect(positionFromRow(positionToRow(position))).toEqual(position);
    const deleted: PracticePosition = {
      ...position,
      deleted_hlc: { millis: 1727190000500, counter: 0, device_id: DEVICE },
      deleted_at: '2026-09-24T06:00:00.500Z',
    };
    expect(positionFromRow(positionToRow(deleted))).toEqual(deleted);
  });
});

describe('the row forms', () => {
  test('a count event row stores estimated as 0 or 1', () => {
    expect(countEventToRow(event).estimated).toBe(0);
    expect(countEventToRow({ ...event, estimated: true }).estimated).toBe(1);
  });

  test('a position row stores marks as hex and clocks as text', () => {
    const row = positionToRow(position);

    expect(row.chanted_steps).toBe('1100000000000000000000000000');
    expect(row.hlc).toBe(`001727190000000:0000000001:${DEVICE}`);
    expect(row.deleted_hlc).toBeNull();
  });
});

describe('timestamps from the database', () => {
  test.each([
    ['2026-09-24 05:30:00.000Z', '2026-09-24T05:30:00.000Z'], // PowerSync's form
    ['2026-09-24 05:30:00Z', '2026-09-24T05:30:00.000Z'],
    ['2026-09-24 05:30:00.123456Z', '2026-09-24T05:30:00.123Z'], // microseconds
    ['2026-09-24T05:30:00+00:00', '2026-09-24T05:30:00.000Z'], // PostgREST's form
    ['2026-09-24T11:00:00.5+05:30', '2026-09-24T05:30:00.500Z'],
  ])('%s becomes %s', (stored, iso) => {
    expect(sessionFromRow({ ...sessionToRow(session), started_at: stored }).started_at).toBe(iso);
  });

  test.each([
    '2026-09-24',
    '24/09/2026 05:30',
    '2026-09-24T05:30:00',
    'soon',
    // Shaped right, but not a real time: Date would roll these forward.
    '2026-02-30 00:00:00.000Z',
    '2025-02-29 00:00:00Z',
    '2026-09-24 24:00:00Z',
    '2026-09-24 05:60:00Z',
    '2026-09-24 05:30:60Z',
    '2026-13-01 00:00:00Z',
  ])('rejects %s', (stored) => {
    expect(() => sessionFromRow({ ...sessionToRow(session), started_at: stored })).toThrow();
  });
});

describe('fromRow rejects what the database should never hold', () => {
  test('a missing field', () => {
    const row: Partial<CountEventRow> = countEventToRow(event);
    delete row.device_id;

    expect(() => countEventFromRow(row)).toThrow();
  });

  test('a wrong type', () => {
    expect(() => countEventFromRow({ ...countEventToRow(event), count: '108' })).toThrow();
    expect(() => sessionFromRow({ ...sessionToRow(session), practice_version: 1.5 })).toThrow();
  });

  test('estimated other than 0 or 1', () => {
    for (const estimated of [2, true, null]) {
      expect(() => countEventFromRow({ ...countEventToRow(event), estimated })).toThrow();
    }
  });

  test('a mode that is not a chant mode', () => {
    expect(() => countEventFromRow({ ...countEventToRow(event), mode: 'shouting' })).toThrow();
  });

  test('a local_day that is not a real YYYY-MM-DD date', () => {
    for (const local_day of [
      '24-09-2026',
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '2026-09-00',
    ]) {
      expect(
        () => countEventFromRow({ ...countEventToRow(event), local_day }),
        local_day,
      ).toThrow();
    }
  });

  test('a leap day is a real date', () => {
    const leap = { ...event, local_day: '2024-02-29', created_at: '2024-02-29T12:00:00.000Z' };

    expect(countEventFromRow(countEventToRow(leap))).toEqual(leap);
  });

  test('fields longer than the server allows', () => {
    // The server drops or refuses these, so the device must never write them.
    expect(() =>
      countEventFromRow({ ...countEventToRow(event), practice_id: 'p'.repeat(129) }),
    ).toThrow();
    expect(() =>
      countEventFromRow({ ...countEventToRow(event), device_id: 'd'.repeat(65) }),
    ).toThrow();
    expect(() => sessionFromRow({ ...sessionToRow(session), device_id: 'd'.repeat(65) })).toThrow();
    expect(() =>
      positionFromRow({ ...positionToRow(position), chanted_steps: 'ff'.repeat(513) }),
    ).toThrow();
    expect(
      positionFromRow({ ...positionToRow(position), chanted_steps: '00'.repeat(512) })
        .chanted_steps,
    ).toHaveLength(512);
  });

  test('malformed marks or clocks', () => {
    const row = positionToRow(position);

    expect(() => positionFromRow({ ...row, chanted_steps: 'ZZ' })).toThrow();
    expect(() => positionFromRow({ ...row, hlc: '1:2:a' })).toThrow();
    expect(() => positionFromRow({ ...row, deleted_hlc: 'soon' })).toThrow();
  });

  test('not an object', () => {
    expect(() => positionFromRow(null)).toThrow();
    expect(() => positionFromRow('row')).toThrow();
  });
});

describe('toServerRow', () => {
  test('turns estimated into a boolean for Postgres', () => {
    expect(toServerRow('count_events', countEventToRow(event)).estimated).toBe(false);
    expect(
      toServerRow('count_events', countEventToRow({ ...event, estimated: true })).estimated,
    ).toBe(true);
  });

  test("leaves the other tables' rows unchanged", () => {
    expect(toServerRow('sessions', sessionToRow(session))).toEqual(sessionToRow(session));
    expect(toServerRow('practice_positions', positionToRow(position))).toEqual(
      positionToRow(position),
    );
  });

  test('does not mutate the row it is given', () => {
    const row = countEventToRow(event);

    toServerRow('count_events', row);

    expect(row.estimated).toBe(0);
  });
});

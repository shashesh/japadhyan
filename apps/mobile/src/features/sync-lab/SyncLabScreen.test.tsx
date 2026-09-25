import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type * as ReactModule from 'react';
import {
  countEventToRow,
  createMarks,
  markStep,
  positionToRow,
  type CountEvent,
} from '@japadhyan/shared';

import { ConsentRequired } from '@/data/powersync/signIn';

import { LAB_MANTRA, LAB_NAMAVALI, LAB_NAMAVALI_STEPS, type SyncLab } from './lab';
import { SyncLabScreen } from './SyncLabScreen';

jest.mock('@powersync/react-native', () => ({ PowerSyncDatabase: jest.fn() }));

/**
 * A stand-in for the database behind `useQuery`: rows per table, and a
 * version that re-renders every watcher when a row is added, as PowerSync's
 * watched queries do. `mock` names are what jest.mock's factory may reach.
 */
const mockTables = {
  rows: {} as Record<string, Record<string, unknown>[]>,
  version: 0,
  listeners: new Set<() => void>(),
  status: { connected: false, connecting: false, lastSyncedAt: undefined as Date | undefined },
};

jest.mock('@powersync/react', () => {
  const React: typeof ReactModule = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockTables.listeners.add(listener);
    return () => mockTables.listeners.delete(listener);
  };
  return {
    PowerSyncContext: React.createContext(null),
    useStatus: () => mockTables.status,
    useQuery: (sql: string, parameters: unknown[] = []) => {
      React.useSyncExternalStore(subscribe, () => mockTables.version);
      const table = /FROM (\w+)/.exec(sql)![1]!;
      const rows = (mockTables.rows[table] ?? []).filter(
        (row) => parameters.length === 0 || row.practice_id === parameters[0],
      );
      return { data: /count\(\*\)/.test(sql) ? [{ n: rows.length }] : rows, isLoading: false };
    },
  };
});

const OWNER = '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79';
const DEVICE = '0192a4b1-0000-7000-8000-000000000001';

function addRow(table: string, row: Record<string, unknown>): void {
  mockTables.rows[table] = [...(mockTables.rows[table] ?? []), row];
  mockTables.version += 1;
  mockTables.listeners.forEach((listener) => listener());
}

function countEvent(count: number): Record<string, unknown> {
  const event: CountEvent = {
    id: `0192a4b2-0000-7000-8000-00000000000${(mockTables.rows.count_events ?? []).length}`,
    user_id: OWNER,
    practice_id: LAB_MANTRA,
    session_id: '0192a4b3-0000-7000-8000-000000000001',
    mode: 'mala_tap',
    count,
    estimated: false,
    device_id: DEVICE,
    created_at: '2026-09-25T05:30:00.000Z',
    local_day: '2026-09-25',
    tz_offset_min: 0,
    steps_per_repetition: 1,
  };
  return { ...countEventToRow(event) };
}

function fakeLab(): jest.Mocked<SyncLab> {
  return {
    db: {} as SyncLab['db'],
    chant: jest.fn(async (count: number) => addRow('count_events', countEvent(count))),
    markNextName: jest.fn(() => Promise.resolve()),
    finishPass: jest.fn(() => Promise.resolve()),
    goOffline: jest.fn(() => Promise.resolve()),
    goOnline: jest.fn(() => Promise.resolve()),
    signIn: jest.fn<Promise<void>, Parameters<SyncLab['signIn']>>(() => Promise.resolve()),
    clearSynced: jest.fn(() => Promise.resolve()),
    uploadQueueSize: jest.fn(() => Promise.resolve(0)),
  };
}

async function renderOpened(lab: SyncLab): Promise<void> {
  await render(<SyncLabScreen open={() => Promise.resolve(lab)} />);
  await screen.findByTestId('total');
}

beforeEach(() => {
  mockTables.rows = {
    device_state: [{ owner_id: OWNER, device_id: DEVICE, mode: 'guest' }],
  };
  mockTables.version = 0;
});

describe('SyncLabScreen', () => {
  it('shows a placeholder until the database is open', async () => {
    await render(<SyncLabScreen open={() => new Promise<SyncLab>(() => {})} />);
    expect(screen.getByText('Opening the database…')).toBeOnTheScreen();
  });

  it('says why when the database does not open', async () => {
    const open = () => Promise.reject(new Error('EXPO_PUBLIC_SUPABASE_URL not set'));
    await render(<SyncLabScreen open={open} />);
    expect(await screen.findByText(/EXPO_PUBLIC_SUPABASE_URL not set/)).toBeOnTheScreen();
  });

  it('shows the mode and the device', async () => {
    await renderOpened(fakeLab());
    expect(screen.getByText('Guest')).toBeOnTheScreen();
    expect(screen.getByText(OWNER)).toBeOnTheScreen();
    expect(screen.getByText(DEVICE)).toBeOnTheScreen();
  });

  it('chants, and the live total follows each new row', async () => {
    const lab = fakeLab();
    await renderOpened(lab);
    expect(screen.getByTestId('total')).toHaveTextContent('0');

    await fireEvent.press(screen.getByText('+1 japa'));
    await fireEvent.press(screen.getByText('+108'));

    expect(lab.chant.mock.calls).toEqual([[1], [108]]);
    expect(screen.getByTestId('total')).toHaveTextContent('109');
  });

  it('shows the namavali’s marks and pass', async () => {
    await renderOpened(fakeLab());
    const marks = [0, 1, 5].reduce(
      (m, i) => markStep(m, i, LAB_NAMAVALI_STEPS),
      createMarks(LAB_NAMAVALI_STEPS),
    );
    await act(async () =>
      addRow('practice_positions', {
        ...positionToRow({
          id: '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
          user_id: OWNER,
          practice_id: LAB_NAMAVALI,
          practice_version: 1,
          step_index: 5,
          chanted_steps: marks,
          pass_ordinal: 2,
          hlc: { millis: 1, counter: 0, device_id: DEVICE },
          deleted_hlc: null,
          deleted_at: null,
        }),
      }),
    );
    expect(screen.getByText(`Pass 3 · 3 of ${LAB_NAMAVALI_STEPS} marked`)).toBeOnTheScreen();
  });

  it('each button calls its lab action', async () => {
    const lab = fakeLab();
    await renderOpened(lab);

    await fireEvent.press(screen.getByText('Mark next name'));
    await fireEvent.press(screen.getByText('Finish pass'));
    await fireEvent.press(screen.getByText('Go offline'));
    await fireEvent.press(screen.getByText('Go online'));
    await fireEvent.press(screen.getByText('Clear synced data'));

    expect(lab.markNextName).toHaveBeenCalledTimes(1);
    expect(lab.finishPass).toHaveBeenCalledTimes(1);
    expect(lab.goOffline).toHaveBeenCalledTimes(1);
    expect(lab.goOnline).toHaveBeenCalledTimes(1);
    expect(lab.clearSynced).toHaveBeenCalledTimes(1);
  });

  it('signs in with consent off by default, and shows the refusal', async () => {
    const lab = fakeLab();
    lab.signIn.mockRejectedValue(new ConsentRequired());
    await renderOpened(lab);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'devotee@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByText('Sign in'));

    expect(lab.signIn).toHaveBeenCalledWith(
      { email: 'devotee@example.test', password: 'secret' },
      false,
    );
    expect(await screen.findByText(/Consent is required/)).toBeOnTheScreen();
  });

  it('passes consent once the switch is on', async () => {
    const lab = fakeLab();
    await renderOpened(lab);

    await fireEvent(screen.getByLabelText('I consent to syncing'), 'valueChange', true);
    await fireEvent.press(screen.getByText('Sign in'));

    expect(lab.signIn).toHaveBeenCalledWith(expect.anything(), true);
  });
});

import type { DeviceState } from '@/data/powersync/deviceState';
import { signInAndCombine } from '@/data/powersync/signIn';

import { LAB_NAMAVALI_STEPS, openSyncLab } from './lab';

const ACCOUNT = '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79';
const OTHER_ACCOUNT = '0192a4b0-8c3e-7d4a-9b1f-000000000000';
const CREDENTIALS = { email: 'devotee@example.test', password: 'secret' };

/** The device and backend each test sets up; `mock` names are what jest.mock's factories may reach. */
const mockDevice = {
  state: null as DeviceState | null,
  db: {
    connect: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(() => Promise.resolve()),
  },
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
    },
  },
};

jest.mock('@powersync/react-native', () => ({ PowerSyncDatabase: jest.fn() }));
jest.mock('@/data/powersync/database', () => ({
  openDatabase: () => Promise.resolve(mockDevice.db),
}));
jest.mock('@/data/powersync/supabase', () => ({ getSupabase: () => mockDevice.supabase }));
jest.mock('@/data/powersync/config', () => ({
  syncConfig: () => ({ supabaseUrl: 'http://s', supabaseKey: 'k', powersyncUrl: 'http://p' }),
}));
jest.mock('@/data/powersync/deviceState', () => ({
  requireDeviceState: () => Promise.resolve(mockDevice.state),
}));
jest.mock('@/data/powersync/signIn', () => ({ signInAndCombine: jest.fn() }));

function device(mode: DeviceState['mode'], { session }: { session: boolean }): void {
  mockDevice.state = {
    owner_id: ACCOUNT,
    device_id: '0192a4b1-0000-7000-8000-000000000001',
    mode,
    clock_offset_ms: 0,
  };
  mockDevice.supabase.auth.getSession.mockResolvedValue({
    data: { session: session ? { access_token: 'token' } : null },
  });
}

beforeEach(() => jest.clearAllMocks());

describe('openSyncLab', () => {
  it('never connects a guest, even when told to go online', async () => {
    device('guest', { session: false });
    const lab = await openSyncLab();

    await expect(lab.goOnline()).rejects.toThrow(/guest never syncs/);
    expect(mockDevice.db.connect).not.toHaveBeenCalled();
  });

  it('reconnects a signed-in device that still has its session', async () => {
    device('signed_in', { session: true });
    await openSyncLab();
    expect(mockDevice.db.connect).toHaveBeenCalledTimes(1);
  });

  it('waits for sign-in on a signed-in device whose session is gone', async () => {
    device('signed_in', { session: false });
    const lab = await openSyncLab();

    expect(mockDevice.db.connect).not.toHaveBeenCalled();
    await expect(lab.goOnline()).rejects.toThrow(/sign in again/);
    expect(mockDevice.db.connect).not.toHaveBeenCalled();
  });

  it("combines a guest's practice with the account, passing consent on", async () => {
    device('guest', { session: false });
    const lab = await openSyncLab();

    await lab.signIn(CREDENTIALS, false);

    expect(signInAndCombine).toHaveBeenCalledWith(
      mockDevice.db,
      mockDevice.supabase,
      CREDENTIALS,
      expect.objectContaining({ consented: false }),
    );
    const { stepCount } = (signInAndCombine as jest.Mock).mock.calls[0][3];
    expect(stepCount('sync-lab-namavali', 1)).toBe(LAB_NAMAVALI_STEPS);
    expect(mockDevice.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs a signed-in device back in to its own account, then connects', async () => {
    device('signed_in', { session: false });
    mockDevice.supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: ACCOUNT } },
      error: null,
    });
    const lab = await openSyncLab();
    mockDevice.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token' } },
    });

    await lab.signIn(CREDENTIALS, true);

    expect(signInAndCombine).not.toHaveBeenCalled();
    expect(mockDevice.db.connect).toHaveBeenCalledTimes(1);
  });

  it('refuses to sign a signed-in device in to another account', async () => {
    device('signed_in', { session: false });
    mockDevice.supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: OTHER_ACCOUNT } },
      error: null,
    });
    const lab = await openSyncLab();

    await expect(lab.signIn(CREDENTIALS, true)).rejects.toThrow(/another account/);
    expect(mockDevice.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockDevice.db.connect).not.toHaveBeenCalled();
  });
});

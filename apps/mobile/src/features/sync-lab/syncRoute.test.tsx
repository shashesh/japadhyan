import { render, screen } from '@testing-library/react-native';

import SyncLabRoute from '@/app/dev/sync';

import { isSyncLabEnabled } from './enabled';
import { openSyncLab } from './lab';

jest.mock('@powersync/react-native', () => ({ PowerSyncDatabase: jest.fn() }));
jest.mock('./lab', () => ({
  ...jest.requireActual('./lab'),
  openSyncLab: jest.fn(() => new Promise(() => {})),
}));

describe('the dev route', () => {
  it('renders a placeholder while the database opens', async () => {
    await render(<SyncLabRoute />);
    expect(screen.getByText('Opening the database…')).toBeOnTheScreen();
    expect(openSyncLab).toHaveBeenCalledTimes(1);
  });
});

describe('isSyncLabEnabled', () => {
  it('is on in development builds, and in a build that asks for it', () => {
    expect(isSyncLabEnabled(true, undefined)).toBe(true);
    expect(isSyncLabEnabled(false, 'true')).toBe(true);
  });

  it('is off in any other production build', () => {
    expect(isSyncLabEnabled(false, undefined)).toBe(false);
    expect(isSyncLabEnabled(false, '1')).toBe(false);
  });
});

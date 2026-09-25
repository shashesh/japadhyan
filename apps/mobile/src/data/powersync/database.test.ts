import { PowerSyncDatabase } from '@powersync/react-native';

import { openDatabase } from './database';

jest.mock('@powersync/react-native', () => ({ PowerSyncDatabase: jest.fn() }));

const MockDatabase = PowerSyncDatabase as unknown as jest.Mock;

/** Enough of a database for `prepareDevice` on a first launch. */
function fakeDatabase({ initFails = false } = {}) {
  return {
    init: jest.fn(() => (initFails ? Promise.reject(new Error('disk full')) : Promise.resolve())),
    close: jest.fn(() => Promise.resolve()),
    getOptional: jest.fn(() => Promise.resolve(null)),
    execute: jest.fn(() => Promise.resolve({})),
    updateSchema: jest.fn(() => Promise.resolve()),
  };
}

// One module for the file, as in the app: the tests run in order.
describe('openDatabase', () => {
  it('opens nothing when the module is imported', () => {
    // Static rendering imports every route's modules in Node; only a call opens.
    expect(MockDatabase).not.toHaveBeenCalled();
  });

  it('closes what it opened when opening fails, and tries again on the next call', async () => {
    const broken = fakeDatabase({ initFails: true });
    MockDatabase.mockImplementationOnce(() => broken);

    await expect(openDatabase()).rejects.toThrow('disk full');
    expect(broken.close).toHaveBeenCalled();
  });

  it('then opens one database however many callers ask, and sets up a guest', async () => {
    const fake = fakeDatabase();
    MockDatabase.mockImplementation(() => fake);

    const [a, b] = await Promise.all([openDatabase(), openDatabase()]);

    expect(a).toBe(fake);
    expect(b).toBe(fake);
    expect(await openDatabase()).toBe(fake);
    expect(MockDatabase).toHaveBeenCalledTimes(2);
    expect(fake.init).toHaveBeenCalledTimes(1);
    expect(fake.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_state'),
      expect.arrayContaining(['guest']),
    );
  });
});

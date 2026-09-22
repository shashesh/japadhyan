import { uuidv7 } from '@japadhyan/shared';
import { newId } from './id';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Global = { crypto?: unknown };

describe('newId', () => {
  it('makes a version 7 UUID', () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 200 }, newId));

    expect(ids.size).toBe(200);
  });

  it('sorts by time, so ids made later sort after ids made earlier', async () => {
    const early = newId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const late = newId();

    expect(early < late).toBe(true);
  });
});

/**
 * The test runner provides Web Crypto, but a bare native runtime does not.
 * Removing it here reproduces the device, where the shared package's own
 * fallback cannot work and only the injected native RNG can.
 */
describe('newId on a runtime without Web Crypto', () => {
  const realCrypto = (globalThis as Global).crypto;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  });

  it('still makes an id, because the app injects Expo’s native RNG', () => {
    expect(newId()).toMatch(UUID_V7);
  });

  it('is what saves it: the shared fallback alone would throw on the first tap', () => {
    expect(() => uuidv7()).toThrow(/random source/i);
  });
});

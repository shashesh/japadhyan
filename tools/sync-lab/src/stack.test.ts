/**
 * What a Cloud run needs before anything connects. No stack needed: nothing
 * connects.
 */

import { describe, expect, test } from 'vitest';

import { CLOUD_KEYS, assertCloudEnv } from './stack';

const complete = {
  SYNC_LAB_SUPABASE_URL: 'https://ref.supabase.co',
  SYNC_LAB_PUBLISHABLE_KEY: 'sb_publishable_x',
  SYNC_LAB_SECRET_KEY: 'sb_secret_y',
  SYNC_LAB_POWERSYNC_URL: 'https://instance.powersync.journeyapps.com',
};

describe('assertCloudEnv', () => {
  test('accepts an environment with every hosted value', () => {
    expect(() => assertCloudEnv(complete)).not.toThrow();
  });

  test.each(CLOUD_KEYS)('refuses to fall back to the local stack without %s', (key) => {
    const env = { ...complete, [key]: undefined };
    expect(() => assertCloudEnv(env)).toThrow(key);
  });

  test('treats an empty value as missing', () => {
    expect(() => assertCloudEnv({ ...complete, SYNC_LAB_POWERSYNC_URL: '' })).toThrow(
      'SYNC_LAB_POWERSYNC_URL',
    );
  });

  test('names the missing keys and never echoes a value', () => {
    let message = '';
    try {
      assertCloudEnv({ ...complete, SYNC_LAB_SUPABASE_URL: undefined });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SYNC_LAB_SUPABASE_URL/);
    expect(message).not.toMatch(/sb_secret_y|sb_publishable_x/);
  });
});

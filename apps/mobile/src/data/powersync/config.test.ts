import { parseSyncConfig } from './config';

const LOCAL = {
  EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  EXPO_PUBLIC_SUPABASE_KEY: 'sb_publishable_local',
  EXPO_PUBLIC_POWERSYNC_URL: 'http://localhost:54340',
};

describe('parseSyncConfig', () => {
  it('reads the backend from the environment', () => {
    expect(parseSyncConfig(LOCAL, 'ios')).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseKey: 'sb_publishable_local',
      powersyncUrl: 'http://localhost:54340',
    });
  });

  it('points the Android emulator at the host, which it reaches as 10.0.2.2', () => {
    expect(parseSyncConfig(LOCAL, 'android')).toMatchObject({
      supabaseUrl: 'http://10.0.2.2:54321',
      powersyncUrl: 'http://10.0.2.2:54340',
    });
  });

  it('leaves a hosted backend alone on Android', () => {
    const hosted = {
      ...LOCAL,
      EXPO_PUBLIC_SUPABASE_URL: 'https://localhost-ref.supabase.co',
      EXPO_PUBLIC_POWERSYNC_URL: 'https://instance.powersync.journeyapps.com',
    };
    expect(parseSyncConfig(hosted, 'android')).toMatchObject({
      supabaseUrl: 'https://localhost-ref.supabase.co',
      powersyncUrl: 'https://instance.powersync.journeyapps.com',
    });
  });

  it('names every missing variable', () => {
    expect(() => parseSyncConfig({ EXPO_PUBLIC_SUPABASE_KEY: 'key' }, 'web')).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_POWERSYNC_URL/,
    );
  });
});

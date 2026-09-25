/**
 * Where the device's backend is: Supabase for sign-in and uploads, PowerSync
 * for downloads. Read from `EXPO_PUBLIC_*` variables, which Expo inlines at
 * build time; `npm run sync:app-env` writes them for the local stack into
 * apps/mobile/.env.local. The Supabase key is the publishable one, which is
 * meant to ship in the app.
 */

import { Platform } from 'react-native';

export interface SyncConfig {
  supabaseUrl: string;
  /** Supabase's publishable key. */
  supabaseKey: string;
  powersyncUrl: string;
}

const VARIABLES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_KEY',
  'EXPO_PUBLIC_POWERSYNC_URL',
] as const;

type SyncEnv = Partial<Record<(typeof VARIABLES)[number], string>>;

/** The Android emulator reaches the host's loopback as 10.0.2.2. */
const LOOPBACK_HOST = /^(https?:\/\/)(localhost|127\.0\.0\.1)(?=[:/]|$)/;
const ANDROID_EMULATOR_HOST = '10.0.2.2';

function forPlatform(url: string, os: string): string {
  return os === 'android' ? url.replace(LOOPBACK_HOST, `$1${ANDROID_EMULATOR_HOST}`) : url;
}

export function parseSyncConfig(env: SyncEnv, os: string): SyncConfig {
  const missing = VARIABLES.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(', ')} not set. For the local stack, run \`npm run sync:app-env\`.`,
    );
  }
  return {
    supabaseUrl: forPlatform(env.EXPO_PUBLIC_SUPABASE_URL!, os),
    supabaseKey: env.EXPO_PUBLIC_SUPABASE_KEY!,
    powersyncUrl: forPlatform(env.EXPO_PUBLIC_POWERSYNC_URL!, os),
  };
}

export function syncConfig(): SyncConfig {
  // Each variable is named in full: Expo inlines only `process.env.EXPO_PUBLIC_…` as written.
  return parseSyncConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY,
      EXPO_PUBLIC_POWERSYNC_URL: process.env.EXPO_PUBLIC_POWERSYNC_URL,
    },
    Platform.OS,
  );
}

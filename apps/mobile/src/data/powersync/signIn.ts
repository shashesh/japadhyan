import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  SyncOptions,
} from '@powersync/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignInOptions {
  consented: boolean;
  connector: PowerSyncBackendConnector;
  /** The step count of a practice at a version, for merging positions. */
  stepCount: (practiceId: string, version: number) => number;
  downloadTimeoutMs?: number;
  syncOptions?: SyncOptions;
}

/** Task 11 of the S4 plan implements this. */
export async function signInAndCombine(
  ...args: [CommonPowerSyncDatabase, SupabaseClient, SignInCredentials, SignInOptions]
): Promise<void> {
  void args;
  throw new Error('Not implemented yet');
}

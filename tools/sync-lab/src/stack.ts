/**
 * The local stack the devices run against (`npm run sync:up`): Supabase from
 * its CLI, PowerSync from powersync/docker-compose.yaml.
 *
 * Keys are read from `supabase status`, never written down: they are the
 * local stack's throwaway defaults, but the same code runs against the
 * hosted stack in PR 5, through environment variables.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const projectRoot = join(import.meta.dirname, '..', '..', '..');
const SUPABASE_CLI = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');
const COMPOSE = ['compose', '-f', join(projectRoot, 'powersync', 'docker-compose.yaml')];

/**
 * The hosted stack (PowerSync Cloud and a Supabase project) instead of the
 * local one: `npm run sync:test:cloud`, with tools/sync-lab/.env.cloud.local.
 */
export const ON_CLOUD = process.env.SYNC_LAB_TARGET === 'cloud';

/** Where powersync/docker-compose.yaml publishes the service. */
export const POWERSYNC_URL = process.env.SYNC_LAB_POWERSYNC_URL ?? 'http://127.0.0.1:54340';

export interface SupabaseEnv {
  url: string;
  /** For signing in, as the app does. */
  publishableKey: string;
  /** For creating and deleting test users only. */
  secretKey: string;
}

let cached: SupabaseEnv | undefined;

export function supabaseEnv(): SupabaseEnv {
  if (cached) return cached;
  const { SYNC_LAB_SUPABASE_URL, SYNC_LAB_PUBLISHABLE_KEY, SYNC_LAB_SECRET_KEY } = process.env;
  if (SYNC_LAB_SUPABASE_URL && SYNC_LAB_PUBLISHABLE_KEY && SYNC_LAB_SECRET_KEY) {
    cached = {
      url: SYNC_LAB_SUPABASE_URL,
      publishableKey: SYNC_LAB_PUBLISHABLE_KEY,
      secretKey: SYNC_LAB_SECRET_KEY,
    };
    return cached;
  }

  const output = execFileSync(process.execPath, [SUPABASE_CLI, 'status', '-o', 'env'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values = new Map(
    output
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?\s*$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1]!, match[2]!] as const),
  );
  const need = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`\`supabase status\` gave no ${key}. Run \`npm run sync:up\`.`);
    return value;
  };
  cached = {
    url: need('API_URL'),
    publishableKey: need('PUBLISHABLE_KEY'),
    secretKey: need('SECRET_KEY'),
  };
  return cached;
}

/** A client that keeps nothing between runs and never refreshes on its own. */
export function newSupabaseClient(key: 'publishable' | 'secret' = 'publishable'): SupabaseClient {
  const env = supabaseEnv();
  return createClient(env.url, key === 'secret' ? env.secretKey : env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function docker(...args: string[]): void {
  const result = spawnSync('docker', [...COMPOSE, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr}`);
  }
}

export function stopPowerSync(): void {
  docker('stop', 'powersync');
}

/** Starts the service again and waits until it answers and replicates, as `sync:up` does. */
export async function startPowerSync(timeoutMs = 60_000): Promise<void> {
  docker('start', 'powersync');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const check = spawnSync(
      process.execPath,
      [join(projectRoot, 'scripts', 'sync-stack.mjs'), 'check'],
      {
        cwd: projectRoot,
        stdio: 'ignore',
      },
    );
    if (check.status === 0) return;
    if (Date.now() > deadline) throw new Error('PowerSync did not come back up');
    await sleep(500);
  }
}

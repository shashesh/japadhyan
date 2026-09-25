/**
 * Headless devices for the sync tests: each is a `@powersync/node` database
 * with its own file, the app's own connector, and its own clock, all in one
 * process, against the local stack. `goOffline` disconnects; writes queue
 * locally until `goOnline`.
 *
 * See docs/plans/active/2026-09-24-s4-sync-prototype.md, Task 9.
 */

import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  countEventFromRow,
  positionFromRow,
  totalCount,
  uuidv7,
  type CountEvent,
  type PracticePosition,
} from '@japadhyan/shared';
import {
  createConsoleLogger,
  LogLevels,
  PowerSyncDatabase,
  type PowerSyncBackendConnector,
  type SyncOptions,
} from '@powersync/node';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createDeviceState,
  makeSchema,
  requireDeviceState,
  signInAndCombine,
  SupabaseConnector,
  type SyncMode,
} from './client';
import * as practice from './practice';
import { newSupabaseClient, POWERSYNC_URL } from './stack';

/** Every namavali in the lab has 12 steps. */
export const NAMAVALI_STEPS = 12;

const SYNC_OPTIONS: SyncOptions = { crudUploadThrottleMs: 10, retryDelayMs: 250 };
const WAIT_TIMEOUT_MS = 20_000;
const WAIT_INTERVAL_MS = 25;

export interface TestUser {
  email: string;
  password: string;
  user_id: string;
}

export interface DeviceOptions {
  /** Added to Date.now() for this device's wall clock; default 0. */
  clockSkewMs?: number;
}

export interface UploadFailure {
  table_name: string;
  op: string;
  row_id: string;
  error_code: string;
  payload: Record<string, unknown>;
}

export interface Device {
  readonly name: string;
  readonly db: PowerSyncDatabase;
  readonly connector: SupabaseConnector;
  /** disconnect() */
  goOffline(): Promise<void>;
  /** connect(), then wait for an empty upload queue and a checkpoint after it. */
  goOnline(): Promise<void>;
  /** Writes a session if none is open, and a sealed event. Negative: a correction. */
  chant(practiceId: string, count: number): Promise<CountEvent>;
  endSession(practiceId: string): Promise<void>;
  markStep(practiceId: string, stepIndex: number, stepCount: number): Promise<void>;
  /** One write transaction: the recitation's event and the reset. */
  finishPass(practiceId: string, stepCount: number): Promise<void>;
  deletePosition(practiceId: string): Promise<void>;
  /** totalCount over the local count_events. */
  total(practiceId: string): Promise<number>;
  position(practiceId: string): Promise<PracticePosition | null>;
  uploadFailures(): Promise<UploadFailure[]>;
  /** The wall clock jumps, as when the devotee changes the time offline. */
  setClockSkew(ms: number): void;
}

export interface GuestDevice extends Device {
  /** Calls signInAndCombine; consented defaults to true. */
  signIn(
    user: TestUser,
    options?: { consented?: boolean; downloadTimeoutMs?: number },
  ): Promise<void>;
}

const openDevices = new Set<LabDevice>();
const testUsers = new Set<string>();
const serverClients = new Map<string, SupabaseClient>();

/** Polls until `predicate` holds, or fails naming what it waited for. */
export async function waitFor(
  what: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

class LabDevice implements GuestDevice {
  readonly connector: SupabaseConnector;
  private skewMs: number;
  private uploadsInFlight = 0;
  private lastUploadAt = 0;
  /** What PowerSync is given: the connector, noting when an upload finished. */
  private readonly backend: PowerSyncBackendConnector;

  constructor(
    readonly name: string,
    readonly db: PowerSyncDatabase,
    readonly supabase: SupabaseClient,
    private readonly dir: string,
    options: DeviceOptions,
  ) {
    this.skewMs = options.clockSkewMs ?? 0;
    this.connector = new SupabaseConnector({
      db,
      supabase,
      powersyncUrl: POWERSYNC_URL,
      now: () => this.now(),
    });
    this.backend = {
      fetchCredentials: () => this.connector.fetchCredentials(),
      uploadData: async (database) => {
        this.uploadsInFlight += 1;
        try {
          const queued = (await database.getUploadQueueStats()).count;
          await this.connector.uploadData(database);
          if (queued > 0) this.lastUploadAt = Date.now();
        } finally {
          this.uploadsInFlight -= 1;
        }
      },
    };
  }

  now(): number {
    return Date.now() + this.skewMs;
  }

  setClockSkew(ms: number): void {
    this.skewMs = ms;
  }

  async goOffline(): Promise<void> {
    await this.db.disconnect();
  }

  async goOnline(): Promise<void> {
    const state = await requireDeviceState(this.db);
    if (state.mode === 'guest') throw new Error(`${this.name} is a guest, and a guest never syncs`);
    const connectedAt = Date.now();
    await this.db.connect(this.backend, SYNC_OPTIONS);
    await this.waitUntilCaughtUp(connectedAt);
  }

  /**
   * The upload queue is empty and nothing is uploading, then a checkpoint has
   * been applied since both the connect and the last upload: the server's
   * merge of what this device sent is now in its tables.
   */
  private async waitUntilCaughtUp(connectedAt: number): Promise<void> {
    await waitFor(`${this.name} to upload (${this.uploadError()})`, async () => {
      const queued = (await this.db.getUploadQueueStats()).count;
      return queued === 0 && this.uploadsInFlight === 0;
    });
    const barrier = Math.max(connectedAt, this.lastUploadAt);
    await waitFor(
      `${this.name} to apply a checkpoint (${this.db.currentStatus.getMessage()})`,
      () => (this.db.currentStatus.lastSyncedAt?.getTime() ?? 0) >= barrier,
    );
  }

  private uploadError(): string {
    return this.db.currentStatus.uploadError?.message ?? 'no upload error';
  }

  private async write<T>(action: (ctx: practice.WriteContext) => Promise<T>): Promise<T> {
    return this.db.writeTransaction(async (tx) =>
      action({ tx, state: await requireDeviceState(tx), nowMs: this.now() }),
    );
  }

  chant(practiceId: string, count: number): Promise<CountEvent> {
    return this.write((ctx) => practice.chant(ctx, practiceId, count));
  }

  endSession(practiceId: string): Promise<void> {
    return this.write((ctx) => practice.endSession(ctx, practiceId));
  }

  async markStep(practiceId: string, stepIndex: number, stepCount: number): Promise<void> {
    await this.write((ctx) => practice.markStep(ctx, practiceId, stepIndex, stepCount));
  }

  async finishPass(practiceId: string, stepCount: number): Promise<void> {
    await this.write((ctx) => practice.finishPass(ctx, practiceId, stepCount));
  }

  deletePosition(practiceId: string): Promise<void> {
    return this.write((ctx) => practice.deletePosition(ctx, practiceId));
  }

  async total(practiceId: string): Promise<number> {
    return totalCount(await practice.readEvents(this.db, practiceId));
  }

  position(practiceId: string): Promise<PracticePosition | null> {
    return practice.readPosition(this.db, practiceId);
  }

  async uploadFailures(): Promise<UploadFailure[]> {
    const rows = await this.db.getAll<Omit<UploadFailure, 'payload'> & { payload: string }>(
      'SELECT table_name, op, row_id, error_code, payload FROM upload_failures ORDER BY failed_at',
    );
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  }

  signIn(
    user: TestUser,
    {
      consented = true,
      downloadTimeoutMs,
    }: { consented?: boolean; downloadTimeoutMs?: number } = {},
  ): Promise<void> {
    return signInAndCombine(
      this.db,
      this.supabase,
      { email: user.email, password: user.password },
      {
        consented,
        connector: this.backend,
        stepCount: () => NAMAVALI_STEPS,
        downloadTimeoutMs,
        syncOptions: SYNC_OPTIONS,
      },
    );
  }

  async close(): Promise<void> {
    await this.db.close();
    rmSync(this.dir, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function openDevice(
  name: string,
  mode: SyncMode,
  ownerId: string,
  supabase: SupabaseClient,
  options: DeviceOptions,
): Promise<LabDevice> {
  const dir = mkdtempSync(join(tmpdir(), 'japadhyan-sync-lab-'));
  const db = new PowerSyncDatabase({
    schema: makeSchema(mode),
    database: { dbFilename: `${name}.db`, dbLocation: dir },
    logger: createConsoleLogger({ prefix: `[${name}]`, minLevel: LogLevels.warn }),
  });
  await db.init();
  await createDeviceState(db, {
    owner_id: ownerId,
    device_id: `${name}-${randomUUID()}`,
    mode,
    clock_offset_ms: 0,
  });
  const device = new LabDevice(name, db, supabase, dir, options);
  openDevices.add(device);
  return device;
}

/** A confirmed user, made through the admin API. */
export async function createUser(): Promise<TestUser> {
  const email = `sync-lab-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await newSupabaseClient('secret').auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  testUsers.add(data.user.id);
  return { email, password, user_id: data.user.id };
}

async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const supabase = newSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return supabase;
}

/** Signed in, and never yet connected: it has downloaded nothing. */
export async function signedInDevice(
  user: TestUser,
  name: string,
  options: DeviceOptions = {},
): Promise<Device> {
  return openDevice(name, 'signed_in', user.user_id, await signedInClient(user), options);
}

/** A first launch: a local owner id, and no account. */
export async function guestDevice(name: string, options: DeviceOptions = {}): Promise<GuestDevice> {
  return openDevice(name, 'guest', uuidv7(), newSupabaseClient(), options);
}

/** As the user, through PostgREST, as a second opinion on what the devices hold. */
async function asUser(user: TestUser): Promise<SupabaseClient> {
  let client = serverClients.get(user.user_id);
  if (!client) {
    client = await signedInClient(user);
    serverClients.set(user.user_id, client);
  }
  return client;
}

export async function serverTotal(user: TestUser, practiceId: string): Promise<number> {
  const { data, error } = await (
    await asUser(user)
  )
    .from('count_events')
    .select('*')
    .eq('practice_id', practiceId);
  if (error) throw error;
  return totalCount(data.map(countEventFromRow));
}

export async function serverRowCount(
  user: TestUser,
  table: 'sessions' | 'count_events' | 'practice_positions',
): Promise<number> {
  const { count, error } = await (
    await asUser(user)
  )
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function serverPosition(
  user: TestUser,
  practiceId: string,
): Promise<PracticePosition | null> {
  const { data, error } = await (
    await asUser(user)
  )
    .from('practice_positions')
    .select('*')
    .eq('practice_id', practiceId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : positionFromRow(data);
}

/** The database's time, in milliseconds. */
export async function serverNow(user: TestUser): Promise<number> {
  const { data, error } = await (await asUser(user)).rpc('server_now');
  if (error) throw error;
  return Date.parse(data as string);
}

/** `merge_practice_position` as the user, for replaying a set-aside payload. */
export async function mergeAsUser(user: TestUser, row: Record<string, unknown>): Promise<void> {
  const { error } = await (await asUser(user)).rpc('merge_practice_position', { row });
  if (error) throw error;
}

/**
 * Brings every device level with the server: each uploads in turn, then each
 * reconnects, and the first checkpoint after a reconnect carries everything
 * the others uploaded.
 */
export async function syncAll(...devices: readonly Device[]): Promise<void> {
  for (const device of devices) await device.goOnline();
  for (const device of devices) await device.goOnline();
}

export async function closeAllDevices(): Promise<void> {
  const devices = [...openDevices];
  openDevices.clear();
  await Promise.all(devices.map((device) => device.close()));
}

/** Deleting a user deletes their rows too (on delete cascade). */
export async function deleteTestUsers(): Promise<void> {
  const admin = newSupabaseClient('secret');
  const ids = [...testUsers];
  testUsers.clear();
  serverClients.clear();
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}

/**
 * What the sync lab screen does to the device, the way the headless devices
 * in tools/sync-lab do it: the same writes, connector and sign-in. Its
 * practices are fixtures, never catalog content.
 *
 * See docs/plans/active/2026-09-24-s4-sync-prototype.md, Task 14.
 */

import type { CommonPowerSyncDatabase } from '@powersync/common';
import { getRandomBytes } from 'expo-crypto';
import { isPositionDeleted, isStepChanted, type PracticePosition } from '@japadhyan/shared';

import { syncConfig } from '@/data/powersync/config';
import { SupabaseConnector } from '@/data/powersync/connector';
import { openDatabase } from '@/data/powersync/database';
import { requireDeviceState } from '@/data/powersync/deviceState';
import * as practice from '@/data/powersync/practice';
import { signInAndCombine, type SignInCredentials } from '@/data/powersync/signIn';
import { getSupabase } from '@/data/powersync/supabase';

/** A one-step practice, counted in repetitions. */
export const LAB_MANTRA = 'sync-lab-mantra';
/** A namavali of {@link LAB_NAMAVALI_STEPS} names, at version 1. */
export const LAB_NAMAVALI = 'sync-lab-namavali';
export const LAB_NAMAVALI_STEPS = 12;

export interface SyncLab {
  readonly db: CommonPowerSyncDatabase;
  /** Repetitions of the mantra, sealed as one event. */
  chant(count: number): Promise<void>;
  markNextName(): Promise<void>;
  /** Records the recitation and starts the next pass, in one transaction. */
  finishPass(): Promise<void>;
  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
  /**
   * A guest combines its practice with the account (signInAndCombine, which
   * refuses without consent). A signed-in device whose session was lost signs
   * back in to the same account.
   */
  signIn(credentials: SignInCredentials, consented: boolean): Promise<void>;
  /** `disconnectAndClear({ clearLocal: false })`: synced rows go, local-only tables stay. */
  clearSynced(): Promise<void>;
  uploadQueueSize(): Promise<number>;
}

/** The first name not yet marked on this pass. Once all are, the pass must be finished. */
export function nextUnmarkedStep(position: PracticePosition | null, stepCount: number): number {
  if (position === null || isPositionDeleted(position)) return 0;
  const next = [...Array(stepCount).keys()].find(
    (i) => !isStepChanted(position.chanted_steps, i, stepCount),
  );
  if (next === undefined) throw new Error('Every name is marked: finish the pass first');
  return next;
}

export async function openSyncLab(): Promise<SyncLab> {
  const db = await openDatabase();
  const supabase = getSupabase();
  const connector = new SupabaseConnector({
    db,
    supabase,
    powersyncUrl: syncConfig().powersyncUrl,
  });

  const write = <T>(action: (ctx: practice.WriteContext) => Promise<T>): Promise<T> =>
    practice.writePractice(db, { nowMs: Date.now(), randomBytes: getRandomBytes }, action);

  async function goOnline(): Promise<void> {
    const state = await requireDeviceState(db);
    if (state.mode === 'guest') throw new Error('A guest never syncs: sign in first');
    const { data } = await supabase.auth.getSession();
    if (data.session === null) throw new Error('No session on this device: sign in again');
    await db.connect(connector);
  }

  const lab: SyncLab = {
    db,
    async chant(count) {
      await write((ctx) => practice.chant(ctx, LAB_MANTRA, count));
    },
    async markNextName() {
      await write(async (ctx) => {
        const current = await practice.readPosition(ctx.tx, LAB_NAMAVALI);
        const step = nextUnmarkedStep(current, LAB_NAMAVALI_STEPS);
        await practice.markStep(ctx, LAB_NAMAVALI, step, LAB_NAMAVALI_STEPS);
      });
    },
    async finishPass() {
      await write((ctx) => practice.finishPass(ctx, LAB_NAMAVALI, LAB_NAMAVALI_STEPS));
    },
    goOffline: () => db.disconnect(),
    goOnline,
    async signIn(credentials, consented) {
      const state = await requireDeviceState(db);
      if (state.mode === 'guest') {
        await signInAndCombine(db, supabase, credentials, {
          consented,
          connector,
          stepCount: () => LAB_NAMAVALI_STEPS,
        });
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (data.user.id !== state.owner_id) {
        await supabase.auth.signOut({ scope: 'local' });
        throw new Error('This device belongs to another account');
      }
      await goOnline();
    },
    clearSynced: () => db.disconnectAndClear({ clearLocal: false }),
    async uploadQueueSize() {
      return (await db.getUploadQueueStats()).count;
    },
  };

  const state = await requireDeviceState(db);
  const { data } = await supabase.auth.getSession();
  if (state.mode === 'signed_in' && data.session !== null) await db.connect(connector);
  return lab;
}

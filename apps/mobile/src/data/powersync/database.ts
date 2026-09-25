/**
 * The device's one PowerSync database, opened on first use: never at module
 * scope. The web build renders every route in Node at export time (`web.output:
 * 'static'`), where there is no database to open, so only client code that
 * runs after mount calls {@link openDatabase}.
 */

import type { CommonPowerSyncDatabase } from '@powersync/common';

import { newId } from '@/lib/id';

import { prepareDevice } from './deviceState';
import { createPlatformDatabase } from './platformDatabase';
import { makeSchema } from './schema';

let opening: Promise<CommonPowerSyncDatabase> | null = null;

/** Opens the database once, set up as a guest on first launch; later calls share it. */
export function openDatabase(): Promise<CommonPowerSyncDatabase> {
  opening ??= open().catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function open(): Promise<CommonPowerSyncDatabase> {
  // The guest schema first: the mode is inside the database (prepareDevice).
  const db = createPlatformDatabase(makeSchema('guest'));
  try {
    await db.init();
    await prepareDevice(db, newId);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

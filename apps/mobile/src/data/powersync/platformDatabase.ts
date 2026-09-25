/**
 * The native database: SQLite through op-sqlite, PowerSync SDK 2's only
 * native driver and its default. `platformDatabase.web.ts` is the web one;
 * Metro picks by platform, and leaves the other SDK out of the bundle
 * (metro.config.js).
 */

import type { CommonPowerSyncDatabase, Schema } from '@powersync/common';
import { PowerSyncDatabase } from '@powersync/react-native';

export const DB_FILENAME = 'japadhyan.db';

export function createPlatformDatabase(schema: Schema): CommonPowerSyncDatabase {
  return new PowerSyncDatabase({ schema, database: { dbFilename: DB_FILENAME } });
}

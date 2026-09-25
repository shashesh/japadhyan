/**
 * The web database: SQLite compiled to WebAssembly, stored in the origin
 * private file system through `OPFSCoopSyncVFS`, which PowerSync recommends
 * for Safari. No COOP/COEP headers are needed; only an experimental mode
 * uses them.
 *
 * Metro's web build of the SDK needs both workers given explicitly: the
 * database's and the sync's. Both are the one file `npm run web:assets`
 * copies into public/.
 */

import type { CommonPowerSyncDatabase, Schema } from '@powersync/common';
import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';

export const DB_FILENAME = 'japadhyan.db';

const WORKER = '/@powersync/worker.js';

export function createPlatformDatabase(schema: Schema): CommonPowerSyncDatabase {
  return new PowerSyncDatabase({
    schema,
    database: { dbFilename: DB_FILENAME, vfs: WASQLiteVFS.OPFSCoopSyncVFS, worker: WORKER },
    sync: { worker: WORKER },
  });
}

import { Redirect } from 'expo-router';

import { isSyncLabEnabled } from '@/features/sync-lab/enabled';
import { SyncLabScreen } from '@/features/sync-lab/SyncLabScreen';

/** The S4 sync lab (docs/plans/active/2026-09-24-s4-sync-prototype.md). */
export default function SyncLabRoute() {
  return isSyncLabEnabled() ? <SyncLabScreen /> : <Redirect href="/" />;
}

import { defineConfig } from 'vitest/config';

import base from './vitest.config';

// `npm run sync:test:cloud`: the same tests against the hosted stack. The
// marker is set here, not in the gitignored env file, so it can't be missing.
export default defineConfig({
  test: {
    ...base.test,
    env: { SYNC_LAB_TARGET: 'cloud' },
  },
});

import { afterAll, afterEach } from 'vitest';

import { closeAllDevices, deleteTestUsers } from './harness';

afterEach(closeAllDevices);
afterAll(deleteTestUsers);

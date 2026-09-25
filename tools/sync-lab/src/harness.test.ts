import { expect, test } from 'vitest';

import { createUser, serverTotal, signedInDevice } from './harness';

const MANTRA = 'om-namah-shivaya';

test('a device can write offline and the row reaches the server when it reconnects', async () => {
  const user = await createUser();
  const device = await signedInDevice(user, 'a');

  await device.chant(MANTRA, 108);
  expect(await device.total(MANTRA)).toBe(108);
  expect(await serverTotal(user, MANTRA)).toBe(0);

  await device.goOnline();

  expect(await serverTotal(user, MANTRA)).toBe(108);
  expect(await device.total(MANTRA)).toBe(108);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cloudStack, HEADER, parseEnv, renderAppEnv } from './sync-app-env.mjs';

const VALUES = {
  supabaseUrl: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_local',
  powersyncUrl: 'http://127.0.0.1:54340',
  email: 'sync-lab@example.test',
  password: 'pw-1',
};

test('parseEnv reads KEY=value and KEY="value" lines, and skips the rest', () => {
  const status = [
    'Stopped services: [supabase_realtime_japadhyan]',
    'API_URL="http://127.0.0.1:54321"',
    'PUBLISHABLE_KEY=sb_publishable_local',
    '# a comment',
    '',
  ].join('\n');
  assert.deepEqual(
    parseEnv(status),
    new Map([
      ['API_URL', 'http://127.0.0.1:54321'],
      ['PUBLISHABLE_KEY', 'sb_publishable_local'],
    ]),
  );
});

test('the app env names the stack and the lab user, and no secret key', () => {
  const env = renderAppEnv(VALUES);
  assert.ok(env.startsWith(HEADER));
  assert.deepEqual(
    parseEnv(env),
    new Map([
      ['EXPO_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321'],
      ['EXPO_PUBLIC_SUPABASE_KEY', 'sb_publishable_local'],
      ['EXPO_PUBLIC_POWERSYNC_URL', 'http://127.0.0.1:54340'],
      ['EXPO_PUBLIC_SYNC_LAB_EMAIL', 'sync-lab@example.test'],
      ['EXPO_PUBLIC_SYNC_LAB_PASSWORD', 'pw-1'],
    ]),
  );
  assert.doesNotMatch(env, /sb_secret/);
});

test('--cloud reads the hosted stack from the sync lab’s cloud env file', () => {
  const text = [
    'SYNC_LAB_SUPABASE_URL=https://ref.supabase.co',
    'SYNC_LAB_PUBLISHABLE_KEY=sb_publishable_x',
    'SYNC_LAB_SECRET_KEY=sb_secret_y',
    'SYNC_LAB_POWERSYNC_URL=https://instance.powersync.journeyapps.com',
    'SYNC_LAB_TARGET=cloud',
  ].join('\n');
  assert.deepEqual(cloudStack(text), {
    supabaseUrl: 'https://ref.supabase.co',
    publishableKey: 'sb_publishable_x',
    secretKey: 'sb_secret_y',
    powersyncUrl: 'https://instance.powersync.journeyapps.com',
  });
});

test('a cloud env file missing a value names it, and never echoes the file', () => {
  assert.throws(
    () => cloudStack('SYNC_LAB_SECRET_KEY=sb_secret_y\n'),
    (error) => {
      assert.match(error.message, /SYNC_LAB_SUPABASE_URL/);
      assert.doesNotMatch(error.message, /sb_secret_y/);
      return true;
    },
  );
});

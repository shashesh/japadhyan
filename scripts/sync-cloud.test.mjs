import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cloudCommand, databasePassword } from './sync-cloud.mjs';

test('the password comes from PS_DATABASE_PASSWORD in the env file', () => {
  assert.equal(databasePassword('# local\nPS_DATABASE_PASSWORD=abc123\n'), 'abc123');
  assert.equal(databasePassword('PS_DATABASE_PASSWORD="abc123"\r\n'), 'abc123');
});

test('a missing or empty password is an error that never echoes the file', () => {
  assert.throws(
    () => databasePassword('OTHER=secret-value\n'),
    (error) => {
      assert.match(error.message, /PS_DATABASE_PASSWORD/);
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    },
  );
  assert.throws(() => databasePassword('PS_DATABASE_PASSWORD=\n'), /PS_DATABASE_PASSWORD/);
});

test("deploy sends the repo's one sync config, and status reads the linked instance", () => {
  assert.deepEqual(cloudCommand('deploy'), [
    'deploy',
    '--directory',
    'powersync/cloud',
    '--sync-config-file-path',
    'powersync/sync-config.yaml',
  ]);
  assert.deepEqual(cloudCommand('status'), ['status', '--directory', 'powersync/cloud']);
  // The CLI's --validate-only still deploys once the checks pass, so there is no dry run.
  assert.throws(() => cloudCommand('validate'), /deploy, status/);
  assert.throws(() => cloudCommand('destroy'), /deploy, status/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { POWERSYNC_URL, stackProblems, stepsFor } from './sync-stack.mjs';

const commands = (steps) => steps.map((step) => [step.command, ...step.args].join(' '));

test('up makes a signing key only when there is none, starts Supabase and PowerSync, then waits for replication', () => {
  const fresh = commands(stepsFor('up', { hasSigningKey: false }));
  const again = commands(stepsFor('up', { hasSigningKey: true }));

  assert.deepEqual(fresh, [
    'write-empty-signing-keys',
    'supabase gen signing-key --algorithm ES256 --append',
    'supabase start',
    'docker compose -f powersync/docker-compose.yaml up -d --wait',
    'wait-for-replication',
  ]);
  assert.deepEqual(again, fresh.slice(2));
});

test('down stops PowerSync before Supabase, whose network it joins', () => {
  assert.deepEqual(commands(stepsFor('down', { hasSigningKey: true })), [
    'docker compose -f powersync/docker-compose.yaml down',
    'supabase stop',
  ]);
});

test("reset drops PowerSync's bucket storage too, since the database it replicated is gone", () => {
  assert.deepEqual(commands(stepsFor('reset', { hasSigningKey: true })), [
    'docker compose -f powersync/docker-compose.yaml down -v',
    'supabase db reset',
    'docker compose -f powersync/docker-compose.yaml up -d --wait',
    'wait-for-replication',
  ]);
});

test('an unknown action is an error that names the known ones', () => {
  assert.throws(() => stepsFor('restart', { hasSigningKey: true }), /up, down, reset, check/);
});

test('PowerSync is on 54340 on the host, beside the Supabase ports', () => {
  assert.equal(POWERSYNC_URL, 'http://127.0.0.1:54340');
});

test('the stack is up only when Supabase runs, PowerSync answers and replication is active', () => {
  assert.deepEqual(stackProblems({ supabase: true, powersync: true, replicating: true }), []);
});

test('a live PowerSync without an active replication slot is not up', () => {
  // The liveness probe answers even when the service can't replicate.
  const problems = stackProblems({ supabase: true, powersync: true, replicating: false });

  assert.equal(problems.length, 1);
  assert.match(problems[0], /replication slot/);
});

test('each missing part is named', () => {
  assert.match(
    stackProblems({ supabase: false, powersync: true, replicating: false }).join(' '),
    /Supabase/,
  );
  assert.match(
    stackProblems({ supabase: true, powersync: false, replicating: false }).join(' '),
    /PowerSync/,
  );
  // Replication is only reported once both services run: it depends on them.
  assert.equal(stackProblems({ supabase: false, powersync: false, replicating: false }).length, 2);
});

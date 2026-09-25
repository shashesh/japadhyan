// The local sync stack: Supabase (through its CLI) and the self-hosted PowerSync
// service (powersync/docker-compose.yaml). See docs/guides/setup.md.
//
//   node scripts/sync-stack.mjs up      start both; makes the local signing key first if missing
//   node scripts/sync-stack.mjs down    stop both
//   node scripts/sync-stack.mjs reset   empty the database and PowerSync's storage, then start again
//   node scripts/sync-stack.mjs check   fail unless both are up and replicating (sync:test runs this first)
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = join(import.meta.dirname, '..');
const SIGNING_KEYS = join(projectRoot, 'supabase', 'signing_keys.json');
const COMPOSE = ['compose', '-f', 'powersync/docker-compose.yaml'];

export const POWERSYNC_URL = 'http://127.0.0.1:54340';
/** Supabase names its database container after `project_id` in supabase/config.toml. */
const DB_CONTAINER = 'supabase_db_japadhyan';
const REPLICATION_TIMEOUT_MS = 60_000;
const REPLICATION_POLL_MS = 1_000;

const step = (command, ...args) => ({ command, args });

/**
 * What an action runs, in order. `state.hasSigningKey`: whether
 * supabase/signing_keys.json exists (it is gitignored, so a fresh clone has none).
 */
export function stepsFor(action, { hasSigningKey }) {
  switch (action) {
    case 'up':
      return [
        ...(hasSigningKey
          ? []
          : [
              {
                ...step('write-empty-signing-keys'),
                run: () => writeFileSync(SIGNING_KEYS, '[]\n'),
              },
              step('supabase', 'gen', 'signing-key', '--algorithm', 'ES256', '--append'),
            ]),
        step('supabase', 'start'),
        step('docker', ...COMPOSE, 'up', '-d', '--wait'),
        { ...step('wait-for-replication'), run: waitForReplication },
      ];
    case 'down':
      // PowerSync joins Supabase's Docker network, so it goes first.
      return [step('docker', ...COMPOSE, 'down'), step('supabase', 'stop')];
    case 'reset':
      // The database PowerSync replicated is gone, so its bucket storage must go too.
      return [
        step('docker', ...COMPOSE, 'down', '-v'),
        step('supabase', 'db', 'reset'),
        step('docker', ...COMPOSE, 'up', '-d', '--wait'),
        { ...step('wait-for-replication'), run: waitForReplication },
      ];
    default:
      throw new Error(`Unknown action "${action}". Use one of: up, down, reset, check.`);
  }
}

/**
 * The Supabase CLI from node_modules, started with this Node: `npx` is a .cmd
 * file on Windows, which only a shell can start, and a shell would re-parse
 * the arguments.
 */
const SUPABASE_CLI = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');

function spawn(command, args, stdio) {
  return command === 'supabase'
    ? spawnSync(process.execPath, [SUPABASE_CLI, ...args], { cwd: projectRoot, stdio })
    : spawnSync(command, args, { cwd: projectRoot, stdio });
}

async function run({ command, args, run: inProcess }) {
  if (inProcess) return inProcess();
  const result = spawn(command, args, 'inherit');
  if (result.status !== 0) {
    console.error(`\`${[command, ...args].join(' ')}\` failed.`);
    process.exit(result.status ?? 1);
  }
}

/**
 * What stops the stack counting as up; empty when it is. PowerSync's liveness
 * probe answers even when the service can't replicate, so an active slot is
 * checked too, once both services run.
 */
export function stackProblems({ supabase, powersync, replicating }) {
  const problems = [];
  if (!supabase) problems.push('Supabase is not running.');
  if (!powersync) problems.push(`PowerSync is not answering on ${POWERSYNC_URL}.`);
  if (supabase && powersync && !replicating) {
    problems.push(
      'PowerSync is running but Postgres has no active replication slot for it. ' +
        'See `docker compose -f powersync/docker-compose.yaml logs powersync`.',
    );
  }
  return problems;
}

/** Whether Postgres has an active logical replication slot made by PowerSync. */
function isReplicating() {
  const result = spawnSync(
    'docker',
    [
      'exec',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-At',
      '-c',
      "select count(*) from pg_replication_slots where slot_name like 'powersync%' and active",
    ],
    { encoding: 'utf8' },
  );
  return result.status === 0 && Number(result.stdout.trim()) > 0;
}

async function isPowerSyncLive() {
  try {
    return (await fetch(`${POWERSYNC_URL}/probes/liveness`)).ok;
  } catch {
    return false; // Not listening.
  }
}

async function stackState() {
  const supabase = spawn('supabase', ['status'], 'ignore').status === 0;
  const powersync = await isPowerSyncLive();
  return { supabase, powersync, replicating: supabase && powersync && isReplicating() };
}

/** After a start or reset, PowerSync takes a few seconds to open its slot. */
async function waitForReplication() {
  const deadline = Date.now() + REPLICATION_TIMEOUT_MS;
  while (!isReplicating()) {
    if (Date.now() > deadline) {
      console.error(
        `PowerSync did not start replicating within ${REPLICATION_TIMEOUT_MS / 1000} s.`,
      );
      for (const problem of stackProblems(await stackState())) console.error(problem);
      process.exit(1);
    }
    await sleep(REPLICATION_POLL_MS);
  }
  console.log('PowerSync is replicating.');
}

async function check() {
  const problems = stackProblems(await stackState());
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error('Run `npm run sync:up` first.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === 'check') {
    await check();
  } else {
    for (const s of stepsFor(action, { hasSigningKey: existsSync(SIGNING_KEYS) })) await run(s);
  }
}

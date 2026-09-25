// The local sync stack: Supabase (through its CLI) and the self-hosted PowerSync
// service (powersync/docker-compose.yaml). See docs/guides/setup.md.
//
//   node scripts/sync-stack.mjs up      start both; makes the local signing key first if missing
//   node scripts/sync-stack.mjs down    stop both
//   node scripts/sync-stack.mjs reset   empty the database and PowerSync's storage, then start again
//   node scripts/sync-stack.mjs check   fail unless both are up (sync:test runs this first)
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(import.meta.dirname, '..');
const SIGNING_KEYS = join(projectRoot, 'supabase', 'signing_keys.json');
const COMPOSE = ['compose', '-f', 'powersync/docker-compose.yaml'];

export const POWERSYNC_URL = 'http://127.0.0.1:54340';

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

function run({ command, args, run: inProcess }) {
  if (inProcess) return inProcess();
  const result = spawn(command, args, 'inherit');
  if (result.status !== 0) {
    console.error(`\`${[command, ...args].join(' ')}\` failed.`);
    process.exit(result.status ?? 1);
  }
}

async function check() {
  const supabase = spawn('supabase', ['status'], 'ignore');
  let powersync = false;
  try {
    powersync = (await fetch(`${POWERSYNC_URL}/probes/liveness`)).ok;
  } catch {
    // Not listening.
  }
  if (supabase.status !== 0 || !powersync) {
    console.error('The local sync stack is not running. Run `npm run sync:up` first.');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === 'check') {
    await check();
  } else {
    for (const s of stepsFor(action, { hasSigningKey: existsSync(SIGNING_KEYS) })) run(s);
  }
}

// The PowerSync Cloud instance for S4's hosted run (powersync/cloud/). Needs the
// PowerSync CLI logged in (`npx powersync@0.10.1 login`) and the database
// password in the gitignored powersync/cloud/.env.local as PS_DATABASE_PASSWORD.
//
//   node scripts/sync-cloud.mjs deploy   check the config, the connection and the sync config, then
//                                        deploy them to the instance
//   node scripts/sync-cloud.mjs status   connections, sync config and replication
//
// There is no dry run: the CLI's --validate-only chooses which checks run, and still deploys.
//
// The password reaches the CLI only as an environment variable and is never printed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEnv } from './sync-app-env.mjs';

const projectRoot = join(import.meta.dirname, '..');
const CLOUD_DIR = 'powersync/cloud';
const ENV_FILE = join(projectRoot, CLOUD_DIR, '.env.local');
/** Not a dependency: its UI pulls in a React the root overrides forbid (TECH-VERSIONS). */
const CLI = 'powersync@0.10.1';

const DEPLOY = [
  'deploy',
  '--directory',
  CLOUD_DIR,
  '--sync-config-file-path',
  'powersync/sync-config.yaml',
];

export function cloudCommand(action) {
  switch (action) {
    case 'deploy':
      return DEPLOY;
    case 'status':
      return ['status', '--directory', CLOUD_DIR];
    default:
      throw new Error(`Unknown action "${action}". Use one of: deploy, status.`);
  }
}

/** The password from the env file's text. Errors name the key, never the file's contents. */
export function databasePassword(text) {
  const password = parseEnv(text).get('PS_DATABASE_PASSWORD');
  if (!password) {
    throw new Error(`${CLOUD_DIR}/.env.local has no PS_DATABASE_PASSWORD.`);
  }
  return password;
}

function main(action) {
  const args = cloudCommand(action);
  const env = { ...process.env };
  if (action === 'deploy') {
    env.POWERSYNC_DATABASE_PASSWORD = databasePassword(readFileSync(ENV_FILE, 'utf8'));
  }
  // npx is a .cmd file on Windows, which only a shell starts. The arguments are fixed above.
  const result = spawnSync('npx', ['--yes', CLI, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv[2]);

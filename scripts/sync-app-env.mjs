// Points the app at the local sync stack, for the sync lab screen (S4):
// writes apps/mobile/.env.local from `supabase status`, and makes the lab's
// test user, or gives it the password already written there, so every device
// and browser built from it signs in to the same account.
//
//   npm run sync:app-env    after `npm run sync:up`; then restart the Expo dev server
//
// Everything written is a throwaway local value. The Supabase key is the
// publishable one, which ships in apps; the secret key only makes the user.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POWERSYNC_URL } from './sync-stack.mjs';

const projectRoot = join(import.meta.dirname, '..');
const SUPABASE_CLI = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');
const APP_ENV = join(projectRoot, 'apps', 'mobile', '.env.local');
const LAB_EMAIL = 'sync-lab@example.test';

export const HEADER =
  '# Written by `npm run sync:app-env` for the local sync stack. Throwaway local values.\n';

/** `KEY=value` and `KEY="value"` lines; anything else is skipped. */
export function parseEnv(text) {
  return new Map(
    text
      .split(/\r?\n/)
      .map((line) => /^([A-Z_]+)="?(.*?)"?\s*$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

export function renderAppEnv({ supabaseUrl, publishableKey, powersyncUrl, email, password }) {
  return [
    HEADER.trimEnd(),
    `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
    `EXPO_PUBLIC_SUPABASE_KEY=${publishableKey}`,
    `EXPO_PUBLIC_POWERSYNC_URL=${powersyncUrl}`,
    `EXPO_PUBLIC_SYNC_LAB_EMAIL=${email}`,
    `EXPO_PUBLIC_SYNC_LAB_PASSWORD=${password}`,
    '',
  ].join('\n');
}

function supabaseStatus() {
  const output = execFileSync(process.execPath, [SUPABASE_CLI, 'status', '-o', 'env'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values = parseEnv(output);
  for (const key of ['API_URL', 'PUBLISHABLE_KEY', 'SECRET_KEY']) {
    if (!values.get(key)) {
      throw new Error(`\`supabase status\` gave no ${key}. Run \`npm run sync:up\`.`);
    }
  }
  return values;
}

/** The password already written, so a second run doesn't strand builds made from the first. */
function existingPassword() {
  if (!existsSync(APP_ENV)) return null;
  const text = readFileSync(APP_ENV, 'utf8');
  if (!text.startsWith(HEADER)) {
    throw new Error(`${APP_ENV} was not written by this script; move it aside first.`);
  }
  return parseEnv(text).get('EXPO_PUBLIC_SYNC_LAB_PASSWORD') ?? null;
}

async function ensureLabUser(url, secretKey, password) {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
  const { data, error } = await admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === LAB_EMAIL);
  const result = user
    ? await admin.updateUserById(user.id, { password })
    : await admin.createUser({ email: LAB_EMAIL, password, email_confirm: true });
  if (result.error) throw result.error;
}

async function main() {
  const status = supabaseStatus();
  const password = existingPassword() ?? `pw-${randomUUID()}`;
  await ensureLabUser(status.get('API_URL'), status.get('SECRET_KEY'), password);
  writeFileSync(
    APP_ENV,
    renderAppEnv({
      supabaseUrl: status.get('API_URL'),
      publishableKey: status.get('PUBLISHABLE_KEY'),
      powersyncUrl: POWERSYNC_URL,
      email: LAB_EMAIL,
      password,
    }),
  );
  console.log(`Wrote ${APP_ENV}. Restart the Expo dev server to pick it up.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

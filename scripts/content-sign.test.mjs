import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

const SCRIPT = join(import.meta.dirname, 'content-sign.mjs');
const PASSPHRASE = 'correct horse battery staple';
const PACKS = { core: '{"id":"core"}', 'deity/shiva': '{"id":"deity/shiva"}' };

// Each test signs from a fresh clone of its own: a git repo holding only the script.
let sandbox;
let checkout;
let script;
let outside;

function git(...args) {
  return execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: 'pipe' }).trim();
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'content-sign-'));
  checkout = join(sandbox, 'clone');
  outside = join(sandbox, 'outside');
  mkdirSync(join(checkout, 'scripts'), { recursive: true });
  mkdirSync(outside);
  script = join(checkout, 'scripts', 'content-sign.mjs');
  copyFileSync(SCRIPT, script);
  writeFileSync(join(checkout, '.gitignore'), 'node_modules/\ndist/\n');
  writeFileSync(join(checkout, 'README.md'), 'clone\n');
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init');
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

// stdin is a pipe here, never a terminal, so the passphrase is read from it.
function run(args, { input = '', env = process.env } = {}) {
  return spawnSync(process.execPath, [script, ...args], { input, env, encoding: 'utf8' });
}

function keygen(out, passphrase = PASSPHRASE) {
  const result = run(['keygen', '--out', out], { input: `${passphrase}\n${passphrase}\n` });
  assert.equal(result.status, 0, result.stderr);
  const publicKey = /public_key: (\S+)/.exec(result.stdout)?.[1];
  const keyId = /key_id: (\S+)/.exec(result.stdout)?.[1];
  return { publicKey, keyId };
}

function writeBuild(dir, packs = PACKS) {
  const entries = Object.entries(packs).map(([id, body]) => {
    const bytes = Buffer.from(body);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const path = `packs/${id}.${sha256.slice(0, 16)}.json`;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
    return { bytes: bytes.length, id, path, sha256 };
  });
  writeManifest(dir, entries);
  return entries;
}

function writeManifest(dir, packs) {
  const manifest = { channel: 'development', packs, release: 0, schema_version: 1 };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
}

// A key, a build and a signing run, as most tests need them.
function setUp() {
  const key = join(outside, 'current.pem');
  const { publicKey, keyId } = keygen(key);
  const dir = join(sandbox, 'build');
  const entries = writeBuild(dir);
  return { key, publicKey, keyId, dir, entries };
}

function sign(key, dir, passphrase = PASSPHRASE) {
  return run(['sign', '--key', key, '--dir', dir], { input: `${passphrase}\n` });
}

function verify(publicKey, dir) {
  return run(['verify', '--public-key', publicKey, '--dir', dir]);
}

function flipLastByte(path) {
  const bytes = readFileSync(path);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(path, bytes);
}

// A junction needs no special rights on Windows; elsewhere it is a plain link.
function linkDir(target, path) {
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

// File links need Developer Mode on Windows, so those tests run in CI (Linux) instead.
function linkFileOrSkip(t, target, path) {
  try {
    symlinkSync(target, path, 'file');
    return true;
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    t.skip('creating a file link needs Developer Mode on Windows');
    return false;
  }
}

function assertNoSignature(dir) {
  assert.ok(!existsSync(join(dir, 'manifest.sig.json')), 'no signature written');
  assert.deepEqual(
    readdirSync(dir).filter((name) => name.endsWith('.tmp')),
    [],
    'no temporary file left behind',
  );
}

test('keygen writes an encrypted PKCS#8 PEM and prints the base64 public key and key_id', () => {
  const out = join(outside, 'current.pem');

  const { publicKey, keyId } = keygen(out);

  const pem = readFileSync(out, 'utf8');
  assert.match(pem, /^-----BEGIN ENCRYPTED PRIVATE KEY-----/);
  assert.throws(() => createPrivateKey(pem));
  const key = createPrivateKey({ key: pem, passphrase: PASSPHRASE });
  assert.equal(key.asymmetricKeyType, 'ed25519');
  const raw = Buffer.from(key.export({ format: 'jwk' }).x, 'base64url');
  assert.equal(publicKey, raw.toString('base64'));
  assert.equal(keyId, createHash('sha256').update(raw).digest('hex').slice(0, 16));
});

test('keygen never overwrites an existing file', () => {
  const out = join(outside, 'current.pem');
  writeFileSync(out, 'keep me');

  const result = run(['keygen', '--out', out], { input: `${PASSPHRASE}\n${PASSPHRASE}\n` });

  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(out, 'utf8'), 'keep me');
});

test('keygen refuses a passphrase shorter than 20 characters, or two that differ', () => {
  const out = join(outside, 'current.pem');

  const short = run(['keygen', '--out', out], { input: 'too short\ntoo short\n' });
  const differ = run(['keygen', '--out', out], { input: `${PASSPHRASE}\n${PASSPHRASE}!\n` });

  assert.notEqual(short.status, 0);
  assert.match(short.stderr, /20 characters/);
  assert.notEqual(differ.status, 0);
  assert.match(differ.stderr, /don't match/);
  assert.ok(!existsSync(out));
});

test('keygen refuses a path inside the repo, comparing real paths', () => {
  mkdirSync(join(checkout, 'dist'));
  linkDir(join(checkout, 'dist'), join(outside, 'into-repo'));

  for (const out of [join(checkout, 'dist', 'key.pem'), join(outside, 'into-repo', 'key.pem')]) {
    const result = run(['keygen', '--out', out], { input: `${PASSPHRASE}\n${PASSPHRASE}\n` });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inside the repo/);
    assert.ok(!existsSync(join(checkout, 'dist', 'key.pem')));
  }
});

test('keygen refuses to run from a checkout with node_modules, like sign', () => {
  mkdirSync(join(checkout, 'node_modules'));
  const out = join(outside, 'current.pem');

  const result = run(['keygen', '--out', out], { input: `${PASSPHRASE}\n${PASSPHRASE}\n` });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /node_modules/);
  assert.ok(!existsSync(out));
});

test('sign refuses a --key inside the repo, comparing real paths', () => {
  const { key, dir } = setUp();
  mkdirSync(join(checkout, 'dist'));
  copyFileSync(key, join(checkout, 'dist', 'key.pem'));
  linkDir(join(checkout, 'dist'), join(outside, 'into-repo'));

  for (const inRepo of [join(checkout, 'dist', 'key.pem'), join(outside, 'into-repo', 'key.pem')]) {
    const result = sign(inRepo, dir);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inside the repo/);
    assertNoSignature(dir);
  }
});

test('sign refuses to run from a checkout with node_modules or uncommitted changes, and prints the commit it is at', () => {
  const { key, dir } = setUp();
  const commit = git('rev-parse', 'HEAD');
  const changes = [
    () => mkdirSync(join(checkout, 'node_modules')),
    () => mkdirSync(join(checkout, 'tools', 'x', 'node_modules', 'pkg'), { recursive: true }),
    () => appendFileSync(join(checkout, 'README.md'), 'changed\n'),
    () => writeFileSync(join(checkout, 'untracked.txt'), 'new\n'),
  ];

  for (const change of changes) {
    change();
    const result = sign(key, dir);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, new RegExp(commit));
    assert.match(result.stderr, /node_modules|uncommitted/);
    assertNoSignature(dir);
    git('checkout', '--', 'README.md');
    git('clean', '-q', '-fdx');
  }
});

test('sign then verify succeeds', () => {
  const { key, publicKey, keyId, dir } = setUp();
  const commit = git('rev-parse', 'HEAD');

  const signed = sign(key, dir);
  const verified = verify(publicKey, dir);

  assert.equal(signed.status, 0, signed.stderr);
  assert.match(signed.stdout, new RegExp(commit));
  const signature = JSON.parse(readFileSync(join(dir, 'manifest.sig.json'), 'utf8'));
  assert.deepEqual(Object.keys(signature), ['algorithm', 'key_id', 'signature']);
  assert.equal(signature.algorithm, 'ed25519');
  assert.equal(signature.key_id, keyId);
  assert.equal(Buffer.from(signature.signature, 'base64').length, 64);
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, new RegExp(keyId));
});

test('sign never reads an existing manifest.sig.json: it writes a new file in --dir and renames it into place', (t) => {
  const { key, publicKey, dir } = setUp();
  const target = join(outside, 'elsewhere.json');
  writeFileSync(target, 'untouched');
  if (!linkFileOrSkip(t, target, join(dir, 'manifest.sig.json'))) return;

  const result = sign(key, dir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(target, 'utf8'), 'untouched');
  assert.ok(lstatSync(join(dir, 'manifest.sig.json')).isFile());
  assert.equal(verify(publicKey, dir).status, 0);
});

test('sign replaces an older signature and leaves no temporary file', () => {
  const { key, publicKey, dir } = setUp();
  writeFileSync(join(dir, 'manifest.sig.json'), '{"old":true}');

  const result = sign(key, dir);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(dir).sort(), ['manifest.json', 'manifest.sig.json', 'packs']);
  assert.equal(verify(publicKey, dir).status, 0);
});

test('sign and verify refuse a packs/ folder that is a link', () => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  const real = join(outside, 'packs');
  cpSync(join(dir, 'packs'), real, { recursive: true });
  rmSync(join(dir, 'packs'), { recursive: true });
  linkDir(real, join(dir, 'packs'));

  const verified = verify(publicKey, dir);
  rmSync(join(dir, 'manifest.sig.json'));
  const signed = sign(key, dir);

  for (const result of [verified, signed]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /packs.*link/);
  }
  assertNoSignature(dir);
});

test('sign and verify refuse a pack that is a link', (t) => {
  const { key, publicKey, dir, entries } = setUp();
  sign(key, dir);
  const pack = join(dir, entries[0].path);
  const real = join(outside, 'pack.json');
  copyFileSync(pack, real);
  rmSync(pack);
  if (!linkFileOrSkip(t, real, pack)) return;

  const verified = verify(publicKey, dir);
  rmSync(join(dir, 'manifest.sig.json'));
  const signed = sign(key, dir);

  for (const result of [verified, signed]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /link/);
  }
});

test('sign and verify refuse a manifest path outside packs/', () => {
  const { key, publicKey, dir, entries } = setUp();
  sign(key, dir);
  writeFileSync(join(sandbox, 'escape.json'), PACKS.core);
  const paths = [
    'packs/../../escape.json',
    '../escape.json',
    join(sandbox, 'escape.json'),
    'manifest.json',
  ];

  for (const path of paths) {
    writeManifest(dir, [{ ...entries[0], path }, entries[1]]);
    const verified = verify(publicKey, dir);
    const signed = sign(key, dir);

    for (const result of [verified, signed]) {
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /not a path under packs\//);
    }
  }
});

test('sign and verify refuse a manifest.json that is a link', (t) => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  const real = join(outside, 'manifest.json');
  copyFileSync(join(dir, 'manifest.json'), real);
  rmSync(join(dir, 'manifest.json'));
  if (!linkFileOrSkip(t, real, join(dir, 'manifest.json'))) return;

  const verified = verify(publicKey, dir);
  rmSync(join(dir, 'manifest.sig.json'));
  const signed = sign(key, dir);

  for (const result of [verified, signed]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest\.json.*link/);
  }
});

test('verify refuses a manifest.sig.json that is a link', (t) => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  const real = join(outside, 'manifest.sig.json');
  copyFileSync(join(dir, 'manifest.sig.json'), real);
  rmSync(join(dir, 'manifest.sig.json'));
  if (!linkFileOrSkip(t, real, join(dir, 'manifest.sig.json'))) return;

  const result = verify(publicKey, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest\.sig\.json.*link/);
});

test('a manifest that is not JSON, or lists a pack twice, fails sign', () => {
  const { key, dir, entries } = setUp();
  const manifests = ['{not json', null];

  for (const manifest of manifests) {
    if (manifest === null) writeManifest(dir, [entries[0], entries[0], entries[1]]);
    else writeFileSync(join(dir, 'manifest.json'), manifest);
    const result = sign(key, dir);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest\.json/);
    assertNoSignature(dir);
  }
});

// Both are printed, and the build folder isn't trusted: no terminal escapes get through.
test('a manifest with an unknown channel or a release that is not a whole number fails sign', () => {
  const { key, dir, entries } = setUp();
  const manifests = [
    { channel: '\u001b[2Jdevelopment', packs: entries, release: 0, schema_version: 1 },
    { channel: 'development', packs: entries, release: '1\u001b[2J', schema_version: 1 },
    { channel: 'development', packs: entries, release: -1, schema_version: 1 },
  ];

  for (const manifest of manifests) {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    const result = sign(key, dir);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest\.json has no valid (channel|release)/);
    assert.ok(!(result.stdout + result.stderr).includes('\u001b'), 'no escape printed');
    assertNoSignature(dir);
  }
});

test('a file name in packs/ with a terminal escape is printed escaped', (t) => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  try {
    writeFileSync(join(dir, 'packs', '\u001b[2J.json'), '{}');
  } catch (error) {
    if (!['EINVAL', 'ENOENT'].includes(error.code)) throw error;
    t.skip('this file system refuses control characters in names');
    return;
  }

  const verified = verify(publicKey, dir);
  rmSync(join(dir, 'manifest.sig.json'));
  const signed = sign(key, dir);

  for (const result of [verified, signed]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /packs\/\\u001b\[2J\.json.*not in the manifest/);
    assert.ok(!(result.stdout + result.stderr).includes('\u001b'), 'no escape printed');
  }
});

test('verify refuses a manifest.sig.json whose key_id or signature is malformed, without printing them', () => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  const good = JSON.parse(readFileSync(join(dir, 'manifest.sig.json'), 'utf8'));
  const bad = [
    { ...good, key_id: '\u001b[2J0123456789ab' },
    { ...good, key_id: good.key_id.toUpperCase() },
    { ...good, signature: good.signature.slice(0, -4) },
    { ...good, signature: ` ${good.signature}` },
  ];

  for (const signature of bad) {
    writeFileSync(join(dir, 'manifest.sig.json'), JSON.stringify(signature));
    const result = verify(publicKey, dir);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not an Ed25519 manifest signature/);
    assert.ok(!(result.stdout + result.stderr).includes('\u001b'), 'no escape printed');
  }
});

test('changing one byte of a pack fails sign: the manifest no longer matches', () => {
  const { key, dir, entries } = setUp();
  flipLastByte(join(dir, entries[1].path));

  const result = sign(key, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`${entries[1].path}.*does not match`));
  assertNoSignature(dir);
});

test('a file in packs/ not in the manifest, or a manifest entry with no file, fails sign', () => {
  const { key, dir, entries } = setUp();
  writeFileSync(join(dir, 'packs', 'stray.json'), '{}');
  rmSync(join(dir, entries[1].path));

  const result = sign(key, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /packs\/stray\.json.*not in the manifest/);
  assert.match(result.stderr, new RegExp(`${entries[1].path}.*missing`));
  assertNoSignature(dir);
});

test('changing one byte of manifest.json after signing fails verify', () => {
  const { key, publicKey, dir } = setUp();
  sign(key, dir);
  const manifest = join(dir, 'manifest.json');
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"release":0', '"release":1'));

  const result = verify(publicKey, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /signature does not match/);
});

test('changing one byte of a pack after signing fails verify', () => {
  const { key, publicKey, dir, entries } = setUp();
  sign(key, dir);
  flipLastByte(join(dir, entries[0].path));

  const result = verify(publicKey, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`${entries[0].path}.*does not match`));
});

test('a pack missing, or a file in packs/ not in the manifest, fails verify as well as sign', () => {
  const { key, publicKey, dir, entries } = setUp();
  sign(key, dir);

  rmSync(join(dir, entries[0].path));
  const missing = verify(publicKey, dir);
  writeBuild(dir);
  writeFileSync(join(dir, 'packs', 'deity', 'stray.json'), '{}');
  const extra = verify(publicKey, dir);

  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing/);
  assert.notEqual(extra.status, 0);
  assert.match(extra.stderr, /packs\/deity\/stray\.json.*not in the manifest/);
});

test('a wrong passphrase fails without writing a signature', () => {
  const { key, dir } = setUp();

  const result = sign(key, dir, `${PASSPHRASE}?`);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /passphrase/);
  assertNoSignature(dir);
});

test('sign refuses a key that is not encrypted', () => {
  const { key, dir } = setUp();
  const plain = join(outside, 'plain.pem');
  const pem = createPrivateKey({ key: readFileSync(key), passphrase: PASSPHRASE });
  writeFileSync(plain, pem.export({ type: 'pkcs8', format: 'pem' }));

  const result = sign(plain, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /encrypted/);
  assertNoSignature(dir);
});

test('verify with a different key fails, naming both key ids', () => {
  const { key, keyId, dir } = setUp();
  sign(key, dir);
  const other = keygen(join(outside, 'next.pem'));

  const result = verify(other.publicKey, dir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(keyId));
  assert.match(result.stderr, new RegExp(other.keyId));
});

test('the passphrase comes from the terminal, or stdin when it isn’t one; never argv or env', () => {
  const { key, dir } = setUp();
  const env = {
    ...process.env,
    PASSPHRASE,
    CONTENT_SIGN_PASSPHRASE: PASSPHRASE,
    JAPADHYAN_PASSPHRASE: PASSPHRASE,
  };

  const fromArgv = run(['sign', '--key', key, '--dir', dir, '--passphrase', PASSPHRASE]);
  const fromEnv = run(['sign', '--key', key, '--dir', dir], { env });
  const fromStdin = sign(key, dir);

  assert.notEqual(fromArgv.status, 0);
  assert.match(fromArgv.stderr, /--passphrase/);
  assert.notEqual(fromEnv.status, 0);
  assert.match(fromEnv.stderr, /passphrase/);
  assert.equal(fromStdin.status, 0, fromStdin.stderr);
});

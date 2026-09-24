// Signs and verifies the content manifest (docs/architecture/content-pipeline.md#signing).
//
//   node scripts/content-sign.mjs keygen --out <path outside the repo>
//   node scripts/content-sign.mjs sign   --key <pem> --dir dist/content/<channel>
//   node scripts/content-sign.mjs verify --public-key <base64> --dir dist/content/<channel>
//
// Node built-ins only, nothing from npm or the build. keygen and sign take the key's
// passphrase, so they run only from a fresh clone where `npm install` never ran: no
// package can have changed this file before the passphrase is typed into it.
import { execFileSync } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const REPO_ROOT = realpathSync.native(join(import.meta.dirname, '..'));
// The PEM's key derivation is PBKDF2 at 2048 rounds, which Node can't raise, so the
// passphrase has to carry the strength: a long random one from the password manager.
const MIN_PASSPHRASE_LENGTH = 20;
const ENCRYPTED_PEM_HEADER = '-----BEGIN ENCRYPTED PRIVATE KEY-----';
const KEY_ID_HEX_DIGITS = 16;
const CHANNELS = ['development', 'production'];
const PACK_PATH = /^packs\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/;

class SignError extends Error {}

// --- Paths -----------------------------------------------------------------------------

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

// A path that may not exist yet, with every existing part resolved through links.
function realPathOf(path) {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync.native(absolute);
  return join(realPathOf(dirname(absolute)), basename(absolute));
}

function refuseInsideRepo(path, what) {
  if (isInside(REPO_ROOT, realPathOf(path))) {
    throw new SignError(`${what} ${path} is inside the repo. Keep keys outside it.`);
  }
}

// A regular file directly in `dir`, never a link: checked before it is opened.
function readRegularFile(dir, name) {
  const path = join(dir, name);
  const stats = lstatSync(path, { throwIfNoEntry: false });
  if (!stats) throw new SignError(`${name} is missing from ${dir}.`);
  if (stats.isSymbolicLink()) throw new SignError(`${name} is a link. Refusing to follow it.`);
  if (!stats.isFile()) throw new SignError(`${name} is not a file.`);
  return readFileSync(path);
}

// --- The checkout ----------------------------------------------------------------------

function findNodeModules(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.name === 'node_modules') return path;
    const found = findNodeModules(path);
    if (found) return found;
  }
  return null;
}

// Prints the commit first, so the owner can see what they are about to trust.
function checkFreshClone() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  console.log(`Running from commit ${commit.trim()} in ${REPO_ROOT}`);
  const nodeModules = findNodeModules(REPO_ROOT);
  if (nodeModules) {
    throw new SignError(
      `${nodeModules} exists. Run this from a fresh clone where npm install never ran.`,
    );
  }
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (status.trim() !== '') {
    throw new SignError(`The checkout has uncommitted changes:\n${status.trimEnd()}`);
  }
}

// --- The passphrase --------------------------------------------------------------------

function readHidden(prompt) {
  const { stdin } = process;
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolvePromise, reject) => {
    let typed = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          resolvePromise(typed);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new SignError('Cancelled.'));
          return;
        }
        typed = char === '\u007f' || char === '\b' ? typed.slice(0, -1) : typed + char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readStdinLines() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
}

// From the terminal with echo off, or line by line from stdin when it isn't a terminal.
// Never from an argument or the environment, where other processes can read it.
function passphraseReader() {
  if (process.stdin.isTTY) return readHidden;
  let lines;
  return async () => {
    lines ??= await readStdinLines();
    const line = lines.shift();
    if (!line) throw new SignError('No passphrase on stdin.');
    return line;
  };
}

// --- Keys ------------------------------------------------------------------------------

function rawPublicKey(key) {
  return Buffer.from(createPublicKey(key).export({ format: 'jwk' }).x, 'base64url');
}

function keyIdOf(raw) {
  return createHash('sha256').update(raw).digest('hex').slice(0, KEY_ID_HEX_DIGITS);
}

function publicKeyFromBase64(base64) {
  const raw = Buffer.from(base64, 'base64');
  if (raw.length !== 32 || raw.toString('base64') !== base64) {
    throw new SignError('--public-key must be a base64 Ed25519 public key (32 bytes).');
  }
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
  return { key, keyId: keyIdOf(raw) };
}

function decryptPrivateKey(path, pem, passphrase) {
  try {
    const key = createPrivateKey({ key: pem, format: 'pem', passphrase });
    if (key.asymmetricKeyType !== 'ed25519') throw new SignError(`${path} is not an Ed25519 key.`);
    return key;
  } catch (error) {
    if (error instanceof SignError) throw error;
    throw new SignError(`Could not decrypt ${path}: wrong passphrase, or not a key file.`);
  }
}

// --- The build -------------------------------------------------------------------------

function parseManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new SignError('manifest.json is not valid JSON.');
  }
  if (!Array.isArray(manifest?.packs)) throw new SignError('manifest.json has no packs list.');
  if (!CHANNELS.includes(manifest.channel))
    throw new SignError('manifest.json has no valid channel.');
  if (!Number.isInteger(manifest.release) || manifest.release < 0) {
    throw new SignError('manifest.json has no valid release.');
  }
  const seen = new Set();
  for (const entry of manifest.packs) {
    const { path, bytes: size, sha256 } = entry ?? {};
    if (typeof path !== 'string' || !PACK_PATH.test(path) || /(^|\/)\.\.?\//.test(path)) {
      throw new SignError(`manifest.json lists ${JSON.stringify(path)}, not a path under packs/.`);
    }
    if (!Number.isInteger(size) || size < 0 || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new SignError(`manifest.json has no valid size and SHA-256 for ${path}.`);
    }
    if (seen.has(path)) throw new SignError(`manifest.json lists ${path} twice.`);
    seen.add(path);
  }
  return manifest;
}

// Every file under packs/, as manifest paths. A link anywhere is refused, never followed.
function listPackFiles(dir, prefix = 'packs') {
  const files = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new SignError(`${path} is a link. Refusing to follow it.`);
    if (entry.isDirectory()) files.push(...listPackFiles(dir, path));
    else if (entry.isFile()) files.push(path);
    else throw new SignError(`${path} is not a file or folder.`);
  }
  return files;
}

function packProblems(dir, manifest) {
  const packs = lstatSync(join(dir, 'packs'), { throwIfNoEntry: false });
  if (packs?.isSymbolicLink()) throw new SignError('packs/ is a link. Refusing to follow it.');
  if (!packs?.isDirectory()) throw new SignError(`${dir} has no packs/ folder.`);
  const found = new Set(listPackFiles(dir));
  const listed = new Set(manifest.packs.map((entry) => entry.path));
  const problems = [...found]
    .filter((path) => !listed.has(path))
    .map((path) => `${path} is not in the manifest.`);
  for (const { path, bytes, sha256 } of manifest.packs) {
    if (!found.has(path)) {
      problems.push(`${path} is missing.`);
      continue;
    }
    const content = readFileSync(join(dir, path));
    const actual = createHash('sha256').update(content).digest('hex');
    if (content.length !== bytes || actual !== sha256) {
      problems.push(`${path} does not match the manifest's size and SHA-256.`);
    }
  }
  return problems;
}

// What sign and verify both check before trusting a build folder.
function checkBuild(dirArg) {
  const dir = realpathSync.native(resolve(dirArg));
  if (!statSync(dir).isDirectory()) throw new SignError(`${dirArg} is not a folder.`);
  const manifestBytes = readRegularFile(dir, 'manifest.json');
  const manifest = parseManifest(manifestBytes);
  const problems = packProblems(dir, manifest);
  if (problems.length > 0) {
    throw new SignError(`The packs don't match manifest.json:\n  ${problems.join('\n  ')}`);
  }
  return { dir, manifest, manifestBytes };
}

function describe(manifest) {
  return `release ${manifest.release}, channel ${manifest.channel}, ${manifest.packs.length} packs`;
}

// Written beside the target and renamed over it, so an existing file or link there is
// replaced, never followed or written through.
function writeReplacing(dir, name, content) {
  const temporary = join(dir, `${name}.${randomBytes(8).toString('hex')}.tmp`);
  const fd = openSync(temporary, 'wx', 0o644);
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temporary, join(dir, name));
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

// --- Commands --------------------------------------------------------------------------

async function keygen({ out }) {
  refuseInsideRepo(out, '--out');
  if (existsSync(out)) throw new SignError(`${out} already exists. Refusing to overwrite it.`);
  checkFreshClone();
  const ask = passphraseReader();
  const passphrase = await ask('Passphrase for the new key: ');
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new SignError(
      `The passphrase needs at least ${MIN_PASSPHRASE_LENGTH} characters. Generate one in the password manager.`,
    );
  }
  if ((await ask('Again: ')) !== passphrase) throw new SignError("The passphrases don't match.");
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const fd = openSync(out, 'wx', 0o600);
  try {
    writeSync(fd, privateKey);
  } finally {
    closeSync(fd);
  }
  const raw = rawPublicKey(publicKey);
  console.log(`Wrote ${out}`);
  console.log(`public_key: ${raw.toString('base64')}`);
  console.log(`key_id: ${keyIdOf(raw)}`);
}

async function sign({ key: keyPath, dir: dirArg }) {
  checkFreshClone();
  refuseInsideRepo(keyPath, '--key');
  const pem = readRegularFile(dirname(resolve(keyPath)), basename(keyPath)).toString('utf8');
  if (!pem.startsWith(ENCRYPTED_PEM_HEADER)) {
    throw new SignError(`${keyPath} is not an encrypted private key. Make one with keygen.`);
  }
  const { dir, manifest, manifestBytes } = checkBuild(dirArg);
  const passphrase = await passphraseReader()('Passphrase: ');
  const privateKey = decryptPrivateKey(keyPath, pem, passphrase);
  const keyId = keyIdOf(rawPublicKey(privateKey));
  const signature = {
    algorithm: 'ed25519',
    key_id: keyId,
    signature: signBytes(null, manifestBytes, privateKey).toString('base64'),
  };
  writeReplacing(dir, 'manifest.sig.json', JSON.stringify(signature));
  console.log(`Signed ${describe(manifest)} with key ${keyId}.`);
}

function parseSignature(bytes) {
  let signature;
  try {
    signature = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new SignError('manifest.sig.json is not valid JSON.');
  }
  const { algorithm, key_id: keyId, signature: base64 } = signature ?? {};
  if (algorithm !== 'ed25519' || typeof keyId !== 'string' || typeof base64 !== 'string') {
    throw new SignError('manifest.sig.json is not an Ed25519 manifest signature.');
  }
  return { keyId, bytes: Buffer.from(base64, 'base64') };
}

function verify({ 'public-key': publicKeyArg, dir: dirArg }) {
  const { key, keyId } = publicKeyFromBase64(publicKeyArg);
  const { dir, manifest, manifestBytes } = checkBuild(dirArg);
  const signature = parseSignature(readRegularFile(dir, 'manifest.sig.json'));
  if (signature.keyId !== keyId) {
    throw new SignError(`Signed with key ${signature.keyId}, but --public-key is key ${keyId}.`);
  }
  if (!verifyBytes(null, manifestBytes, key, signature.bytes)) {
    throw new SignError(`The signature does not match manifest.json (key ${keyId}).`);
  }
  console.log(`Verified ${describe(manifest)}, signed with key ${keyId}.`);
}

const COMMANDS = {
  keygen: { run: keygen, options: ['out'] },
  sign: { run: sign, options: ['key', 'dir'] },
  verify: { run: verify, options: ['public-key', 'dir'] },
};

async function main([name, ...args]) {
  const command = COMMANDS[name];
  if (!command) throw new SignError('Usage: content-sign.mjs keygen | sign | verify [options]');
  const options = Object.fromEntries(command.options.map((option) => [option, { type: 'string' }]));
  let values;
  try {
    ({ values } = parseArgs({ args, options, strict: true, allowPositionals: false }));
  } catch (error) {
    throw new SignError(error.message);
  }
  const missing = command.options.filter((option) => values[option] === undefined);
  if (missing.length > 0) throw new SignError(`${name} needs --${missing.join(' and --')}.`);
  await command.run(values);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof SignError) && error.code !== 'ENOENT') throw error;
  console.error(`content-sign: ${error.message}`);
  process.exitCode = 1;
}

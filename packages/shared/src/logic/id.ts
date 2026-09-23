/**
 * UUIDv7: a 48-bit millisecond timestamp followed by random bits, so ids are
 * generated on the device (they work offline) yet still sort by time.
 *
 * Layout (RFC 9562): 48 bits time, 4 bits version `7`, 12 bits random,
 * 2 bits variant `10`, 62 bits random.
 *
 * See docs/architecture/data-model.md#ownership-and-shared-fields.
 */

const TIME_BITS = 48;
const MAX_TIME_MS = 2 ** TIME_BITS - 1;
const BYTES = 16;

export interface Uuidv7Options {
  /** Defaults to now. */
  nowMs?: number;
  /** Defaults to the platform's cryptographic random source. */
  randomBytes?: (n: number) => Uint8Array;
}

/**
 * The slice of the Web Crypto API we need, declared structurally: this
 * package is platform-agnostic, so it cannot depend on the DOM `Crypto` type.
 */
interface RandomSource {
  getRandomValues?<T extends ArrayBufferView>(array: T): T;
}

function defaultRandomBytes(n: number): Uint8Array {
  const webCrypto = (globalThis as { crypto?: RandomSource }).crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error(
      'No cryptographic random source. Provide randomBytes, or install a getRandomValues polyfill.',
    );
  }
  return webCrypto.getRandomValues(new Uint8Array(n));
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function uuidv7(options: Uuidv7Options = {}): string {
  const { nowMs = Date.now(), randomBytes = defaultRandomBytes } = options;
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_TIME_MS) {
    throw new RangeError(`nowMs must be a whole number of 0..${MAX_TIME_MS}, got ${nowMs}`);
  }

  const bytes = new Uint8Array(BYTES);
  bytes.set(randomBytes(BYTES).subarray(0, BYTES));

  // Big-endian 48-bit timestamp. Split at 2^24 so the arithmetic stays exact.
  const high = Math.floor(nowMs / 2 ** 24);
  const low = nowMs % 2 ** 24;
  bytes[0] = (high >>> 16) & 0xff;
  bytes[1] = (high >>> 8) & 0xff;
  bytes[2] = high & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;

  // Safe: `bytes` is a fixed 16-byte array.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10

  let hex = '';
  for (const byte of bytes) hex += HEX[byte]!;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

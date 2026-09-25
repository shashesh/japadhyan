/** Internal to `logic/`: not exported from the package. */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Lowercase and hyphenated: the one canonical spelling of a UUID. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The first 16 bytes as a lowercase hyphenated UUID. */
export function formatUuid(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes.subarray(0, 16)) hex += HEX[byte]!;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

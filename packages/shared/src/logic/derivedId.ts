/**
 * Ids for rows that are unique per devotee — the profile, one saved practice
 * per practice, one default per deity, one position per practice — are
 * **derived** from what makes them unique, not generated. Two devices offline
 * then write the same row, and the server merges them instead of rejecting
 * the second as a duplicate and silently losing it.
 *
 * A UUIDv5 (RFC 9562, SHA-1) of `v1:<table>:<user_id>[:<key>]` in JapaDhyan's
 * own namespace. `v1` never changes once rows have synced: a new scheme would
 * mint different ids for existing rows, so it would be a migration.
 *
 * See docs/architecture/data-model.md#ids-for-rows-that-are-unique-per-devotee.
 */

import { sha1 } from '@noble/hashes/legacy.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

import { formatUuid, UUID } from './uuidFormat';

export const DERIVED_ID_NAMESPACE = '49841fbe-b559-4c62-ae52-0d0611052939';

export type DerivedIdKey =
  | { table: 'profiles'; user_id: string }
  | { table: 'saved_practices' | 'practice_positions'; user_id: string; practice_id: string }
  | { table: 'deity_defaults'; user_id: string; deity_id: string };

/** A catalog id, which is never shaped like a UUID (see `catalogIdSchema`). */
const CATALOG_ID = /^[a-z0-9-]+$/;

function isCatalogId(value: string): boolean {
  return CATALOG_ID.test(value) && !UUID.test(value);
}

function assertUuid(value: string, field: string): void {
  if (!UUID.test(value)) {
    throw new RangeError(`${field} must be a lowercase hyphenated UUID, got "${value}"`);
  }
}

function assertCatalogId(value: string, field: string): void {
  if (!isCatalogId(value)) {
    throw new RangeError(`${field} must be a catalog id, got "${value}"`);
  }
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** A name-based UUID (version 5): SHA-1 of the namespace's bytes then the UTF-8 name. */
export function uuidv5(namespace: string, name: string): string {
  assertUuid(namespace, 'namespace');
  const nameBytes = utf8ToBytes(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(uuidBytes(namespace));
  input.set(nameBytes, 16);

  const bytes = sha1(input).subarray(0, 16);
  // Safe: SHA-1 gives 20 bytes, so both indexes exist.
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10

  return formatUuid(bytes);
}

/** The canonical name. No field can contain `:`, so it is unambiguous. */
function nameFor(key: DerivedIdKey): string {
  assertUuid(key.user_id, 'user_id');
  switch (key.table) {
    case 'profiles':
      return `v1:profiles:${key.user_id}`;
    case 'saved_practices':
    case 'practice_positions':
      if (!isCatalogId(key.practice_id) && !UUID.test(key.practice_id)) {
        throw new RangeError(
          `practice_id must be a catalog id or a lowercase UUID, got "${key.practice_id}"`,
        );
      }
      return `v1:${key.table}:${key.user_id}:${key.practice_id}`;
    case 'deity_defaults':
      assertCatalogId(key.deity_id, 'deity_id');
      return `v1:deity_defaults:${key.user_id}:${key.deity_id}`;
  }
}

export function derivedId(key: DerivedIdKey): string {
  return uuidv5(DERIVED_ID_NAMESPACE, nameFor(key));
}

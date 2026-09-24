/**
 * Packs as files, and the manifest that lists them. Pure: the build writes
 * them. A pack's path carries its hash, so new content always gets a new
 * name and no cache can serve an old pack under it.
 * See docs/architecture/content-pipeline.md#packs.
 */

import { createHash } from 'node:crypto';
import { PACK_SCHEMA_VERSION, type Channel, type Manifest, type Pack } from '@japadhyan/shared';

import { canonicalJson } from './canonical';

export interface PackFile {
  id: string;
  /** Relative to the channel folder: `packs/<id>.<first 16 hex of sha256>.json`. */
  path: string;
  bytes: Uint8Array;
}

/** Hex digits of the SHA-256 a pack's path carries. */
const PATH_HASH_LENGTH = 16;

/** Each pack as canonical JSON, at its content-addressed path, in the order given. */
export function packFiles(packs: readonly Pack[]): PackFile[] {
  return packs.map((pack) => {
    const bytes = canonicalJson(pack);
    const hash = sha256(bytes).slice(0, PATH_HASH_LENGTH);
    return { id: pack.id, path: `packs/${pack.id}.${hash}.json`, bytes };
  });
}

/** The manifest of these files, sorted by id. */
export function manifestOf(
  files: readonly PackFile[],
  channel: Channel,
  release: number,
): Manifest {
  return {
    schema_version: PACK_SCHEMA_VERSION,
    channel,
    release,
    packs: [...files]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(({ id, path, bytes }) => ({ id, path, bytes: bytes.length, sha256: sha256(bytes) })),
  };
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

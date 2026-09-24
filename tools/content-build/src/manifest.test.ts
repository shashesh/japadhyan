import { createHash } from 'node:crypto';
import { manifestSchema, type Pack } from '@japadhyan/shared';
import { describe, expect, test } from 'vitest';

import { canonicalJson } from './canonical';
import { manifestOf, packFiles } from './manifest';

const programs: Pack = { id: 'programs', schema_version: 1, programs: [] };
const index: Pack = { id: 'index', schema_version: 1, traditions: [], deities: [], practices: [] };
const core: Pack = { id: 'core', schema_version: 1, packs: [index, programs] };

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('packFiles', () => {
  test('a pack’s bytes are its canonical JSON', () => {
    const [file] = packFiles([programs]);

    expect(file!.bytes).toEqual(canonicalJson(programs));
  });

  test('a pack’s path is packs/<id>.<16 hex of its sha256>.json', () => {
    const files = packFiles([programs, core]);

    expect(files.map((f) => f.path)).toEqual([
      `packs/programs.${sha256(canonicalJson(programs)).slice(0, 16)}.json`,
      `packs/core.${sha256(canonicalJson(core)).slice(0, 16)}.json`,
    ]);
    expect(files.map((f) => f.id)).toEqual(['programs', 'core']);
  });

  test('a deity’s packs sit in folders named by the id', () => {
    const deity = {
      id: 'deity/shiva/lang/hi',
      schema_version: 1,
      language: 'hi',
      deity: { summary: null },
      practices: [],
    } as Pack;

    expect(packFiles([deity])[0]!.path).toMatch(
      /^packs\/deity\/shiva\/lang\/hi\.[0-9a-f]{16}\.json$/,
    );
  });
});

describe('manifestOf', () => {
  test('the manifest lists every pack sorted by id, with bytes and sha256 of the exact file', () => {
    const files = packFiles([programs, core, index]);

    const manifest = manifestOf(files, 'development', 0);

    expect(manifest).toEqual({
      schema_version: 1,
      channel: 'development',
      release: 0,
      packs: ['core', 'index', 'programs'].map((id) => {
        const file = files.find((f) => f.id === id)!;
        return { id, path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) };
      }),
    });
  });

  test('parses with the manifest schema', () => {
    const manifest = manifestOf(packFiles([programs, core, index]), 'production', 7);

    expect(manifestSchema.safeParse(manifest).error).toBeUndefined();
    expect(manifest.release).toBe(7);
  });

  test('bytes count UTF-8, not characters', () => {
    const tradition = {
      id: 'hindu',
      deity_label: { hi: 'देवता' },
      offering_label: { en: 'Offer' },
      default_round_size: 108,
      show_images_by_default: true,
    } as const;
    const withHindi: Pack = { ...index, traditions: [tradition] } as Pack;
    const [file] = packFiles([withHindi]);

    expect(manifestOf([file!], 'development', 0).packs[0]!.bytes).toBe(
      Buffer.byteLength(new TextDecoder().decode(file!.bytes)),
    );
  });
});

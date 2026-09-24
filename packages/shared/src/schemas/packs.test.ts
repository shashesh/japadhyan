import { describe, expect, test } from 'vitest';
import type { z } from 'zod';

import { PACK_SCHEMA_VERSION } from '../constants';
import type {
  CorePack,
  DeityPack,
  IndexPack,
  LanguagePack,
  Manifest,
  ManifestSignature,
  ProgramsPack,
  ScriptPack,
} from '../types';
import {
  deity,
  exportMantra,
  exportNamavali,
  hindu,
  issuePaths,
  navaratri,
  SHA,
} from './catalog.fixtures';
import { manifestSchema, manifestSignatureSchema, packIdSchema, packSchemas } from './packs';

// Both directions, so no schema can drift from its type.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Output<S extends z.ZodType> = z.output<S>;
const contract: [
  Same<Output<typeof packSchemas.index>, IndexPack>,
  Same<Output<typeof packSchemas.programs>, ProgramsPack>,
  Same<Output<typeof packSchemas.deity>, DeityPack>,
  Same<Output<typeof packSchemas.script>, ScriptPack>,
  Same<Output<typeof packSchemas.language>, LanguagePack>,
  Same<Output<typeof packSchemas.core>, CorePack>,
  Same<Output<typeof manifestSchema>, Manifest>,
  Same<Output<typeof manifestSignatureSchema>, ManifestSignature>,
] = [true, true, true, true, true, true, true, true];
void contract;

const V = PACK_SCHEMA_VERSION;

function indexPack(): Record<string, unknown> {
  const { id, tradition_id, parent_id, names, featured_practice_id, sort_order } = deity();
  return {
    id: 'index',
    schema_version: V,
    traditions: [hindu()],
    deities: [
      {
        id,
        tradition_id,
        parent_id,
        names,
        featured_practice_id,
        sort_order,
        pack_id: 'deity/shailaputri',
      },
    ],
    practices: [
      {
        id: 'om-namah-shivaya',
        version: 1,
        tradition_id: 'hindu',
        deity_ids: ['shiva'],
        kind: 'mantra',
        title: { en: 'Om Namah Shivaya', hi: 'ॐ नमः शिवाय' },
        step_count: 1,
        pack_id: 'deity/shiva',
        has_audio: false,
        reviewed: true,
      },
    ],
  };
}

function programsPack(): Record<string, unknown> {
  return { id: 'programs', schema_version: V, programs: [navaratri()] };
}

function deityPack(): Record<string, unknown> {
  const shiva = { ...deity(), id: 'shiva', parent_id: null };
  return {
    id: 'deity/shiva',
    schema_version: V,
    deity: shiva,
    practices: [exportMantra(), { ...exportNamavali(), deity_ids: ['shiva'] }],
  };
}

function scriptPack(): Record<string, unknown> {
  return {
    id: 'deity/shiva/script/tamil',
    schema_version: V,
    script: 'tamil',
    practices: [
      {
        id: 'om-namah-shivaya',
        version: 1,
        steps: [{ text: 'ஓம் நம꞉ ஶிவாய', words: ['ஓம்', 'நம꞉', 'ஶிவாய'], name: null }],
      },
    ],
  };
}

function languagePack(): Record<string, unknown> {
  return {
    id: 'deity/shiva/lang/hi',
    schema_version: V,
    language: 'hi',
    deity: { summary: 'कल्याणकारी, ध्यान के स्वामी।' },
    practices: [
      {
        id: 'om-namah-shivaya',
        version: 1,
        title: 'ॐ नमः शिवाय',
        subtitle: null,
        repetition_word: 'जप',
        intro: null,
        steps: [{ meaning: null }],
      },
    ],
  };
}

function corePack(): Record<string, unknown> {
  return {
    id: 'core',
    schema_version: V,
    packs: [indexPack(), programsPack(), deityPack(), scriptPack(), languagePack()],
  };
}

const HASH = SHA.slice(0, 16);

function entry(id: string): Record<string, unknown> {
  return { id, path: `packs/${id}.${HASH}.json`, bytes: 100, sha256: SHA };
}

function manifest(): Record<string, unknown> {
  return {
    schema_version: V,
    channel: 'production',
    release: 3,
    packs: [entry('core'), entry('deity/shiva'), entry('deity/shiva/lang/pt-BR'), entry('index')],
  };
}

const SIGNATURE = `${'A'.repeat(85)}g==`;

function signature(): Record<string, unknown> {
  return { algorithm: 'ed25519', key_id: '0123456789abcdef', signature: SIGNATURE };
}

const kinds = [
  ['index', packSchemas.index, indexPack],
  ['programs', packSchemas.programs, programsPack],
  ['deity', packSchemas.deity, deityPack],
  ['script', packSchemas.script, scriptPack],
  ['language', packSchemas.language, languagePack],
  ['core', packSchemas.core, corePack],
] as const;

describe('pack schemas', () => {
  test.each(kinds)('accept a %s pack', (_, schema, pack) => {
    expect(issuePaths(schema.safeParse(pack()))).toEqual([]);
  });

  test.each(kinds)('reject a %s pack from a newer schema version', (_, schema, pack) => {
    expect(schema.safeParse({ ...pack(), schema_version: V + 1 }).success).toBe(false);
  });

  test.each(kinds)('drop fields they do not know, so an older app reads a %s pack', (_, s, p) => {
    expect(s.parse({ ...p(), added_later: true })).not.toHaveProperty('added_later');
  });

  test('a deity pack is named after its deity', () => {
    const result = packSchemas.deity.safeParse({ ...deityPack(), id: 'deity/vishnu' });

    expect(issuePaths(result)).toEqual(['id']);
  });

  test('a deity pack holds only practices whose primary deity it is', () => {
    const krishna = { ...exportMantra(), deity_ids: ['krishna', 'shiva'] };
    const result = packSchemas.deity.safeParse({ ...deityPack(), practices: [krishna] });

    expect(issuePaths(result)).toEqual(['practices.0.deity_ids.0']);
  });

  test('a script pack carries each step as plain strings, not maps by script', () => {
    const [practice] = scriptPack().practices as { steps: unknown[] }[];
    const byScript = { ...practice, steps: [{ text: { tamil: 'ஓம்' }, words: null, name: null }] };

    expect(packSchemas.script.safeParse({ ...scriptPack(), practices: [byScript] }).success).toBe(
      false,
    );
  });

  test.each(['latin', 'iast'])('there is no %s add-on: the base pack carries it', (base) => {
    const result = packSchemas.script.safeParse({
      ...scriptPack(),
      id: `deity/shiva/script/${base}`,
      script: base,
    });

    expect(result.success).toBe(false);
  });

  test('a script pack is named after its script', () => {
    const result = packSchemas.script.safeParse({ ...scriptPack(), script: 'telugu' });

    expect(issuePaths(result)).toEqual(['script']);
  });

  test('an add-on has an add-on id of its own kind', () => {
    const asLanguage = { ...scriptPack(), id: 'deity/shiva/lang/hi' };
    const asBase = { ...languagePack(), id: 'deity/shiva' };

    expect(issuePaths(packSchemas.script.safeParse(asLanguage))).toEqual(['id']);
    expect(issuePaths(packSchemas.language.safeParse(asBase))).toEqual(['id']);
  });

  test('a language pack is named after its language', () => {
    const result = packSchemas.language.safeParse({ ...languagePack(), language: 'ne' });

    expect(issuePaths(result)).toEqual(['language']);
  });

  test('a missing text in a language pack is null, never blank', () => {
    const [practice] = languagePack().practices as Record<string, unknown>[];
    const blank = { ...practice, intro: ' ' };

    expect(packSchemas.language.safeParse({ ...languagePack(), practices: [blank] }).success).toBe(
      false,
    );
  });

  test('the index points each deity and practice at its primary deity’s pack', () => {
    const index = indexPack();
    const [shailaputri] = index.deities as Record<string, unknown>[];
    const [mantra] = index.practices as Record<string, unknown>[];
    const result = packSchemas.index.safeParse({
      ...index,
      deities: [{ ...shailaputri, pack_id: 'deity/durga' }],
      practices: [{ ...mantra, pack_id: 'deity/vishnu' }],
    });

    expect(issuePaths(result)).toEqual(['deities.0.pack_id', 'practices.0.pack_id']);
  });

  test('an index practice has at least one step', () => {
    const [mantra] = indexPack().practices as Record<string, unknown>[];
    const result = packSchemas.index.safeParse({
      ...indexPack(),
      practices: [{ ...mantra, step_count: 0 }],
    });

    expect(result.success).toBe(false);
  });

  test('core holds each pack once, and never another core', () => {
    const twice = { ...corePack(), packs: [indexPack(), indexPack()] };
    const nested = { ...corePack(), packs: [indexPack(), corePack()] };

    expect(issuePaths(packSchemas.core.safeParse(twice))).toEqual(['packs.1.id']);
    expect(packSchemas.core.safeParse(nested).success).toBe(false);
  });

  test('any pack is read by its own schema', () => {
    for (const [, schema, pack] of kinds) {
      expect(packSchemas.any.parse(pack())).toEqual(schema.parse(pack()));
    }
  });
});

describe('packIdSchema', () => {
  test.each([
    'index',
    'programs',
    'core',
    'deity/shiva',
    'deity/shiva/script/tamil',
    'deity/shiva/lang/hi',
    'deity/shiva/lang/pt-BR',
  ])('accepts %s', (id) => {
    expect(packIdSchema.safeParse(id).success).toBe(true);
  });

  test.each([
    'deity',
    'deity/',
    'deity/Shiva',
    'deity/shiva/script/klingon',
    'deity/shiva/lang/english',
    'deity/shiva/audio/x',
    'deity/shiva/script/latin',
    'deity/shiva/script/iast',
    'deity/0192f8e4-7c1a-7b3e-9d4f-2a6b8c0d1e2f',
    'deity/0192f8e4-7c1a-7b3e-9d4f-2a6b8c0d1e2f/script/tamil',
    'deity/../core',
    'other',
  ])('rejects %s', (id) => {
    expect(packIdSchema.safeParse(id).success).toBe(false);
  });
});

describe('manifestSchema', () => {
  test('accepts a manifest', () => {
    expect(issuePaths(manifestSchema.safeParse(manifest()))).toEqual([]);
  });

  test('drops fields it does not know', () => {
    expect(manifestSchema.parse({ ...manifest(), added_later: 1 })).not.toHaveProperty(
      'added_later',
    );
  });

  test.each([
    ['sha256', 'A'.repeat(64)],
    ['sha256', 'a'.repeat(63)],
    ['bytes', 0],
    ['bytes', 1.5],
  ])('rejects an entry with %s = %j', (field, value) => {
    const packs = [{ ...entry('core'), [field]: value }];

    expect(manifestSchema.safeParse({ ...manifest(), packs }).success).toBe(false);
  });

  test.each([
    `packs/../core.${HASH}.json`,
    `packs/deity/../../core.${HASH}.json`,
    `/packs/core.${HASH}.json`,
    `C:/packs/core.${HASH}.json`,
    `packs\\core.${HASH}.json`,
    `packs//core.${HASH}.json`,
    `packs/core.json`,
    `packs/core.${HASH}.json.gz`,
    `core.${HASH}.json`,
  ])('rejects the path %s, so no path can leave the pack folder', (path) => {
    const packs = [{ ...entry('core'), path }];

    expect(manifestSchema.safeParse({ ...manifest(), packs }).success).toBe(false);
  });

  test('a path is the pack id and the start of its sha256', () => {
    const otherId = { ...entry('core'), path: `packs/index.${HASH}.json` };
    const otherHash = { ...entry('core'), path: `packs/core.${'b'.repeat(16)}.json` };

    expect(issuePaths(manifestSchema.safeParse({ ...manifest(), packs: [otherId] }))).toEqual([
      'packs.0.path',
    ]);
    expect(issuePaths(manifestSchema.safeParse({ ...manifest(), packs: [otherHash] }))).toEqual([
      'packs.0.path',
    ]);
  });

  test('packs are sorted by id, each once', () => {
    const unsorted = [entry('index'), entry('core')];
    const repeated = [entry('core'), entry('core')];

    expect(issuePaths(manifestSchema.safeParse({ ...manifest(), packs: unsorted }))).toEqual([
      'packs.1.id',
    ]);
    expect(issuePaths(manifestSchema.safeParse({ ...manifest(), packs: repeated }))).toEqual([
      'packs.1.id',
    ]);
  });

  test.each([
    ['release', -1],
    ['release', 1.5],
    ['channel', 'staging'],
    ['schema_version', V + 1],
  ])('rejects %s = %j', (field, value) => {
    expect(manifestSchema.safeParse({ ...manifest(), [field]: value }).success).toBe(false);
  });

  test('accepts release 0, which development builds use', () => {
    expect(manifestSchema.safeParse({ ...manifest(), release: 0 }).success).toBe(true);
  });
});

describe('manifestSignatureSchema', () => {
  test('accepts an Ed25519 signature', () => {
    expect(manifestSignatureSchema.safeParse(signature()).success).toBe(true);
  });

  test.each([
    ['algorithm', 'rsa'],
    ['key_id', '0123456789ABCDEF'],
    ['key_id', '0123'],
    ['signature', 'A'.repeat(88)],
    ['signature', `${'A'.repeat(84)}g===`],
    ['signature', `${'!'.repeat(86)}==`],
  ])('rejects %s = %j', (field, value) => {
    expect(manifestSignatureSchema.safeParse({ ...signature(), [field]: value }).success).toBe(
      false,
    );
  });
});

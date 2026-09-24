/**
 * Runtime schemas for packs and the manifest, in the export form only: the
 * content build checks every pack against them before writing it, and the
 * app reads packs with them. Unknown fields are dropped, so an older app can
 * read a pack with fields added later; a different `schema_version` is not.
 * The types in `../types/packs` stay the contract; the tests check the two
 * can't drift apart. See docs/architecture/content-pipeline.md#packs.
 */

import { z } from 'zod';

import { PACK_SCHEMA_VERSION } from '../constants/packs';
import { catalogIdSchema, exportSchemas } from './catalog';
import {
  LANGUAGE_TAG,
  LANGUAGE_TAG_PATTERN,
  nonBlank,
  nonNegativeInt,
  positiveInt,
  script,
  sha256,
} from './primitives';

const schemaVersion = z.literal(PACK_SCHEMA_VERSION);

/** The base pack carries the source script, IAST and `latin`, so no add-on does. */
const addOnScript = script.exclude(['latin', 'iast'], {
  error: '`latin` and `iast` are in the base pack, never an add-on',
});

const CATALOG_ID = '[a-z0-9-]+';
const PACK_ID = `index|programs|core|deity/(${CATALOG_ID})(?:/script/(?:${addOnScript.options.join('|')})|/lang/${LANGUAGE_TAG_PATTERN})?`;

/**
 * A pack's id. Letters, digits, hyphens and `/` only, so it is safe in a
 * path, and a deity's id is a catalog id, never shaped like a UUID.
 */
export const packIdSchema = z
  .string()
  .regex(new RegExp(`^(?:${PACK_ID})$`), 'Not a pack id')
  .refine((id) => {
    const deityId = new RegExp(`^(?:${PACK_ID})$`).exec(id)?.[1];
    return deityId === undefined || catalogIdSchema.safeParse(deityId).success;
  }, 'Not a catalog id');

const deityPackId = (deityId: string) => `deity/${deityId}`;

const deityShape = exportSchemas.deity.shape;
const indexDeity = z
  .object({
    id: deityShape.id,
    tradition_id: deityShape.tradition_id,
    parent_id: deityShape.parent_id,
    names: deityShape.names,
    featured_practice_id: deityShape.featured_practice_id,
    sort_order: deityShape.sort_order,
    pack_id: packIdSchema,
  })
  .superRefine((d, ctx) => {
    if (d.pack_id !== deityPackId(d.id)) {
      ctx.addIssue({ code: 'custom', path: ['pack_id'], message: `Not \`${deityPackId(d.id)}\`` });
    }
  });

const practiceShape = exportSchemas.practice.options[0].shape;
const indexPractice = z
  .object({
    id: practiceShape.id,
    version: practiceShape.version,
    tradition_id: practiceShape.tradition_id,
    deity_ids: practiceShape.deity_ids,
    kind: z.enum(['mantra', 'namavali', 'stotra']),
    title: practiceShape.title,
    step_count: positiveInt,
    pack_id: packIdSchema,
    has_audio: z.boolean(),
    reviewed: z.boolean(),
  })
  .superRefine((p, ctx) => {
    const expected = deityPackId(p.deity_ids[0]!);
    if (p.pack_id !== expected) {
      ctx.addIssue({ code: 'custom', path: ['pack_id'], message: `Not \`${expected}\`` });
    }
  });

const index = z.object({
  id: z.literal('index'),
  schema_version: schemaVersion,
  traditions: z.array(exportSchemas.tradition).readonly(),
  deities: z.array(indexDeity).readonly(),
  practices: z.array(indexPractice).readonly(),
});

const programs = z.object({
  id: z.literal('programs'),
  schema_version: schemaVersion,
  programs: z.array(exportSchemas.program).readonly(),
});

const deity = z
  .object({
    id: packIdSchema,
    schema_version: schemaVersion,
    deity: exportSchemas.deity,
    practices: z.array(exportSchemas.practice).readonly(),
  })
  .superRefine((pack, ctx) => {
    if (pack.id !== deityPackId(pack.deity.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['id'],
        message: `Not \`${deityPackId(pack.deity.id)}\``,
      });
    }
    pack.practices.forEach((p, i) => {
      if (p.deity_ids[0] !== pack.deity.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['practices', i, 'deity_ids', 0],
          message: `Belongs in the pack of its primary deity, \`${deityPackId(p.deity_ids[0]!)}\``,
        });
      }
    });
  });

/** An add-on's id must end in the script or language it says it carries. */
function checkAddOn<F extends 'script' | 'language'>(kind: 'script' | 'lang', field: F) {
  const pattern = new RegExp(`^deity/${CATALOG_ID}/${kind}/(.+)$`);
  return (pack: { id: string } & Record<F, string>, ctx: z.RefinementCtx) => {
    const named = pattern.exec(pack.id)?.[1];
    if (named === undefined) {
      ctx.addIssue({ code: 'custom', path: ['id'], message: `Not a \`${kind}\` pack id` });
    } else if (named !== pack[field]) {
      ctx.addIssue({ code: 'custom', path: [field], message: `The pack id says \`${named}\`` });
    }
  };
}

const addOnPractice = { id: exportSchemas.practice.options[0].shape.id, version: positiveInt };

const scriptPack = z
  .object({
    id: packIdSchema,
    schema_version: schemaVersion,
    script: addOnScript,
    practices: z
      .array(
        z.object({
          ...addOnPractice,
          steps: z
            .array(
              z.object({
                text: nonBlank,
                words: z.array(nonBlank).min(1).readonly().nullable(),
                name: nonBlank.nullable(),
              }),
            )
            .min(1)
            .readonly(),
        }),
      )
      .readonly(),
  })
  .superRefine(checkAddOn('script', 'script'));

const languagePack = z
  .object({
    id: packIdSchema,
    schema_version: schemaVersion,
    language: z.string().regex(LANGUAGE_TAG, 'Not a language tag'),
    deity: z.object({ summary: nonBlank.nullable() }),
    practices: z
      .array(
        z.object({
          ...addOnPractice,
          title: nonBlank.nullable(),
          subtitle: nonBlank.nullable(),
          repetition_word: nonBlank.nullable(),
          intro: nonBlank.nullable(),
          steps: z
            .array(z.object({ meaning: nonBlank.nullable() }))
            .min(1)
            .readonly(),
        }),
      )
      .readonly(),
  })
  .superRefine(checkAddOn('lang', 'language'));

const bundled = z.union([index, programs, deity, scriptPack, languagePack]);

const core = z
  .object({
    id: z.literal('core'),
    schema_version: schemaVersion,
    packs: z.array(bundled).readonly(),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.packs.forEach(({ id }, i) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['packs', i, 'id'],
          message: `\`${id}\` is here twice`,
        });
      }
      seen.add(id);
    });
  });

/** One schema per kind of pack, and `any` for a pack of unknown kind. */
export const packSchemas = {
  index,
  programs,
  deity,
  script: scriptPack,
  language: languagePack,
  core,
  any: z.union([index, programs, deity, scriptPack, languagePack, core]),
};

const PACK_PATH = new RegExp(`^packs/(?:${PACK_ID})\\.[0-9a-f]{16}\\.json$`);

const manifestEntry = z
  .object({
    id: packIdSchema,
    path: z.string().regex(PACK_PATH, 'Not `packs/<id>.<hash>.json`'),
    bytes: positiveInt,
    sha256,
  })
  .superRefine((entry, ctx) => {
    const expected = `packs/${entry.id}.${entry.sha256.slice(0, 16)}.json`;
    if (entry.path !== expected) {
      ctx.addIssue({ code: 'custom', path: ['path'], message: `Not \`${expected}\`` });
    }
  });

/** `manifest.json`. Paths can't leave the pack folder: see `PACK_PATH`. */
export const manifestSchema = z
  .object({
    schema_version: schemaVersion,
    channel: z.enum(['development', 'production']),
    release: nonNegativeInt,
    packs: z.array(manifestEntry).readonly(),
  })
  .superRefine((manifest, ctx) => {
    manifest.packs.forEach(({ id }, i) => {
      const previous = manifest.packs[i - 1]?.id;
      if (previous !== undefined && !(previous < id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['packs', i, 'id'],
          message: 'Packs are sorted by id, each once',
        });
      }
    });
  });

/** `manifest.sig.json`. A 64-byte signature is 86 base64 digits and `==`. */
export const manifestSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  key_id: z.string().regex(/^[0-9a-f]{16}$/, 'Not 16 lowercase hex digits'),
  signature: z.string().regex(/^[A-Za-z0-9+/]{85}[AQgw]==$/, 'Not a base64 Ed25519 signature'),
});

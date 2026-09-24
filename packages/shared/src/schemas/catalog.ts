/**
 * Runtime schemas for the catalog, in two forms:
 *
 * - **content** — what is authored in `content/` as YAML. Strict: an unknown
 *   field is a typo, and scripts the build generates may not be written by
 *   hand. A practice's step text, words and names carry the master scripts —
 *   the source script and IAST — and may carry a hand-written `latin`, which
 *   the build uses instead of generating one.
 * - **export** — what packs carry and the app reads. Unknown fields are
 *   dropped, so an older app can read a pack with fields added later. A
 *   practice's step text, words and names carry at least the source script,
 *   IAST and `latin`.
 *
 * A deity's names are exempt: a deity has no source script. They are written
 * by hand per language, each in the scripts that language uses.
 *
 * Both parse to the types in `../types/catalog`, which stay the contract; the
 * tests check the two can't drift apart. Checks that span files — a deity's
 * parent exists, a practice's deities exist, versions only go up — belong to
 * the content build. See docs/architecture/content-pipeline.md.
 */

import { z } from 'zod';

import type { Script } from '../types';
import {
  languageTag,
  nonBlank,
  nonNegativeInt,
  positiveInt,
  script,
  sha256,
  traditionId,
} from './primitives';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A catalog id: lowercase letters, digits and hyphens. Never shaped like a
 * UUID, which is what a custom practice's id looks like, so a `practice_id`
 * can always tell the two apart. The derived ids rely on it having no `:`.
 */
export const catalogIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and hyphens only')
  .refine((id) => !UUID.test(id), 'A catalog id must not look like a UUID');

const textByScript = z.partialRecord(script, nonBlank);
const wordsByScript = z.partialRecord(script, z.array(nonBlank).min(1).readonly());
const textByLanguage = z.partialRecord(languageTag, nonBlank);

const notEmpty = (map: object) => Object.keys(map).length > 0;
/** Required text, or optional text that is `null` when absent — never `{}`. */
const someLanguage = textByLanguage.refine(notEmpty, 'Needs at least one language');

const date = z.iso.date();

type Mode = 'content' | 'export';

function buildSchemas(mode: Mode) {
  // Strict and stripping objects parse to the same type; only unknown keys
  // are treated differently. The cast keeps one set of shapes for both.
  const object = <S extends z.ZodRawShape>(shape: S) =>
    (mode === 'content' ? z.strictObject(shape) : z.object(shape)) as z.ZodObject<S>;

  const image = object({ id: nonBlank, sha256, bytes: positiveInt });
  const audio = object({ id: nonBlank, sha256, bytes: positiveInt, duration_ms: positiveInt });

  const tradition = object({
    id: traditionId,
    deity_label: someLanguage,
    offering_label: someLanguage,
    default_round_size: positiveInt,
    show_images_by_default: z.boolean(),
  });

  const deity = object({
    id: catalogIdSchema,
    tradition_id: traditionId,
    parent_id: catalogIdSchema.nullable(),
    names: z.partialRecord(languageTag, textByScript.refine(notEmpty)).refine(notEmpty),
    summary: textByLanguage,
    image: image.nullable(),
    suggested_mala: nonBlank.nullable(),
    featured_practice_id: catalogIdSchema.nullable(),
    sort_order: z.number().int(),
  }).superRefine((d, ctx) => {
    if (d.parent_id === d.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['parent_id'],
        message: 'A deity is not its own parent',
      });
    }
  });

  const stepAudio = {
    audio_start_ms: nonNegativeInt.nullable(),
    audio_end_ms: nonNegativeInt.nullable(),
  };
  const mantraStep = object({
    text: textByScript,
    words: wordsByScript.nullable(),
    name: z.null(),
    meaning: z.null(),
    ...stepAudio,
  });
  const namavaliStep = object({
    text: textByScript,
    words: z.null(),
    name: textByScript,
    meaning: someLanguage.nullable(),
    ...stepAudio,
  });
  const stotraStep = object({
    text: textByScript,
    words: z.null(),
    name: z.null(),
    meaning: someLanguage.nullable(),
    ...stepAudio,
  });

  const practiceBase = {
    id: catalogIdSchema,
    version: positiveInt,
    tradition_id: traditionId,
    deity_ids: z
      .array(catalogIdSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'A deity is listed twice')
      .readonly(),
    title: someLanguage,
    subtitle: textByLanguage,
    source_script: script.exclude(['latin'], {
      error: '`latin` is generated, so it is never the source script',
    }),
    repetition_word: someLanguage,
    intro: textByLanguage,
    audio: audio.nullable(),
    source: nonBlank,
    licence: nonBlank,
    review: object({ advisor: nonBlank, reviewed_on: date }).nullable(),
  };

  const practice = z
    .discriminatedUnion('kind', [
      object({
        ...practiceBase,
        kind: z.literal('mantra'),
        steps: z.tuple([mantraStep]).readonly(),
        default_round: positiveInt,
      }),
      object({
        ...practiceBase,
        kind: z.literal('namavali'),
        steps: z.array(namavaliStep).min(1).readonly(),
        default_round: z.literal(1),
      }),
      object({
        ...practiceBase,
        kind: z.literal('stotra'),
        steps: z.array(stotraStep).min(1).readonly(),
        default_round: positiveInt,
      }),
    ])
    .superRefine((p, ctx) => {
      const master = [...new Set<Script>([p.source_script, 'iast'])];
      const required = mode === 'content' ? master : [...new Set<Script>([...master, 'latin'])];
      // A hand-written `latin` overrides the generated one.
      const authored = [...master, 'latin'];

      const checkScripts = (map: object | null, path: PropertyKey[]) => {
        if (map === null) return;
        const present = Object.keys(map) as Script[];
        const missing = required.filter((s) => !present.includes(s));
        const generated = mode === 'content' ? present.filter((s) => !authored.includes(s)) : [];
        if (missing.length > 0) {
          ctx.addIssue({ code: 'custom', path, message: `Missing ${quoted(missing)}` });
        }
        if (generated.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `${quoted(generated)} generated at build time; write only ${quoted(master)}`,
          });
        }
      };

      p.steps.forEach((step, i) => {
        checkScripts(step.text, ['steps', i, 'text']);
        checkScripts(step.words, ['steps', i, 'words']);
        checkScripts(step.name, ['steps', i, 'name']);
        checkAudioSpan(step, p.audio?.duration_ms ?? null, ['steps', i], ctx);
      });
    });

  const program = object({
    id: catalogIdSchema,
    kind: z.enum(['sankalpa_template', 'festival']),
    duration: positiveInt,
    days: z
      .array(
        object({
          day: positiveInt,
          practice_id: catalogIdSchema,
          target: positiveInt.nullable(),
          reading: someLanguage.nullable(),
        }),
      )
      .min(1, 'Write a program with no per-day plan as `days: null`')
      .readonly()
      .nullable(),
  }).superRefine((p, ctx) => {
    const seen = new Set<number>();
    p.days?.forEach(({ day }, i) => {
      const path = ['days', i, 'day'];
      if (day > p.duration) {
        ctx.addIssue({ code: 'custom', path, message: `Day ${day} is after the last day` });
      } else if (seen.has(day)) {
        ctx.addIssue({ code: 'custom', path, message: `Day ${day} is planned twice` });
      }
      seen.add(day);
    });
  });

  return { tradition, deity, practice, program };
}

const quoted = (scripts: readonly Script[]) => scripts.map((s) => `\`${s}\``).join(', ');

/** A step's place in the recording: both ends or neither, inside the recording. */
function checkAudioSpan(
  step: { audio_start_ms: number | null; audio_end_ms: number | null },
  durationMs: number | null,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  const { audio_start_ms: start, audio_end_ms: end } = step;
  if (start === null && end === null) return;

  const issue = (field: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [...path, field], message });

  if (durationMs === null) {
    issue('audio_start_ms', 'A position in the recording, but the practice has no recording');
  } else if (start === null || end === null) {
    issue(
      start === null ? 'audio_start_ms' : 'audio_end_ms',
      'Set both ends of the span, or neither',
    );
  } else if (start >= end) {
    issue('audio_end_ms', 'The span must end after it starts');
  } else if (end > durationMs) {
    issue('audio_end_ms', 'The span ends after the recording');
  }
}

/** The catalog as authored in `content/`. */
export const contentSchemas = buildSchemas('content');

/** The catalog as packs carry it and the app reads it. */
export const exportSchemas = buildSchemas('export');

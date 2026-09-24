/**
 * Turns the catalog, with every generated script, into the packs the app
 * reads. Pure: no files. See docs/architecture/content-pipeline.md#packs.
 *
 * - `deity/<id>`: the deity and the practices whose primary deity it is, in
 *   the source script, IAST and `latin`, and in English only.
 * - `deity/<id>/script/<script>`: one per other script its practices carry.
 * - `deity/<id>/lang/<language>`: one per other language it or its
 *   practices use. A deity's names aren't here: the index has them all.
 * - `index` and `programs`, and `core`, which holds every other pack.
 */

import {
  isReviewed,
  PACK_SCHEMA_VERSION,
  type AddOnScript,
  type BundledPack,
  type CorePack,
  type Deity,
  type DeityPack,
  type IndexPack,
  type LanguagePack,
  type LanguageTag,
  type Pack,
  type Practice,
  type ProgramsPack,
  type Script,
  type ScriptPack,
  type TextByLanguage,
  type TextByScript,
} from '@japadhyan/shared';

import type { Catalog } from './validate';

export interface BuiltCatalog {
  catalog: Catalog;
  /** Generated: every script, as packs carry them. */
  practices: readonly Practice[];
}

/** The language base packs carry. Every other language is an add-on. */
const BASE_LANGUAGE = 'en';

const schema_version = PACK_SCHEMA_VERSION;

/** Every pack, sorted by id, with `core` last. */
export function buildPacks({ catalog, practices }: BuiltCatalog): Pack[] {
  const deities = sortById(catalog.deities);
  const sorted = sortById(practices);
  const practicesOf = (deity: Deity) => sorted.filter((p) => p.deity_ids[0] === deity.id);

  const bundled: BundledPack[] = sortById([
    indexPack(catalog, deities, sorted),
    programsPack(catalog),
    ...deities.flatMap((deity) => deityPacks(deity, practicesOf(deity))),
  ]);
  const core: CorePack = { id: 'core', schema_version, packs: bundled };
  return [...bundled, core];
}

const deityPackId = (deityId: string) => `deity/${deityId}`;

function indexPack(
  catalog: Catalog,
  deities: readonly Deity[],
  practices: readonly Practice[],
): IndexPack {
  return {
    id: 'index',
    schema_version,
    traditions: sortById(catalog.traditions),
    deities: deities.map((d) => ({
      id: d.id,
      tradition_id: d.tradition_id,
      parent_id: d.parent_id,
      names: d.names,
      featured_practice_id: d.featured_practice_id,
      sort_order: d.sort_order,
      pack_id: deityPackId(d.id),
    })),
    practices: practices.map((p) => ({
      id: p.id,
      version: p.version,
      tradition_id: p.tradition_id,
      deity_ids: p.deity_ids,
      kind: p.kind,
      title: p.title,
      step_count: p.steps.length,
      pack_id: deityPackId(p.deity_ids[0]!),
      has_audio: p.audio !== null,
      reviewed: isReviewed(p),
    })),
  };
}

function programsPack(catalog: Catalog): ProgramsPack {
  return { id: 'programs', schema_version, programs: sortById(catalog.programs) };
}

/** A deity's base pack, and its script and language add-ons. */
function deityPacks(deity: Deity, practices: readonly Practice[]): BundledPack[] {
  const base: DeityPack = {
    id: deityPackId(deity.id),
    schema_version,
    deity: {
      ...deity,
      names: onlyBase(deity.names),
      summary: onlyBase(deity.summary),
    },
    practices: practices.map(basePractice),
  };
  return [
    base,
    ...addOnScripts(practices).map((script) => scriptPack(deity, practices, script)),
    ...addOnLanguages(deity, practices).map((language) => languagePack(deity, practices, language)),
  ];
}

/** The practice in its master scripts and `latin`, and in English. */
function basePractice(practice: Practice): Practice {
  const scripts = baseScripts(practice);
  const keep = (text: TextByScript) => pick(text, scripts);
  return {
    ...practice,
    title: onlyBase(practice.title),
    subtitle: onlyBase(practice.subtitle),
    repetition_word: onlyBase(practice.repetition_word),
    intro: onlyBase(practice.intro),
    steps: practice.steps.map((step) => ({
      ...step,
      text: keep(step.text),
      words: step.words && pick(step.words, scripts),
      name: step.name && keep(step.name),
      meaning: step.meaning && (BASE_LANGUAGE in step.meaning ? onlyBase(step.meaning) : null),
    })),
  } as Practice;
}

function baseScripts(practice: Practice): ReadonlySet<Script> {
  return new Set<Script>([practice.source_script, 'iast', 'latin']);
}

/** Scripts beyond the base ones that every step of the practice carries. */
function practiceAddOnScripts(practice: Practice): AddOnScript[] {
  const base = baseScripts(practice);
  const [first, ...rest] = practice.steps.map(
    (step) => new Set(Object.keys(step.text) as Script[]),
  );
  return [...first!]
    .filter((s) => !base.has(s) && rest.every((scripts) => scripts.has(s)))
    .map((s) => s as AddOnScript);
}

function addOnScripts(practices: readonly Practice[]): AddOnScript[] {
  return [...new Set(practices.flatMap(practiceAddOnScripts))].sort();
}

function scriptPack(deity: Deity, practices: readonly Practice[], script: AddOnScript): ScriptPack {
  return {
    id: `${deityPackId(deity.id)}/script/${script}`,
    schema_version,
    script,
    practices: practices
      .filter((p) => practiceAddOnScripts(p).includes(script))
      .map((p) => ({
        id: p.id,
        version: p.version,
        steps: p.steps.map((step) => ({
          text: step.text[script]!,
          words: step.words?.[script] ?? null,
          name: step.name?.[script] ?? null,
        })),
      })),
  };
}

/** The language fields of a practice, each once per language. */
function practiceTexts(practice: Practice): (TextByLanguage | null)[] {
  return [
    practice.title,
    practice.subtitle,
    practice.repetition_word,
    practice.intro,
    ...practice.steps.map((s) => s.meaning),
  ];
}

const languagesOf = (texts: readonly (TextByLanguage | null)[]) =>
  texts.flatMap((text) => Object.keys(text ?? {}));

function addOnLanguages(deity: Deity, practices: readonly Practice[]): LanguageTag[] {
  const used = languagesOf([deity.summary, ...practices.flatMap(practiceTexts)]);
  return [...new Set(used)].filter((l) => l !== BASE_LANGUAGE).sort();
}

function languagePack(
  deity: Deity,
  practices: readonly Practice[],
  language: LanguageTag,
): LanguagePack {
  const inLanguage = (text: TextByLanguage | null) => text?.[language] ?? null;
  return {
    id: `${deityPackId(deity.id)}/lang/${language}`,
    schema_version,
    language,
    deity: { summary: inLanguage(deity.summary) },
    practices: practices
      .filter((p) => languagesOf(practiceTexts(p)).includes(language))
      .map((p) => ({
        id: p.id,
        version: p.version,
        title: inLanguage(p.title),
        subtitle: inLanguage(p.subtitle),
        repetition_word: inLanguage(p.repetition_word),
        intro: inLanguage(p.intro),
        steps: p.steps.map((step) => ({ meaning: inLanguage(step.meaning) })),
      })),
  };
}

/** Only the base language's entry, or nothing. */
function onlyBase<T>(byLanguage: Partial<Record<LanguageTag, T>>): Partial<Record<LanguageTag, T>> {
  return pick(byLanguage, new Set([BASE_LANGUAGE]));
}

function pick<K extends string, V>(
  record: Partial<Record<K, V>>,
  keys: ReadonlySet<K>,
): Partial<Record<K, V>> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keys.has(key as K)),
  ) as Partial<Record<K, V>>;
}

function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

import {
  packSchemas,
  type CorePack,
  type Deity,
  type DeityPack,
  type IndexPack,
  type LanguagePack,
  type Pack,
  type Practice,
  type ScriptPack,
  type Tradition,
} from '@japadhyan/shared';
import { describe, expect, test } from 'vitest';

import { CONTENT_ROOT, readContentTree } from './files';
import { generatePractice } from './generate';
import { buildPacks, type BuiltCatalog } from './packs';
import { validateContent, type Catalog } from './validate';

const hindu: Tradition = {
  id: 'hindu',
  deity_label: { en: 'Deity', hi: 'देवता' },
  offering_label: { en: 'Offer at the lotus feet' },
  default_round_size: 108,
  show_images_by_default: true,
};

const deity = (id: string, extra: Partial<Deity> = {}): Deity => ({
  id,
  tradition_id: 'hindu',
  parent_id: null,
  names: { en: { latin: id } },
  summary: {},
  image: null,
  suggested_mala: null,
  featured_practice_id: null,
  sort_order: 0,
  ...extra,
});

const shiva = deity('shiva', {
  names: { en: { latin: 'Shiva' }, hi: { devanagari: 'शिव' } },
  summary: { en: 'The auspicious one', ta: 'மங்களமானவர்' },
  sort_order: 1,
});
const vishnu = deity('vishnu', {
  names: { en: { latin: 'Vishnu' } },
  summary: { en: 'Preserver' },
});
/** A deity with no practices yet. */
const ganesh = deity('ganesh');

/** Primary deity Shiva, also listed under Vishnu. Reviewed at its version. */
const mantra: Practice = {
  id: 'om-namah-shivaya',
  version: 1,
  tradition_id: 'hindu',
  kind: 'mantra',
  deity_ids: ['shiva', 'vishnu'],
  title: { en: 'Om Namah Shivaya', hi: 'ॐ नमः शिवाय' },
  subtitle: {},
  source_script: 'devanagari',
  steps: [
    {
      text: { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
      words: { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ', 'śivāya'] },
      name: null,
      meaning: null,
      audio_start_ms: 0,
      audio_end_ms: 4000,
    },
  ],
  default_round: 108,
  repetition_word: { en: 'japa', hi: 'जप' },
  intro: { en: 'The five-syllable mantra.' },
  audio: { id: 'a', sha256: 'a'.repeat(64), bytes: 1, duration_ms: 4000 },
  source: 'Traditional',
  licence: 'Public domain',
  review: { advisor: 'Advisor', reviewed_on: '2026-09-24', version: 1 },
};

const name = (devanagari: string, iast: string, text: [string, string], en: string) => ({
  text: { devanagari: text[0], iast: text[1] },
  words: null,
  name: { devanagari, iast },
  meaning: { en, hi: `${en} (हिन्दी)` },
  audio_start_ms: null,
  audio_end_ms: null,
});

/** Reviewed at an earlier version, so unreviewed now. */
const namavali: Practice = {
  id: 'vishnu-names',
  version: 3,
  tradition_id: 'hindu',
  kind: 'namavali',
  deity_ids: ['vishnu'],
  title: { en: 'Names of Vishnu' },
  subtitle: { en: 'Two names' },
  source_script: 'devanagari',
  steps: [
    name('केशव', 'keśava', ['ॐ केशवाय नमः', 'oṃ keśavāya namaḥ'], 'Of beautiful hair'),
    name('नारायण', 'nārāyaṇa', ['ॐ नारायणाय नमः', 'oṃ nārāyaṇāya namaḥ'], 'Refuge of all'),
  ],
  default_round: 1,
  repetition_word: { en: 'paath' },
  intro: {},
  audio: null,
  source: 'Traditional',
  licence: 'Public domain',
  review: { advisor: 'Advisor', reviewed_on: '2026-09-01', version: 2 },
};

const GENERATED_SCRIPTS = ['bengali', 'gujarati', 'kannada', 'tamil', 'telugu'];

function generated(catalog: Catalog): BuiltCatalog {
  const practices = catalog.practices.map((p) => {
    const { practice, issues } = generatePractice(p);
    expect(issues).toEqual([]);
    return practice;
  });
  return { catalog, practices };
}

const fixture = () =>
  generated({
    traditions: [hindu],
    deities: [vishnu, shiva, ganesh],
    practices: [namavali, mantra],
    programs: [],
  });

const byId = (packs: readonly Pack[], id: string) => {
  const pack = packs.find((p) => p.id === id);
  expect(pack, id).toBeDefined();
  return pack!;
};
const ids = (packs: readonly Pack[]) => packs.map((p) => p.id);

describe('buildPacks', () => {
  test('a practice goes in its primary deity’s pack only', () => {
    const packs = buildPacks(fixture());
    const practicesOf = (id: string) =>
      (byId(packs, `deity/${id}`) as DeityPack).practices.map((p) => p.id);

    expect(practicesOf('shiva')).toEqual(['om-namah-shivaya']);
    expect(practicesOf('vishnu')).toEqual(['vishnu-names']);
    expect(practicesOf('ganesh')).toEqual([]);
  });

  test('a base pack keeps only the source script, iast and latin', () => {
    const pack = byId(buildPacks(fixture()), 'deity/shiva') as DeityPack;
    const [step] = pack.practices[0]!.steps;
    const scripts = ['devanagari', 'iast', 'latin'];

    expect(Object.keys(step!.text).sort()).toEqual(scripts);
    expect(Object.keys(step!.words!).sort()).toEqual(scripts);
    expect(step!.text.latin).toBe('Om Namah Shivaya');

    const names = byId(buildPacks(fixture()), 'deity/vishnu') as DeityPack;
    expect(Object.keys(names.practices[0]!.steps[0]!.name!).sort()).toEqual(scripts);
  });

  test('a base pack keeps only en in language fields', () => {
    const packs = buildPacks(fixture());
    const shivaPack = byId(packs, 'deity/shiva') as DeityPack;
    const vishnuPack = byId(packs, 'deity/vishnu') as DeityPack;
    const practice = shivaPack.practices[0]!;

    expect(shivaPack.deity.names).toEqual({ en: { latin: 'Shiva' } });
    expect(shivaPack.deity.summary).toEqual({ en: 'The auspicious one' });
    expect(practice.title).toEqual({ en: 'Om Namah Shivaya' });
    expect(practice.repetition_word).toEqual({ en: 'japa' });
    expect(vishnuPack.practices[0]!.steps.map((s) => s.meaning)).toEqual([
      { en: 'Of beautiful hair' },
      { en: 'Refuge of all' },
    ]);
  });

  test('a meaning with no en is null in the base pack', () => {
    const [first, second] = namavali.steps;
    const hindiOnly = { ...second!, meaning: { hi: 'केवल हिन्दी' } };
    const built = generated({
      traditions: [hindu],
      deities: [vishnu],
      practices: [{ ...namavali, steps: [first!, hindiOnly] } as Practice],
      programs: [],
    });

    const pack = byId(buildPacks(built), 'deity/vishnu') as DeityPack;

    expect(pack.practices[0]!.steps[1]!.meaning).toBeNull();
  });

  test('one script pack per generated script per deity; none for a deity with no practices', () => {
    const packs = buildPacks(fixture());
    const scriptPacks = (deityId: string) =>
      ids(packs).filter((id) => id.startsWith(`deity/${deityId}/script/`));

    for (const deityId of ['shiva', 'vishnu']) {
      expect(scriptPacks(deityId)).toEqual(
        GENERATED_SCRIPTS.map((s) => `deity/${deityId}/script/${s}`),
      );
    }
    expect(scriptPacks('ganesh')).toEqual([]);
    const tamil = byId(packs, 'deity/shiva/script/tamil') as ScriptPack;
    expect(tamil.script).toBe('tamil');
  });

  test('one language pack per language other than en that a deity or its practices use', () => {
    const langPacks = ids(buildPacks(fixture())).filter((id) => id.includes('/lang/'));

    // Shiva: `hi` from the practice title, `ta` from the deity summary. Vishnu:
    // `hi` from the namavali's meanings. Names are in the index, so Shiva's
    // Hindi name alone makes no pack.
    expect(langPacks).toEqual([
      'deity/shiva/lang/hi',
      'deity/shiva/lang/ta',
      'deity/vishnu/lang/hi',
    ]);
  });

  test('a language pack carries the deity summary and each practice’s fields in that language', () => {
    const packs = buildPacks(fixture());
    const hi = byId(packs, 'deity/shiva/lang/hi') as LanguagePack;
    const ta = byId(packs, 'deity/shiva/lang/ta') as LanguagePack;

    expect(hi.language).toBe('hi');
    expect(hi.deity).toEqual({ summary: null });
    expect(hi.practices).toEqual([
      {
        id: 'om-namah-shivaya',
        version: 1,
        title: 'ॐ नमः शिवाय',
        subtitle: null,
        repetition_word: 'जप',
        intro: null,
        steps: [{ meaning: null }],
      },
    ]);
    expect(ta.deity).toEqual({ summary: 'மங்களமானவர்' });
    expect(ta.practices).toEqual([]);
  });

  test('script and language packs carry each practice’s version and one entry per step', () => {
    const packs = buildPacks(fixture());
    const telugu = byId(packs, 'deity/vishnu/script/telugu') as ScriptPack;
    const hindi = byId(packs, 'deity/vishnu/lang/hi') as LanguagePack;
    const shivaTamil = byId(packs, 'deity/shiva/script/tamil') as ScriptPack;
    const [generatedNames] = fixture().practices.filter((p) => p.id === 'vishnu-names');

    expect(telugu.practices).toEqual([
      {
        id: 'vishnu-names',
        version: 3,
        steps: generatedNames!.steps.map((s) => ({
          text: s.text.telugu,
          words: null,
          name: s.name!.telugu,
        })),
      },
    ]);
    expect(hindi.practices.map((p) => [p.id, p.version, p.steps])).toEqual([
      [
        'vishnu-names',
        3,
        [{ meaning: 'Of beautiful hair (हिन्दी)' }, { meaning: 'Refuge of all (हिन्दी)' }],
      ],
    ]);
    expect(shivaTamil.practices[0]!.steps[0]!.words).toHaveLength(3);
  });

  test('the index lists every deity and practice, with pack_id, step_count, has_audio and reviewed', () => {
    const index = byId(buildPacks(fixture()), 'index') as IndexPack;

    expect(index.traditions).toEqual([hindu]);
    expect(index.deities.map((d) => [d.id, d.pack_id])).toEqual([
      ['ganesh', 'deity/ganesh'],
      ['shiva', 'deity/shiva'],
      ['vishnu', 'deity/vishnu'],
    ]);
    expect(
      index.practices.map(({ id, pack_id, step_count, has_audio, reviewed, version, kind }) => ({
        id,
        pack_id,
        step_count,
        has_audio,
        reviewed,
        version,
        kind,
      })),
    ).toEqual([
      {
        id: 'om-namah-shivaya',
        pack_id: 'deity/shiva',
        step_count: 1,
        has_audio: true,
        reviewed: true,
        version: 1,
        kind: 'mantra',
      },
      {
        id: 'vishnu-names',
        pack_id: 'deity/vishnu',
        step_count: 2,
        has_audio: false,
        reviewed: false,
        version: 3,
        kind: 'namavali',
      },
    ]);
    expect(index.practices[0]!.deity_ids).toEqual(['shiva', 'vishnu']);
  });

  test('the index keeps every language of titles and names', () => {
    const index = byId(buildPacks(fixture()), 'index') as IndexPack;

    expect(index.deities.find((d) => d.id === 'shiva')!.names).toEqual(shiva.names);
    expect(index.practices.find((p) => p.id === 'om-namah-shivaya')!.title).toEqual(mantra.title);
  });

  test('programs go in the programs pack', () => {
    const packs = buildPacks(fixture());

    expect(byId(packs, 'programs')).toEqual({ id: 'programs', schema_version: 1, programs: [] });
  });

  test('core holds index, programs and every deity’s base, script and language packs', () => {
    const packs = buildPacks(fixture());
    const core = packs.at(-1) as CorePack;

    expect(core.id).toBe('core');
    expect(core.packs).toEqual(packs.slice(0, -1));
    expect(ids(packs.slice(0, -1))).toEqual([...ids(packs.slice(0, -1))].sort());
    expect(ids(packs.slice(0, -1))).toEqual(
      expect.arrayContaining(['index', 'programs', 'deity/ganesh', 'deity/shiva', 'deity/vishnu']),
    );
    expect(packs).toHaveLength(2 + 3 + 2 * GENERATED_SCRIPTS.length + 3 + 1);
  });

  test('every pack parses with its export schema', () => {
    for (const pack of buildPacks(fixture())) {
      expect(packSchemas.any.safeParse(pack).error, pack.id).toBeUndefined();
    }
  });

  // The repo's own catalog.
  test('every pack of content/ parses with its export schema', () => {
    const { catalog, issues } = validateContent(readContentTree(CONTENT_ROOT));
    expect(issues).toEqual([]);

    const packs = buildPacks(generated(catalog));

    expect(packs.length).toBeGreaterThan(3);
    for (const pack of packs) {
      expect(packSchemas.any.safeParse(pack).error, pack.id).toBeUndefined();
    }
  });
});

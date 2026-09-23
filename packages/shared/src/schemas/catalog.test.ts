import { describe, expect, test } from 'vitest';
import type { z } from 'zod';

import type { Deity, Practice, Program, Tradition } from '../types';
import { catalogIdSchema, contentSchemas, exportSchemas } from './catalog';

// Both directions, so the schemas and the hand-written types can't drift apart.
type Assignable<A, B> = [A] extends [B] ? true : false;
const practiceOut: Assignable<z.output<typeof exportSchemas.practice>, Practice> = true;
const practiceIn: Assignable<Practice, z.output<typeof exportSchemas.practice>> = true;
const deityOut: Assignable<z.output<typeof exportSchemas.deity>, Deity> = true;
const deityIn: Assignable<Deity, z.output<typeof exportSchemas.deity>> = true;
const programOut: Assignable<z.output<typeof exportSchemas.program>, Program> = true;
const programIn: Assignable<Program, z.output<typeof exportSchemas.program>> = true;
const traditionOut: Assignable<z.output<typeof exportSchemas.tradition>, Tradition> = true;
const traditionIn: Assignable<Tradition, z.output<typeof exportSchemas.tradition>> = true;
const contentPracticeOut: Assignable<z.output<typeof contentSchemas.practice>, Practice> = true;
void [practiceOut, practiceIn, deityOut, deityIn, programOut, programIn];
void [traditionOut, traditionIn, contentPracticeOut];

const SHA = 'a'.repeat(64);

const mantraStep = (text: Record<string, string>, words: Record<string, string[]> | null) => ({
  text,
  words,
  name: null,
  meaning: null,
  audio_start_ms: null,
  audio_end_ms: null,
});

const practiceBase = {
  id: 'om-namah-shivaya',
  version: 1,
  tradition_id: 'hindu',
  deity_ids: ['shiva'],
  title: { en: 'Om Namah Shivaya' },
  subtitle: {},
  source_script: 'devanagari',
  repetition_word: { en: 'japa' },
  intro: { en: 'Salutations to Shiva.' },
  audio: null,
  source: 'Shri Rudram',
  licence: 'Public domain',
  review: { advisor: 'Pandit A', reviewed_on: '2026-09-20' },
};

/** A mantra as a pack carries it: master text plus the generated `latin`. */
function exportMantra(): Record<string, unknown> {
  return {
    ...practiceBase,
    kind: 'mantra',
    default_round: 108,
    steps: [
      mantraStep(
        { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya', latin: 'Om Namah Shivaya' },
        {
          devanagari: ['ॐ', 'नमः', 'शिवाय'],
          iast: ['oṃ', 'namaḥ', 'śivāya'],
          latin: ['Om', 'Namah', 'Shivaya'],
        },
      ),
    ],
  };
}

/** The same mantra as authored in `content/`: master text only. */
function contentMantra(): Record<string, unknown> {
  return {
    ...practiceBase,
    kind: 'mantra',
    default_round: 108,
    steps: [
      mantraStep(
        { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
        { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ', 'śivāya'] },
      ),
    ],
  };
}

const nameStep = (devanagari: string, iast: string, latin: string, name: string) => ({
  text: { devanagari, iast, latin },
  words: null,
  name: { latin: name, devanagari: name, iast: name },
  meaning: { en: 'One of the names' },
  audio_start_ms: null,
  audio_end_ms: null,
});

function exportNamavali(): Record<string, unknown> {
  return {
    ...practiceBase,
    id: 'vishnu-ashtottara',
    deity_ids: ['vishnu'],
    title: { en: 'Vishnu Ashtottara Shatanamavali' },
    subtitle: { en: '108 names' },
    repetition_word: { en: 'paath' },
    kind: 'namavali',
    default_round: 1,
    steps: [
      nameStep('ॐ केशवाय नमः', 'oṃ keśavāya namaḥ', 'Om Keshavaya Namah', 'Keshava'),
      nameStep('ॐ नारायणाय नमः', 'oṃ nārāyaṇāya namaḥ', 'Om Narayanaya Namah', 'Narayana'),
    ],
  };
}

const audio = { id: 'om-namah-shivaya-recitation', sha256: SHA, bytes: 90_000, duration_ms: 4_000 };

/** Paths of every issue, so a test can say exactly what was rejected. */
function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

/** A copy of `object` without `key`. */
function without(object: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));
}

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.message).join('\n');
}

describe('catalogIdSchema', () => {
  test.each(['vishnu-ashtottara', 'om-namah-shivaya', 'navaratri', 'mandala-40'])(
    'accepts the slug %s',
    (id) => {
      expect(catalogIdSchema.safeParse(id).success).toBe(true);
    },
  );

  test.each(['Vishnu', 'om_namah', 'a:b', 'om namah', '', 'शिव'])('rejects %j', (id) => {
    expect(catalogIdSchema.safeParse(id).success).toBe(false);
  });

  test('rejects a slug shaped like a UUID, which would collide with a custom practice id', () => {
    const result = catalogIdSchema.safeParse('0192f8e4-7c1a-7b3e-9d4f-2a6b8c0d1e2f');

    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/UUID/);
  });
});

describe('exportSchemas.practice', () => {
  test('accepts a mantra and a namavali as packs carry them', () => {
    expect(exportSchemas.practice.safeParse(exportMantra()).success).toBe(true);
    expect(exportSchemas.practice.safeParse(exportNamavali()).success).toBe(true);
  });

  test('drops fields it does not know, so an older app can read a newer pack', () => {
    const result = exportSchemas.practice.parse({ ...exportMantra(), added_later: true });

    expect(result).not.toHaveProperty('added_later');
  });

  test('accepts scripts beyond the base ones, which script add-on packs bring', () => {
    const practice = exportMantra();
    const [step] = practice.steps as ReturnType<typeof mantraStep>[];
    step!.text = { ...step!.text, tamil: 'ஓம் நமசிவாய' };

    expect(exportSchemas.practice.safeParse(practice).success).toBe(true);
  });

  test('requires the source script, IAST and latin in every text', () => {
    const practice = exportMantra();
    const [step] = practice.steps as ReturnType<typeof mantraStep>[];
    step!.text = { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' };

    const result = exportSchemas.practice.safeParse(practice);

    expect(issuePaths(result)).toEqual(['steps.0.text']);
    expect(messages(result)).toMatch(/latin/);
  });

  test('requires the required scripts in words and names too', () => {
    const mantra = exportMantra();
    const [step] = mantra.steps as ReturnType<typeof mantraStep>[];
    step!.words = { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ', 'śivāya'] };
    const namavali = exportNamavali();
    const [first] = namavali.steps as ReturnType<typeof nameStep>[];
    first!.name = { latin: 'Keshava' } as ReturnType<typeof nameStep>['name'];

    expect(issuePaths(exportSchemas.practice.safeParse(mantra))).toEqual(['steps.0.words']);
    expect(issuePaths(exportSchemas.practice.safeParse(namavali))).toEqual(['steps.0.name']);
  });

  test('a mantra has exactly one step', () => {
    const practice = exportMantra();
    const steps = practice.steps as unknown[];
    practice.steps = [steps[0], steps[0]];

    expect(exportSchemas.practice.safeParse(practice).success).toBe(false);
  });

  test('a mantra step carries no name or meaning', () => {
    const practice = exportMantra();
    const [step] = practice.steps as Record<string, unknown>[];
    step!.name = { latin: 'Shiva' };

    expect(exportSchemas.practice.safeParse(practice).success).toBe(false);
  });

  test('a mantra need not be split into words', () => {
    const practice = exportMantra();
    const [step] = practice.steps as ReturnType<typeof mantraStep>[];
    step!.words = null;

    expect(exportSchemas.practice.safeParse(practice).success).toBe(true);
  });

  test('every namavali step carries its name and no words', () => {
    const noName = exportNamavali();
    (noName.steps as Record<string, unknown>[])[0]!.name = null;
    const withWords = exportNamavali();
    (withWords.steps as Record<string, unknown>[])[0]!.words = { latin: ['Om'] };

    expect(exportSchemas.practice.safeParse(noName).success).toBe(false);
    expect(exportSchemas.practice.safeParse(withWords).success).toBe(false);
  });

  test('a missing meaning is null, never an empty map', () => {
    const practice = exportNamavali();
    (practice.steps as Record<string, unknown>[])[0]!.meaning = {};

    expect(issuePaths(exportSchemas.practice.safeParse(practice))).toEqual(['steps.0.meaning']);
  });

  test('a namavali round is always one recitation', () => {
    const practice = { ...exportNamavali(), default_round: 108 };

    expect(exportSchemas.practice.safeParse(practice).success).toBe(false);
  });

  test('a namavali has at least one name', () => {
    const practice = { ...exportNamavali(), steps: [] };

    expect(exportSchemas.practice.safeParse(practice).success).toBe(false);
  });

  test('rejects an empty or repeated deity list', () => {
    expect(exportSchemas.practice.safeParse({ ...exportMantra(), deity_ids: [] }).success).toBe(
      false,
    );
    expect(
      exportSchemas.practice.safeParse({ ...exportMantra(), deity_ids: ['shiva', 'shiva'] })
        .success,
    ).toBe(false);
  });

  test.each([
    ['version', 0],
    ['version', 1.5],
    ['default_round', 0],
    ['source', '  '],
    ['licence', ''],
    ['title', {}],
    ['repetition_word', {}],
    ['kind', 'bhajan'],
    ['tradition_id', 'unknown'],
    ['id', 'Om-Namah'],
  ])('rejects %s = %j', (field, value) => {
    expect(exportSchemas.practice.safeParse({ ...exportMantra(), [field]: value }).success).toBe(
      false,
    );
  });

  test('rejects a review without a real date or advisor', () => {
    const badDate = {
      ...exportMantra(),
      review: { advisor: 'Pandit A', reviewed_on: '2026-02-30' },
    };
    const noAdvisor = { ...exportMantra(), review: { advisor: '', reviewed_on: '2026-09-20' } };

    expect(exportSchemas.practice.safeParse(badDate).success).toBe(false);
    expect(exportSchemas.practice.safeParse(noAdvisor).success).toBe(false);
  });

  test('accepts unreviewed content; keeping it out of production is the build’s job', () => {
    expect(exportSchemas.practice.safeParse({ ...exportMantra(), review: null }).success).toBe(
      true,
    );
  });

  test.each(['ab', 'A'.repeat(64), 'g'.repeat(64)])('rejects the checksum %s', (sha256) => {
    const practice = { ...exportMantra(), audio: { ...audio, sha256 } };

    expect(exportSchemas.practice.safeParse(practice).success).toBe(false);
  });

  test('a recording has a duration', () => {
    const withoutDuration = without(audio, 'duration_ms');

    expect(
      exportSchemas.practice.safeParse({ ...exportMantra(), audio: withoutDuration }).success,
    ).toBe(false);
  });

  describe('audio positions', () => {
    function withSpan(start: number | null, end: number | null, recording: unknown = audio) {
      const practice: Record<string, unknown> = { ...exportMantra(), audio: recording };
      const [step] = practice.steps as ReturnType<typeof mantraStep>[];
      Object.assign(step!, { audio_start_ms: start, audio_end_ms: end });
      return exportSchemas.practice.safeParse(practice);
    }

    test('accepts a span inside the recording', () => {
      expect(withSpan(0, 4_000).success).toBe(true);
    });

    test('rejects a span when the practice has no recording', () => {
      expect(issuePaths(withSpan(0, 1_000, null))).toEqual(['steps.0.audio_start_ms']);
    });

    test('rejects a start without an end, and the reverse', () => {
      expect(withSpan(0, null).success).toBe(false);
      expect(withSpan(null, 1_000).success).toBe(false);
    });

    test('rejects a span that ends before it starts or after the recording', () => {
      expect(withSpan(2_000, 1_000).success).toBe(false);
      expect(withSpan(1_000, 1_000).success).toBe(false);
      expect(withSpan(0, 4_001).success).toBe(false);
      expect(withSpan(-1, 1_000).success).toBe(false);
    });
  });
});

describe('contentSchemas.practice', () => {
  test('accepts a practice authored in its source script and IAST', () => {
    expect(contentSchemas.practice.safeParse(contentMantra()).success).toBe(true);
  });

  test('rejects hand-written latin, which the build generates', () => {
    const result = contentSchemas.practice.safeParse(exportMantra());

    expect(issuePaths(result)).toEqual(['steps.0.text', 'steps.0.words']);
    expect(messages(result)).toMatch(/latin.*generated/);
  });

  test('requires IAST alongside the source script', () => {
    const practice = contentMantra();
    const [step] = practice.steps as ReturnType<typeof mantraStep>[];
    step!.text = { devanagari: 'ॐ नमः शिवाय' };

    expect(issuePaths(contentSchemas.practice.safeParse(practice))).toEqual(['steps.0.text']);
  });

  test('rejects a misspelt field instead of ignoring it', () => {
    const rest = without(contentMantra(), 'default_round');
    const result = contentSchemas.practice.safeParse({ ...rest, defualt_round: 108 });

    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/defualt_round/);
  });

  test('requires `review` to be written out, as null when unreviewed', () => {
    const rest = without(contentMantra(), 'review');

    expect(contentSchemas.practice.safeParse(rest).success).toBe(false);
    expect(contentSchemas.practice.safeParse({ ...rest, review: null }).success).toBe(true);
  });
});

function deity(): Record<string, unknown> {
  return {
    id: 'shailaputri',
    tradition_id: 'hindu',
    parent_id: 'durga',
    names: { en: { latin: 'Shailaputri' }, hi: { devanagari: 'शैलपुत्री' } },
    summary: { en: 'Daughter of the mountain, first form of Navadurga.' },
    image: { id: 'shailaputri-image', sha256: SHA, bytes: 40_000 },
    suggested_mala: 'rudraksha',
    featured_practice_id: 'shailaputri-mantra',
    sort_order: 1,
  };
}

describe('deity schemas', () => {
  test('accept a deity in both forms', () => {
    expect(exportSchemas.deity.safeParse(deity()).success).toBe(true);
    expect(contentSchemas.deity.safeParse(deity()).success).toBe(true);
  });

  test('accept a deity with no parent, image, mala or featured practice', () => {
    const plain = {
      ...deity(),
      parent_id: null,
      image: null,
      suggested_mala: null,
      featured_practice_id: null,
    };

    expect(exportSchemas.deity.safeParse(plain).success).toBe(true);
  });

  test('a deity is not its own parent', () => {
    const result = exportSchemas.deity.safeParse({ ...deity(), parent_id: 'shailaputri' });

    expect(issuePaths(result)).toEqual(['parent_id']);
  });

  test('an image has no duration', () => {
    const withDuration = { ...deity(), image: { ...(deity().image as object), duration_ms: 1 } };

    expect(contentSchemas.deity.safeParse(withDuration).success).toBe(false);
  });

  test('a deity has a name', () => {
    expect(exportSchemas.deity.safeParse({ ...deity(), names: {} }).success).toBe(false);
  });

  test.each([['en_GB'], ['English'], ['']])('rejects the language tag %j', (tag) => {
    expect(exportSchemas.deity.safeParse({ ...deity(), summary: { [tag]: 'x' } }).success).toBe(
      false,
    );
  });

  test('content rejects unknown fields; packs drop them', () => {
    expect(contentSchemas.deity.safeParse({ ...deity(), colour: 'blue' }).success).toBe(false);
    expect(exportSchemas.deity.parse({ ...deity(), colour: 'blue' })).not.toHaveProperty('colour');
  });
});

function navaratri(): Record<string, unknown> {
  return {
    id: 'navaratri',
    kind: 'festival',
    duration: 9,
    days: [
      { day: 1, practice_id: 'shailaputri-mantra', target: 108, reading: { en: 'Day one' } },
      { day: 2, practice_id: 'brahmacharini-mantra', target: null, reading: null },
    ],
  };
}

describe('program schemas', () => {
  test('accept a festival program with a plan per day', () => {
    expect(exportSchemas.program.safeParse(navaratri()).success).toBe(true);
    expect(contentSchemas.program.safeParse(navaratri()).success).toBe(true);
  });

  test('accept a sankalpa template with no per-day plan', () => {
    const mandala = { id: 'mandala-40', kind: 'sankalpa_template', duration: 40, days: null };

    expect(exportSchemas.program.safeParse(mandala).success).toBe(true);
  });

  test('an empty plan is written as null, never as an empty list', () => {
    expect(exportSchemas.program.safeParse({ ...navaratri(), days: [] }).success).toBe(false);
  });

  test('a missing reading is null, never an empty map', () => {
    const days = [{ day: 1, practice_id: 'x', target: null, reading: {} }];

    expect(issuePaths(exportSchemas.program.safeParse({ ...navaratri(), days }))).toEqual([
      'days.0.reading',
    ]);
  });

  test('every day falls within the program', () => {
    const days = [{ day: 10, practice_id: 'x', target: null, reading: null }];
    const result = exportSchemas.program.safeParse({ ...navaratri(), days });

    expect(issuePaths(result)).toEqual(['days.0.day']);
  });

  test('no day is planned twice', () => {
    const day = { day: 1, practice_id: 'x', target: null, reading: null };
    const result = exportSchemas.program.safeParse({ ...navaratri(), days: [day, day] });

    expect(issuePaths(result)).toEqual(['days.1.day']);
  });

  test.each([
    ['day', 0],
    ['target', 0],
    ['practice_id', 'Not A Slug'],
  ])('rejects a day with %s = %j', (field, value) => {
    const day = { day: 1, practice_id: 'x', target: null, reading: null, [field]: value };

    expect(exportSchemas.program.safeParse({ ...navaratri(), days: [day] }).success).toBe(false);
  });

  test('rejects a program of no days', () => {
    expect(exportSchemas.program.safeParse({ ...navaratri(), duration: 0 }).success).toBe(false);
  });
});

function hindu(): Record<string, unknown> {
  return {
    id: 'hindu',
    deity_label: { en: 'Deity' },
    offering_label: { en: 'Offer at the lotus feet' },
    default_round_size: 108,
    show_images_by_default: true,
  };
}

describe('tradition schemas', () => {
  test('accept a tradition in both forms', () => {
    expect(exportSchemas.tradition.safeParse(hindu()).success).toBe(true);
    expect(contentSchemas.tradition.safeParse(hindu()).success).toBe(true);
  });

  test.each([
    ['id', 'shinto'],
    ['default_round_size', 0],
    ['deity_label', {}],
    ['show_images_by_default', 'no'],
  ])('rejects %s = %j', (field, value) => {
    expect(exportSchemas.tradition.safeParse({ ...hindu(), [field]: value }).success).toBe(false);
  });
});

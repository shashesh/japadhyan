/**
 * Catalog entities as tests write them, for the catalog and pack schema
 * tests. Plain objects, so a test can break one field at a time.
 */

export const SHA = 'a'.repeat(64);

export const mantraStep = (
  text: Record<string, string>,
  words: Record<string, string[]> | null,
) => ({
  text,
  words,
  name: null,
  meaning: null,
  audio_start_ms: null,
  audio_end_ms: null,
});

export const practiceBase = {
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
export function exportMantra(): Record<string, unknown> {
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
export function contentMantra(): Record<string, unknown> {
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

export const nameStep = (devanagari: string, iast: string, latin: string, name: string) => ({
  text: { devanagari, iast, latin },
  words: null,
  name: { latin: name, devanagari: name, iast: name },
  meaning: { en: 'One of the names' },
  audio_start_ms: null,
  audio_end_ms: null,
});

export function exportNamavali(): Record<string, unknown> {
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

export const audio = {
  id: 'om-namah-shivaya-recitation',
  sha256: SHA,
  bytes: 90_000,
  duration_ms: 4_000,
};

/** Paths of every issue, so a test can say exactly what was rejected. */
export function issuePaths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

/** A copy of `object` without `key`. */
export function without(object: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));
}

export function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.message).join('\n');
}

export function deity(): Record<string, unknown> {
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

export function navaratri(): Record<string, unknown> {
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

export function hindu(): Record<string, unknown> {
  return {
    id: 'hindu',
    deity_label: { en: 'Deity' },
    offering_label: { en: 'Offer at the lotus feet' },
    default_round_size: 108,
    show_images_by_default: true,
  };
}

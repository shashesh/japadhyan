import { exportSchemas, type Practice } from '@japadhyan/shared';
import { describe, expect, test } from 'vitest';

import { generatePractice } from './generate';

type Texts = Record<string, string>;
type Words = Record<string, string[]>;

const mantra = (text: Texts, words: Words | null = null): Practice =>
  ({
    id: 'om-namah-shivaya',
    version: 1,
    tradition_id: 'hindu',
    kind: 'mantra',
    deity_ids: ['shiva'],
    title: { en: 'Om Namah Shivaya' },
    subtitle: {},
    source_script: 'devanagari',
    steps: [{ text, words, name: null, meaning: null, audio_start_ms: null, audio_end_ms: null }],
    default_round: 108,
    repetition_word: { en: 'japa' },
    intro: {},
    audio: null,
    source: 'Traditional',
    licence: 'Public domain',
    review: null,
  }) as Practice;

const omNamahShivaya = () =>
  mantra(
    { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
    { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ', 'śivāya'] },
  );

const step = (practice: Practice) => practice.steps[0]!;

const issuesOf = (practice: Practice) => generatePractice(practice).issues;

describe('generatePractice', () => {
  test('adds latin and the P1 Indic scripts to the text and each word', () => {
    const { practice, issues } = generatePractice(omNamahShivaya());

    expect(issues).toEqual([]);
    expect(step(practice).text).toEqual({
      devanagari: 'ॐ नमः शिवाय',
      iast: 'oṃ namaḥ śivāya',
      latin: 'Om Namah Shivaya',
      tamil: 'ௐ நம꞉ ஶிவாய',
      telugu: 'ఓం నమః శివాయ',
      kannada: 'ಓಂ ನಮಃ ಶಿವಾಯ',
      gujarati: 'ૐ નમઃ શિવાય',
      bengali: 'ওঁ নমঃ শিবায়',
    });
    expect(step(practice).words).toEqual({
      devanagari: ['ॐ', 'नमः', 'शिवाय'],
      iast: ['oṃ', 'namaḥ', 'śivāya'],
      latin: ['Om', 'Namah', 'Shivaya'],
      tamil: ['ௐ', 'நம꞉', 'ஶிவாய'],
      telugu: ['ఓం', 'నమః', 'శివాయ'],
      kannada: ['ಓಂ', 'ನಮಃ', 'ಶಿವಾಯ'],
      gujarati: ['ૐ', 'નમઃ', 'શિવાય'],
      bengali: ['ওঁ', 'নমঃ', 'শিবায়'],
    });
  });

  test('the result is a practice as packs carry it', () => {
    const { practice } = generatePractice(omNamahShivaya());

    expect(exportSchemas.practice.safeParse(practice).success).toBe(true);
  });

  test('leaves the authored practice unchanged', () => {
    const authored = omNamahShivaya();
    const copy = structuredClone(authored);

    generatePractice(authored);

    expect(authored).toEqual(copy);
  });

  test('generates the name of each namavali step', () => {
    const namavali = {
      ...mantra({ devanagari: 'ॐ केशवाय नमः', iast: 'oṃ keśavāya namaḥ' }),
      kind: 'namavali',
      default_round: 1,
    } as Practice;
    const withName = {
      ...namavali,
      steps: [{ ...step(namavali), name: { devanagari: 'केशव', iast: 'keśava' } }],
    } as Practice;

    const { practice, issues } = generatePractice(withName);

    expect(issues).toEqual([]);
    expect(step(practice).name).toMatchObject({ latin: 'Keshava', tamil: 'கேஶவ' });
    expect(step(practice).text).toMatchObject({ latin: 'Om Keshavaya Namah' });
  });

  test("a namavali name's issues are placed on the name", () => {
    const namavali = {
      ...mantra({ devanagari: 'ॐ केशवाय नमः', iast: 'oṃ keśavāya namaḥ' }),
      kind: 'namavali',
      default_round: 1,
    } as Practice;
    const typo = {
      ...namavali,
      steps: [{ ...step(namavali), name: { devanagari: 'केशव', iast: 'kesava' } }],
    } as Practice;

    expect(issuesOf(typo)).toEqual([
      {
        path: ['steps', 0, 'name', 'iast'],
        message: 'Doesn’t match the `devanagari`, which reads “keśava”',
      },
    ]);
  });

  describe('the IAST is checked against the source script', () => {
    test('a typo in either is reported on the IAST', () => {
      // Vaidika Vignanam's typo: वर्शिष्ठ for वर्षिष्ठ.
      const typo = mantra({ devanagari: 'वर्शिष्ठान्ते', iast: 'varṣiṣṭhānte' });

      expect(issuesOf(typo)).toEqual([
        {
          path: ['steps', 0, 'text', 'iast'],
          message: 'Doesn’t match the `devanagari`, which reads “varśiṣṭhānte”',
        },
      ]);
    });

    test('each word is checked', () => {
      const practice = mantra(
        { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
        { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namah', 'śivāya'] },
      );

      expect(issuesOf(practice)).toEqual([
        {
          path: ['steps', 0, 'words', 'iast', 1],
          message: 'Doesn’t match the `devanagari`, which reads “namaḥ”',
        },
      ]);
    });

    test.each([
      ['|', 'namaḥ |'],
      ['.', 'namaḥ .'],
      ['।', 'namaḥ ।'],
      ['no daṇḍa at all', 'namaḥ'],
    ])('punctuation is ignored: daṇḍa as %s', (_, iast) => {
      expect(issuesOf(mantra({ devanagari: 'नमः ।', iast }))).toEqual([]);
    });

    test.each([
      ['a hyphen in a compound', 'महामन्त्रः', 'mahā-mantraḥ'],
      ['brackets', 'नमः', '(namaḥ)'],
      ['a colon and a comma', 'ॐ नमः शिवाय', 'oṃ: namaḥ, śivāya'],
    ])('punctuation is ignored: %s', (_, devanagari, iast) => {
      expect(issuesOf(mantra({ devanagari, iast }))).toEqual([]);
    });

    test('the avagraha is a letter, not punctuation', () => {
      expect(issuesOf(mantra({ devanagari: 'सोऽहम्', iast: 'soham' }))).toEqual([
        {
          path: ['steps', 0, 'text', 'iast'],
          message: "Doesn’t match the `devanagari`, which reads “so'ham”",
        },
      ]);
    });

    test('ā before another vowel reads right, as the source is read, never the IAST', () => {
      // vidyut-lipi reads the IAST sāī as सी (ambuda-org/vidyut#253); the
      // Devanagari साई reads correctly as sāī.
      const sai = mantra({ devanagari: 'ॐ श्री साई राम', iast: 'oṃ śrī sāī rāma' });

      expect(issuesOf(sai)).toEqual([]);
    });

    test('IAST is written in lower case', () => {
      const practice = mantra({ devanagari: 'ॐ नमः शिवाय', iast: 'Oṃ Namaḥ Śivāya' });

      expect(issuesOf(practice)).toEqual([
        { path: ['steps', 0, 'text', 'iast'], message: 'Write IAST in lower case' },
      ]);
    });

    test('the anusvara is ṃ, never ṁ', () => {
      const practice = mantra({ devanagari: 'ॐ नमः शिवाय', iast: 'oṁ namaḥ śivāya' });

      expect(issuesOf(practice)).toEqual([
        { path: ['steps', 0, 'text', 'iast'], message: 'Write the anusvara as ṃ, not ṁ' },
      ]);
    });

    test('the IAST words and the source words are as many', () => {
      const practice = mantra(
        { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
        { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ'] },
      );

      expect(issuesOf(practice)).toEqual([
        { path: ['steps', 0, 'words', 'iast'], message: 'Has 2 words; the `devanagari` has 3' },
      ]);
    });
  });

  describe('generated scripts are checked', () => {
    test('a script that loses a letter on the way back is reported', () => {
      // Telugu has no ऩ: vidyut-lipi drops it.
      const practice = mantra({ devanagari: 'ऩमः', iast: 'ṉamaḥ', latin: 'Namah' });

      expect(issuesOf(practice)).toContainEqual({
        path: ['steps', 0, 'text', 'telugu'],
        message: 'Doesn’t convert back to the `devanagari`: “మః” reads “मः”',
      });
    });

    test('source letters left in any generated script are reported, Bengali included', () => {
      // vidyut-lipi has no mapping for ऑ, so it passes through, and the round trip can't tell.
      const practice = mantra({ devanagari: 'ऑम', iast: 'ôma', latin: 'Om' });
      const issues = issuesOf(practice);

      for (const script of ['tamil', 'telugu', 'kannada', 'gujarati', 'bengali']) {
        expect(issues).toContainEqual({
          path: ['steps', 0, 'text', script],
          message: `Left “ऑ” from the \`devanagari\` in the \`${script}\``,
        });
      }
    });

    test('Bengali is not round-tripped: it writes va and ba alike', () => {
      expect(issuesOf(omNamahShivaya())).toEqual([]);
    });
  });

  describe('latin', () => {
    test('a hand-written latin is used instead of the rules', () => {
      const practice = mantra(
        { devanagari: 'श्री राम जय राम', iast: 'śrī rāma jaya rāma', latin: 'Shri Ram Jai Ram' },
        {
          devanagari: ['श्री', 'राम', 'जय', 'राम'],
          iast: ['śrī', 'rāma', 'jaya', 'rāma'],
          latin: ['Shri', 'Ram', 'Jai', 'Ram'],
        },
      );

      const { practice: generated, issues } = generatePractice(practice);

      expect(issues).toEqual([]);
      expect(step(generated).text.latin).toBe('Shri Ram Jai Ram');
      expect(step(generated).words?.latin).toEqual(['Shri', 'Ram', 'Jai', 'Ram']);
    });

    test('a hand-written latin on the text needs one on the words, so they agree', () => {
      const practice = mantra(
        { devanagari: 'श्री राम', iast: 'śrī rāma', latin: 'Shri Ram' },
        { devanagari: ['श्री', 'राम'], iast: ['śrī', 'rāma'] },
      );

      expect(issuesOf(practice)).toEqual([
        {
          path: ['steps', 0, 'words'],
          message: '`text` has a hand-written `latin`, so write one here too',
        },
      ]);
    });

    test('a hand-written latin text has as many words as the IAST', () => {
      const practice = mantra({
        devanagari: 'श्री राम जय',
        iast: 'śrī rāma jaya',
        latin: 'Shri Ram',
      });

      expect(issuesOf(practice)).toEqual([
        { path: ['steps', 0, 'text', 'latin'], message: 'Has 2 words; the `iast` has 3' },
      ]);
    });

    test('punctuation is not a word when counting', () => {
      const practice = mantra({ devanagari: 'नमः ।', iast: 'namaḥ |', latin: 'Namah' });

      expect(issuesOf(practice)).toEqual([]);
    });

    test('hand-written latin words are as many as the IAST words', () => {
      const practice = mantra(
        { devanagari: 'श्री राम', iast: 'śrī rāma', latin: 'Shri Ram' },
        { devanagari: ['श्री', 'राम'], iast: ['śrī', 'rāma'], latin: ['Shri Ram'] },
      );

      expect(issuesOf(practice)).toEqual([
        { path: ['steps', 0, 'words', 'latin'], message: 'Has 1 word; the `iast` has 2' },
      ]);
    });

    test('an IAST letter with no rule asks for a rule or a hand-written latin', () => {
      const practice = mantra({ devanagari: 'कॢप्त', iast: 'kḷpta' });

      expect(issuesOf(practice)).toEqual([
        {
          path: ['steps', 0, 'text', 'latin'],
          message: 'No `latin` rule for “ḷ”. Add one, or write `latin` by hand',
        },
      ]);
    });
  });

  test('a source script with no transliteration yet is reported once', () => {
    const gurmukhi = {
      ...mantra({ gurmukhi: 'ਵਾਹਿਗੁਰੂ', iast: 'vāhigurū' }),
      source_script: 'gurmukhi',
    } as Practice;

    const { practice, issues } = generatePractice(gurmukhi);

    expect(issues).toEqual([
      {
        path: ['source_script'],
        message: 'Scripts are generated only from `devanagari` so far, not `gurmukhi`',
      },
    ]);
    expect(step(practice).text).toEqual({
      gurmukhi: 'ਵਾਹਿਗੁਰੂ',
      iast: 'vāhigurū',
      latin: 'Vahiguru',
    });
  });
});

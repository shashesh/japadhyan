import { describe, expect, test } from 'vitest';

import { latinFromIast } from './latin';

const latin = (iast: string) => {
  const result = latinFromIast(iast);
  if (!result.ok) throw new Error(result.message);
  return result.latin;
};

// The rules in docs/decisions/2026-09-23-transliteration-library.md#how-latin-is-produced,
// one row of the table per test.
describe('latinFromIast', () => {
  test.each([
    ['ā ī ū drop their length', 'nārāyaṇa', 'Narayana'],
    ['ṛ is ri', 'kṛṣṇa', 'Krishna'],
    ['ṝ is ri', 'pitṝn', 'Pitrin'],
    ['ś is sh', 'śiva', 'Shiva'],
    ['ṣ is sh', 'viṣṇu', 'Vishnu'],
    ['c is ch', 'vicce', 'Vichche'],
    ['ch is chh', 'chandaḥ', 'Chhandah'],
    ['c and ch together', 'gacchati', 'Gachchhati'],
    ['ṭ ḍ ṇ are t d n', 'cāmuṇḍā', 'Chamunda'],
    ['ṭ is t', 'kūṭa', 'Kuta'],
    ['ṅ is n', 'gaṅgā', 'Ganga'],
    ['ñ is n', 'jñāna', 'Jnana'],
    ['ḥ is h', 'namaḥ', 'Namah'],
    ['every vowel is kept', 'śivāya', 'Shivaya'],
  ])('%s: %s → %s', (_, iast, expected) => {
    expect(latin(iast)).toBe(expected);
  });

  describe('ṃ and m̐', () => {
    test.each([
      ['n before k', 'śaṃkara', 'Shankara'],
      ['n before g', 'saṃgama', 'Sangama'],
      ['n before c', 'saṃcaya', 'Sanchaya'],
      ['n before j', 'saṃjaya', 'Sanjaya'],
      ['n before ṭ', 'kaṃṭaka', 'Kantaka'],
      ['n before ḍ', 'daṃḍa', 'Danda'],
      ['n before t', 'śāṃti', 'Shanti'],
      ['n before d', 'naṃdana', 'Nandana'],
      ['n before an aspirate', 'saṃdhyā', 'Sandhya'],
      ['m at the end of a word', 'oṃ', 'Om'],
      ['m before s', 'saṃsāra', 'Samsara'],
      ['m before a vowel', 'saṃ ārambha', 'Sam Arambha'],
      ['m before a consonant in the next word', 'saṃ gacchadhvam', 'Sam Gachchhadhvam'],
      ['m̐ is ṃ', 'ham̐saḥ', 'Hamsah'],
      ['m̐ before g is n', 'gam̐gā', 'Ganga'],
    ])('%s: %s → %s', (_, iast, expected) => {
      expect(latin(iast)).toBe(expected);
    });
  });

  test.each([
    ['avagraha', "so'ham", 'Soham'],
    ['typographic avagraha', 'so’ham', 'Soham'],
    ['daṇḍa as |', 'namaḥ |', 'Namah'],
    ['double daṇḍa as ||', 'namaḥ ||', 'Namah'],
    ['daṇḍa as .', 'namaḥ.', 'Namah'],
    ['double daṇḍa as ..', 'namaḥ ..', 'Namah'],
    ['Devanagari daṇḍas', 'namaḥ । śivāya ॥', 'Namah Shivaya'],
  ])('drops the %s', (_, iast, expected) => {
    expect(latin(iast)).toBe(expected);
  });

  test.each([
    ['oṃ namaḥ śivāya', 'Om Namah Shivaya'],
    ['oṃ śrī viṣṇave namaḥ', 'Om Shri Vishnave Namah'],
    ['oṃ kṛṣṇāya namaḥ', 'Om Krishnaya Namah'],
    ['oṃ aiṃ hrīṃ klīṃ cāmuṇḍāyai vicce', 'Om Aim Hrim Klim Chamundayai Vichche'],
  ])('the decision’s sample %s → %s', (iast, expected) => {
    expect(latin(iast)).toBe(expected);
  });

  test('capitalises every word and collapses spaces', () => {
    expect(latin('  hare   kṛṣṇa\thare  ')).toBe('Hare Krishna Hare');
  });

  test('reads decomposed IAST the same as composed', () => {
    expect(latin('śivāya namaḥ')).toBe('Shivaya Namah');
  });

  test('a letter with no rule is an error, not passed through', () => {
    expect(latinFromIast('kḷpta')).toEqual({
      ok: false,
      message: 'No `latin` rule for “ḷ”. Add one, or write `latin` by hand',
    });
  });

  test('each letter with no rule is named once', () => {
    expect(latinFromIast('ḷḷ ẏ')).toEqual({
      ok: false,
      message: 'No `latin` rule for “ḷ”, “ẏ”. Add one, or write `latin` by hand',
    });
  });
});

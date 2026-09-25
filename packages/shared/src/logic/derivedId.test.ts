import { describe, expect, test } from 'vitest';

import { DERIVED_ID_NAMESPACE, derivedId, uuidv5 } from './derivedId';

const USER = '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79';
const OTHER_USER = '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a7a';
const CUSTOM_PRACTICE = '0192a4b1-0000-7000-8000-000000000001';

describe('uuidv5', () => {
  test("matches RFC 9562's example", () => {
    const dns = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

    expect(uuidv5(dns, 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  test('rejects a namespace that is not a lowercase hyphenated UUID', () => {
    expect(() => uuidv5('6BA7B810-9DAD-11D1-80B4-00C04FD430C8', 'x')).toThrow(RangeError);
    expect(() => uuidv5('not-a-uuid', 'x')).toThrow(RangeError);
  });
});

describe('derivedId', () => {
  test('uses the namespace the data model fixes forever', () => {
    expect(DERIVED_ID_NAMESPACE).toBe('49841fbe-b559-4c62-ae52-0d0611052939');
  });

  // Computed independently with Python's uuid.uuid5; the server checks the
  // same vectors against Postgres's uuid_generate_v5.
  test.each([
    [{ table: 'profiles', user_id: USER }, '5f3f3ea9-d129-519e-91e7-f196cf5b1932'],
    [
      { table: 'saved_practices', user_id: USER, practice_id: 'vishnu-ashtottara' },
      'f9c3fac2-3d48-5c09-85aa-5b0b70e1f09b',
    ],
    [
      { table: 'practice_positions', user_id: USER, practice_id: 'vishnu-ashtottara' },
      '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
    ],
    [
      { table: 'practice_positions', user_id: USER, practice_id: CUSTOM_PRACTICE },
      'fe7cb732-65ef-5a60-80e9-a6ea0a67bd85',
    ],
    [
      { table: 'deity_defaults', user_id: USER, deity_id: 'vishnu' },
      'beb30173-fed0-53ad-aec7-992a9617c77d',
    ],
  ] as const)('fixed vector: %o', (key, id) => {
    expect(derivedId(key)).toBe(id);
  });

  test("rejects a user_id that isn't a lowercase hyphenated UUID", () => {
    expect(() => derivedId({ table: 'profiles', user_id: USER.toUpperCase() })).toThrow(RangeError);
    expect(() => derivedId({ table: 'profiles', user_id: USER.replaceAll('-', '') })).toThrow(
      RangeError,
    );
    expect(() => derivedId({ table: 'profiles', user_id: '' })).toThrow(RangeError);
  });

  test('rejects a practice_id that is neither a catalog slug nor a lowercase UUID', () => {
    for (const practice_id of ['', 'Vishnu', 'a:b', CUSTOM_PRACTICE.toUpperCase(), 'om namah']) {
      expect(() => derivedId({ table: 'practice_positions', user_id: USER, practice_id })).toThrow(
        RangeError,
      );
    }
  });

  test("rejects a deity_id that isn't a catalog slug", () => {
    for (const deity_id of ['', 'Vishnu', 'a:b', CUSTOM_PRACTICE]) {
      expect(() => derivedId({ table: 'deity_defaults', user_id: USER, deity_id })).toThrow(
        RangeError,
      );
    }
  });

  test('different owners give different ids for the same practice', () => {
    const key = { table: 'practice_positions', practice_id: 'vishnu-ashtottara' } as const;

    expect(derivedId({ ...key, user_id: USER })).not.toBe(
      derivedId({ ...key, user_id: OTHER_USER }),
    );
  });

  test('the same practice gives different ids in different tables', () => {
    const key = { user_id: USER, practice_id: 'vishnu-ashtottara' } as const;

    expect(derivedId({ ...key, table: 'saved_practices' })).not.toBe(
      derivedId({ ...key, table: 'practice_positions' }),
    );
  });
});

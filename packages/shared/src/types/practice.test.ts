import { describe, expect, test } from 'vitest';

import type { CustomPractice, OpenCustomPractice, PrivateGuruPractice } from './practice';
import { isPrivateGuruPractice } from './practice';

const shared = {
  id: 'c1',
  user_id: 'user-1',
  hlc: { millis: 1, counter: 0, device_id: 'd1' },
  deleted_at: null,
  default_round: 108,
  created_at: '2026-09-22T10:00:00.000Z',
};

const guruMantra: PrivateGuruPractice = {
  ...shared,
  is_private: true,
  kind: 'mantra',
  title: 'My guru mantra',
  step_count: 1,
};

const ownMantra: OpenCustomPractice = {
  ...shared,
  is_private: false,
  kind: 'mantra',
  title: 'A mantra I wrote',
  steps: [{ text: { latin: 'Om' }, words: ['Om'] }],
  deity_ids: null,
  tradition_id: 'hindu',
  source_script: 'latin',
};

describe('isPrivateGuruPractice', () => {
  test('recognises a private guru mantra', () => {
    expect(isPrivateGuruPractice(guruMantra)).toBe(true);
  });

  test('does not claim an ordinary custom mantra is private', () => {
    expect(isPrivateGuruPractice(ownMantra)).toBe(false);
  });

  test('a private guru mantra has nowhere to hold its words', () => {
    const practice: CustomPractice = guruMantra;

    // The words are never typed or stored, so the private variant carries no
    // `steps` at all — there is no field for a consumer to persist or sync.
    expect(isPrivateGuruPractice(practice)).toBe(true);
    expect(Object.keys(practice)).not.toContain('steps');
    expect(JSON.stringify(practice)).not.toContain('steps');
  });

  test('narrows the union so only the open variant exposes steps', () => {
    const practices: readonly CustomPractice[] = [guruMantra, ownMantra];

    const withWords = practices.filter((p): p is OpenCustomPractice => !isPrivateGuruPractice(p));

    expect(withWords).toHaveLength(1);
    expect(withWords[0]!.steps[0]!.words).toEqual(['Om']);
  });
});

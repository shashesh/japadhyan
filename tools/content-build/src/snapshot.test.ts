import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Practice } from '@japadhyan/shared';
import { afterEach, describe, expect, test } from 'vitest';
import { parse } from 'yaml';

import { generatePractice } from './generate';
import { readSnapshot, snapshotPath, snapshotYaml, versionIssues, writeSnapshot } from './snapshot';

const source: Practice = {
  id: 'om-namah-shivaya',
  version: 2,
  tradition_id: 'hindu',
  kind: 'mantra',
  deity_ids: ['shiva'],
  title: { en: 'Om Namah Shivaya' },
  subtitle: {},
  source_script: 'devanagari',
  steps: [
    {
      text: { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
      words: { devanagari: ['ॐ', 'नमः', 'शिवाय'], iast: ['oṃ', 'namaḥ', 'śivāya'] },
      name: null,
      meaning: null,
      audio_start_ms: null,
      audio_end_ms: null,
    },
  ],
  default_round: 108,
  repetition_word: { en: 'japa' },
  intro: { en: 'The five-syllable mantra.' },
  audio: null,
  source: 'Traditional',
  licence: 'Public domain',
  review: null,
};

/** As packs carry it: every generated script. */
const generated = (practice: Practice = source) => generatePractice(practice).practice;

type Step = Practice['steps'][number];
const withSteps = (practice: Practice, steps: Step[]) => ({ ...practice, steps }) as Practice;
const mapStep = (practice: Practice, change: (step: Step) => Step) =>
  withSteps(practice, practice.steps.map(change));

const snapshotOf = (...practices: Practice[]) => new Map(practices.map((p) => [p.id, p]));
const messages = (practices: Practice[], snapshot: Map<string, Practice>) =>
  versionIssues(practices, snapshot).map((i) => `${i.file} ${i.path.join('.')}: ${i.message}`);

const FILE = 'practices/hindu/shiva/om-namah-shivaya.yaml';

describe('snapshotPath', () => {
  test('is keyed by the practice id alone', () => {
    expect(snapshotPath(source)).toBe('practices/om-namah-shivaya.yaml');
  });
});

describe('versionIssues', () => {
  const before = generated();

  test('a new practice needs no snapshot', () => {
    expect(messages([before], new Map())).toEqual([]);
  });

  test('the same practice at the same version is fine', () => {
    expect(messages([generated()], snapshotOf(before))).toEqual([]);
  });

  test('changed text with the same version is an issue that names the version to use', () => {
    const changed = generated(
      mapStep(source, (s) => ({
        ...s,
        text: { devanagari: 'ॐ नमः शिवायै', iast: 'oṃ namaḥ śivāyai' },
      })),
    );

    expect(messages([changed], snapshotOf(before))).toEqual([
      `${FILE} version: The chanted text differs from the snapshot of version 2: make it version 3`,
    ]);
  });

  test('changed words with the same version are an issue', () => {
    const changed = mapStep(
      before,
      (s) => ({ ...s, words: { ...s.words, latin: ['Om', 'Namah', 'Shivay'] } }) as Step,
    );

    expect(messages([changed], snapshotOf(before))).toHaveLength(1);
  });

  test('a changed generated script alone also needs a bump', () => {
    // What a transliteration library upgrade looks like.
    const changed = mapStep(before, (s) => ({ ...s, text: { ...s.text, tamil: 'ஓம் நம꞉ ஶிவாய' } }));

    expect(messages([changed], snapshotOf(before))).toEqual([
      `${FILE} version: The chanted text differs from the snapshot of version 2: make it version 3`,
    ]);
  });

  test('a different number of steps with the same version is an issue', () => {
    const names = (n: number) =>
      withSteps({ ...before, kind: 'namavali', default_round: 1 } as Practice, [
        ...Array.from({ length: n }, () => ({ ...before.steps[0]!, words: null })),
      ]);

    expect(messages([names(3)], snapshotOf(names(2)))).toEqual([
      `${FILE} version: Has 3 steps; the snapshot of version 2 has 2: make it version 3`,
    ]);
  });

  test('a lower version is an issue: versions only go up', () => {
    expect(messages([{ ...before, version: 1 }], snapshotOf(before))).toEqual([
      `${FILE} version: Versions only go up: the snapshot is at version 2`,
    ]);
  });

  test('a higher version with changed text is fine', () => {
    const changed = mapStep({ ...before, version: 3 }, (s) => ({
      ...s,
      text: { ...s.text, tamil: 'ஓம் நம꞉ ஶிவாய' },
    }));

    expect(messages([changed], snapshotOf(before))).toEqual([]);
  });

  test('a changed intro, title, meaning or repetition word needs no bump', () => {
    const changed: Practice = {
      ...before,
      title: { en: 'Om Namaḥ Śivāya', hi: 'ॐ नमः शिवाय' },
      intro: { en: 'Salutations to Shiva.' },
      repetition_word: { en: 'jap' },
      subtitle: { en: 'Panchakshari' },
      source: 'Shri Rudram',
      licence: 'CC0',
      review: { advisor: 'Advisor', reviewed_on: '2026-09-24', version: 2 },
    };
    const names = withSteps({ ...before, kind: 'namavali', default_round: 1 } as Practice, [
      { ...before.steps[0]!, words: null, meaning: { en: 'One' } } as Step,
    ]);
    const renamed = mapStep(names, (s) => ({ ...s, meaning: { en: 'The first' } }) as Step);

    expect(messages([changed], snapshotOf(before))).toEqual([]);
    expect(messages([renamed], snapshotOf(names))).toEqual([]);
  });

  test('text equal after NFC is unchanged', () => {
    const nfd = mapStep(before, (s) => ({
      ...s,
      text: Object.fromEntries(Object.entries(s.text).map(([k, v]) => [k, v.normalize('NFD')])),
    }));

    expect(messages([nfd], snapshotOf(before))).toEqual([]);
  });

  test('a removed practice keeps its snapshot, and coming back needs a version above it', () => {
    // Removed: the snapshot remains with nothing in content/, which is fine.
    expect(messages([], snapshotOf(before))).toEqual([]);

    const changed = mapStep(before, (s) => ({ ...s, text: { ...s.text, latin: 'Om Shivaya' } }));
    expect(messages([changed], snapshotOf(before))).toHaveLength(1);
    expect(messages([{ ...before, version: 1 }], snapshotOf(before))).toHaveLength(1);
    expect(messages([{ ...changed, version: 3 }], snapshotOf(before))).toEqual([]);
  });

  test('moving a practice to another tradition or primary deity keeps the same snapshot and still requires a higher version before reintroduction', () => {
    const moved: Practice = { ...before, deity_ids: ['rudra', 'shiva'] };
    const changed = mapStep(moved, (s) => ({ ...s, text: { ...s.text, latin: 'Om Shivaya' } }));

    expect(snapshotPath(moved)).toBe(snapshotPath(before));
    expect(messages([moved], snapshotOf(before))).toEqual([]);
    expect(messages([changed], snapshotOf(before))).toEqual([
      'practices/hindu/rudra/om-namah-shivaya.yaml version: The chanted text differs from the snapshot of version 2: make it version 3',
    ]);
  });
});

describe('snapshotYaml', () => {
  test('is stable: the same practice gives the same bytes', () => {
    const reordered = Object.fromEntries(Object.entries(generated()).reverse()) as Practice;

    expect(snapshotYaml(reordered)).toBe(snapshotYaml(generated()));
  });

  test('says it is generated, and reads back as the practice', () => {
    const yaml = snapshotYaml(generated());

    expect(yaml).toMatch(/^# Generated by `npm run content:build`/);
    expect(parse(yaml)).toEqual(generated());
  });

  test('writes strings in NFC and never folds long lines', () => {
    const long = mapStep(generated(), (s) => ({
      ...s,
      text: { ...s.text, latin: `${'Om Namah Shivaya '.repeat(10).trim()}` },
    }));
    expect(generated().steps[0]!.text.iast!.normalize('NFD')).not.toBe(
      generated().steps[0]!.text.iast,
    );
    const nfd = mapStep(generated(), (s) => ({
      ...s,
      // ṃ decomposes to m and a dot below.
      text: { ...s.text, iast: s.text.iast!.normalize('NFD') },
    }));

    expect(snapshotYaml(long)).toContain(`latin: ${'Om Namah Shivaya '.repeat(10).trim()}\n`);
    expect(snapshotYaml(nfd)).toBe(snapshotYaml(generated()));
  });
});

describe('reading and writing the snapshot', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => (root = mkdtempSync(join(tmpdir(), 'snapshot-')));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };

  test('what is written reads back', () => {
    fresh();
    writeSnapshot(root, [generated()]);

    expect(readSnapshot(root)).toEqual({
      snapshot: snapshotOf(generated()),
      issues: [],
    });
  });

  test('a missing folder is an empty snapshot', () => {
    root = join(tmpdir(), 'snapshot-that-does-not-exist');

    expect(readSnapshot(root)).toEqual({ snapshot: new Map(), issues: [] });
  });

  test('writing keeps the snapshot of a practice no longer written', () => {
    fresh();
    const other = generated({ ...source, id: 'om' });
    writeSnapshot(root, [generated(), other]);
    writeSnapshot(root, [generated()]);

    expect([...readSnapshot(root).snapshot.keys()].sort()).toEqual(['om', 'om-namah-shivaya']);
  });

  test('a file that isn’t a practice, or is named for another id, is an issue', () => {
    fresh();
    write('practices/broken.yaml', 'id: broken\n');
    write('practices/other.yaml', snapshotYaml(generated()));
    write('README.md', 'not a practice');

    const { snapshot, issues } = readSnapshot(root);

    expect(snapshot.size).toBe(0);
    expect(issues.map((i) => i.file)).toEqual([
      'README.md',
      'practices/broken.yaml',
      'practices/other.yaml',
    ]);
    expect(issues.at(-1)!.message).toBe(
      'The id is `om-namah-shivaya`, but the file is named `other.yaml`',
    );
  });

  test('an issue in a snapshot file names the field, and a YAML error its line', () => {
    fresh();
    write('practices/broken.yaml', 'id: broken\n');
    write('practices/twice.yaml', 'id: a\nid: b\n');

    const [broken, twice] = readSnapshot(root).issues;

    expect(broken).toMatchObject({ file: 'practices/broken.yaml', path: ['kind'] });
    expect(twice).toEqual({
      file: 'practices/twice.yaml',
      path: [],
      line: 2,
      message: 'Map keys must be unique',
    });
  });
});

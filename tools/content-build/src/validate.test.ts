import { describe, expect, test } from 'vitest';
import { stringify } from 'yaml';

import type { ContentFile } from './files';
import { validateContent } from './validate';

const hindu = {
  id: 'hindu',
  deity_label: { en: 'Deity' },
  offering_label: { en: 'Offer at the lotus feet' },
  default_round_size: 108,
  show_images_by_default: true,
};

const deity = (id: string, extra: Record<string, unknown> = {}) => ({
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

const mantra = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  version: 1,
  tradition_id: 'hindu',
  kind: 'mantra',
  deity_ids: ['shiva'],
  title: { en: 'Om Namah Shivaya' },
  subtitle: {},
  source_script: 'devanagari',
  steps: [
    {
      text: { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ śivāya' },
      words: null,
      name: null,
      meaning: null,
      audio_start_ms: null,
      audio_end_ms: null,
    },
  ],
  default_round: 108,
  repetition_word: { en: 'japa' },
  intro: {},
  audio: null,
  source: 'Traditional',
  licence: 'Public domain',
  review: null,
  ...extra,
});

const program = (id: string, practiceId: string) => ({
  id,
  kind: 'sankalpa_template',
  duration: 40,
  days: [{ day: 1, practice_id: practiceId, target: 108, reading: null }],
});

const file = (path: string, data: unknown): ContentFile => ({ path, text: stringify(data) });

/** A small valid tree; tests change one file to break one rule. */
function tree(): ContentFile[] {
  return [
    file('traditions/hindu.yaml', hindu),
    file('deities/hindu/shiva.yaml', deity('shiva')),
    file('practices/hindu/shiva/om-namah-shivaya.yaml', mantra('om-namah-shivaya')),
    file('programs/mandala-40.yaml', program('mandala-40', 'om-namah-shivaya')),
  ];
}

function replace(files: ContentFile[], ...changed: ContentFile[]): ContentFile[] {
  const paths = new Set(changed.map((f) => f.path));
  return [...files.filter((f) => !paths.has(f.path)), ...changed];
}

const messages = (files: ContentFile[]) =>
  validateContent(files).issues.map((i) => `${i.file}: ${i.message}`);

describe('validateContent', () => {
  test('a valid tree has no issues and yields the catalog', () => {
    const { issues, catalog } = validateContent(tree());

    expect(issues).toEqual([]);
    expect(catalog.traditions.map((t) => t.id)).toEqual(['hindu']);
    expect(catalog.deities.map((d) => d.id)).toEqual(['shiva']);
    expect(catalog.practices.map((p) => p.id)).toEqual(['om-namah-shivaya']);
    expect(catalog.programs.map((p) => p.id)).toEqual(['mandala-40']);
  });

  test('an empty tree is valid', () => {
    expect(validateContent([]).issues).toEqual([]);
  });

  describe('layout', () => {
    test('a README at the root is allowed', () => {
      expect(messages([...tree(), { path: 'README.md', text: '# Content' }])).toEqual([]);
    });

    test.each([
      'notes.txt',
      'practices/hindu/shiva/om-namah-shivaya.yml',
      'practices/hindu/om-namah-shivaya.yaml',
      'deities/shiva.yaml',
      'traditions/hindu/extra.yaml',
      'stotras/hindu/shiva/rudram.yaml',
      'deities/hindu/README.md',
    ])('%s is not a catalog file', (path) => {
      expect(messages([...tree(), { path, text: 'id: x' }])).toEqual([
        `${path}: Not a catalog file. See docs/architecture/content-pipeline.md for the layout`,
      ]);
    });

    test('the id must match the file name', () => {
      const files = replace(tree(), file('deities/hindu/shiva.yaml', deity('siva')));

      expect(messages(files)).toContain(
        'deities/hindu/shiva.yaml: The id is `siva`, but the file is named `shiva.yaml`',
      );
    });

    test('a deity lives in its tradition folder', () => {
      const files = [
        ...tree(),
        file('traditions/jain.yaml', { ...hindu, id: 'jain' }),
        file('deities/jain/mahavira.yaml', deity('mahavira')),
      ];

      expect(messages(files)).toEqual([
        'deities/jain/mahavira.yaml: The tradition is `hindu`, but the file is in `deities/jain/`',
      ]);
    });

    test('a practice lives in its tradition and primary deity folders', () => {
      const files = [
        ...tree(),
        file('deities/hindu/parvati.yaml', deity('parvati')),
        file(
          'practices/hindu/parvati/om-uma.yaml',
          mantra('om-uma', { deity_ids: ['shiva', 'parvati'] }),
        ),
      ];

      expect(messages(files)).toEqual([
        'practices/hindu/parvati/om-uma.yaml: The primary deity is `shiva`, but the file is in `practices/hindu/parvati/`',
      ]);
    });

    test('a practice in the wrong tradition folder', () => {
      const files = [...tree(), file('practices/sikh/shiva/om-namah.yaml', mantra('om-namah'))];

      expect(messages(files)).toContain(
        'practices/sikh/shiva/om-namah.yaml: The tradition is `hindu`, but the file is in `practices/sikh/`',
      );
    });
  });

  describe('parsing', () => {
    test('a YAML syntax error names the line', () => {
      const files = replace(tree(), {
        path: 'deities/hindu/shiva.yaml',
        text: 'id: shiva\nnames: [unclosed\n',
      });

      const [issue] = validateContent(files).issues;
      expect(issue?.file).toBe('deities/hindu/shiva.yaml');
      expect(issue?.line).toBeGreaterThan(0);
    });

    test('a key written twice is an error, not a silent overwrite', () => {
      const files = replace(tree(), {
        path: 'deities/hindu/shiva.yaml',
        text: `${stringify(deity('shiva'))}sort_order: 3\n`,
      });

      expect(messages(files).join('\n')).toMatch(/deities\/hindu\/shiva\.yaml: .*unique/i);
    });

    test('an empty file is an error', () => {
      const files = replace(tree(), { path: 'traditions/hindu.yaml', text: '' });

      expect(messages(files)).toContain('traditions/hindu.yaml: Expected an object, got nothing');
    });

    test('a schema issue gives its field path and line', () => {
      const step = mantra('om-namah-shivaya').steps[0]!;
      const bad = mantra('om-namah-shivaya', {
        steps: [{ ...step, text: { ...step.text, tamil: 'ௐ நம꞉ ஶிவாய' } }],
      });
      const files = replace(tree(), file('practices/hindu/shiva/om-namah-shivaya.yaml', bad));

      const issues = validateContent(files).issues;
      expect(issues).toEqual([
        {
          file: 'practices/hindu/shiva/om-namah-shivaya.yaml',
          path: ['steps', 0, 'text'],
          line: expect.any(Number),
          message: '`tamil` generated at build time; write only `devanagari`, `iast`',
        },
      ]);
    });

    test('an unknown key is reported at its own line', () => {
      const files = replace(tree(), {
        path: 'traditions/hindu.yaml',
        text: `${stringify(hindu)}colour: saffron\n`,
      });

      expect(validateContent(files).issues).toEqual([
        { file: 'traditions/hindu.yaml', path: [], line: 8, message: 'Unrecognized key: "colour"' },
      ]);
    });

    test('each unknown key is its own issue at its own line', () => {
      const files = replace(tree(), {
        path: 'traditions/hindu.yaml',
        text: `${stringify(hindu)}colour: saffron\nmotto: om\n`,
      });

      expect(validateContent(files).issues).toEqual([
        { file: 'traditions/hindu.yaml', path: [], line: 8, message: 'Unrecognized key: "colour"' },
        { file: 'traditions/hindu.yaml', path: [], line: 9, message: 'Unrecognized key: "motto"' },
      ]);
    });

    test('dates stay strings: YAML timestamps are not parsed', () => {
      const reviewed = mantra('om-namah-shivaya', {
        review: { advisor: 'Pandit A', reviewed_on: '2026-09-20', version: 1 },
      });
      const text = stringify(reviewed).replace("'2026-09-20'", '2026-09-20');
      const files = replace(tree(), {
        path: 'practices/hindu/shiva/om-namah-shivaya.yaml',
        text,
      });

      expect(messages(files)).toEqual([]);
    });
  });

  describe('references between files', () => {
    test('an id used twice', () => {
      const files = [
        ...tree(),
        file('deities/hindu/parvati.yaml', deity('parvati')),
        file(
          'practices/hindu/parvati/om-namah-shivaya.yaml',
          mantra('om-namah-shivaya', { deity_ids: ['parvati'] }),
        ),
      ];

      expect(messages(files)).toEqual([
        'practices/hindu/parvati/om-namah-shivaya.yaml: Practice `om-namah-shivaya` is also defined in practices/hindu/shiva/om-namah-shivaya.yaml',
        'practices/hindu/shiva/om-namah-shivaya.yaml: Practice `om-namah-shivaya` is also defined in practices/hindu/parvati/om-namah-shivaya.yaml',
      ]);
    });

    test('a deity and its parent share a tradition', () => {
      const files = [
        ...tree(),
        file('traditions/jain.yaml', { ...hindu, id: 'jain' }),
        file(
          'deities/jain/mahavira.yaml',
          deity('mahavira', { tradition_id: 'jain', parent_id: 'shiva' }),
        ),
      ];

      expect(messages(files)).toEqual([
        'deities/jain/mahavira.yaml: Deity `shiva` is in tradition `hindu`, not `jain`',
      ]);
    });

    test("a practice's deities share its tradition", () => {
      const files = replace(
        tree(),
        file('traditions/jain.yaml', { ...hindu, id: 'jain' }),
        file('deities/jain/mahavira.yaml', deity('mahavira', { tradition_id: 'jain' })),
        file(
          'practices/hindu/shiva/om-namah-shivaya.yaml',
          mantra('om-namah-shivaya', { deity_ids: ['shiva', 'mahavira'] }),
        ),
      );

      expect(messages(files)).toEqual([
        'practices/hindu/shiva/om-namah-shivaya.yaml: Deity `mahavira` is in tradition `jain`, not `hindu`',
      ]);
    });

    test("a deity's tradition must exist", () => {
      const files = tree().filter((f) => f.path !== 'traditions/hindu.yaml');

      expect(messages(files)).toEqual([
        'deities/hindu/shiva.yaml: Tradition `hindu` has no file in traditions/',
        'practices/hindu/shiva/om-namah-shivaya.yaml: Tradition `hindu` has no file in traditions/',
      ]);
    });

    test("a deity's parent must exist", () => {
      const files = [
        ...tree(),
        file('deities/hindu/durga.yaml', deity('durga', { parent_id: 'devi' })),
      ];

      expect(messages(files)).toEqual(['deities/hindu/durga.yaml: No deity `devi`']);
    });

    test('forms and aspects never loop', () => {
      const files = [
        ...tree(),
        file('deities/hindu/durga.yaml', deity('durga', { parent_id: 'devi' })),
        file('deities/hindu/devi.yaml', deity('devi', { parent_id: 'durga' })),
      ];

      expect(messages(files)).toEqual([
        'deities/hindu/devi.yaml: Parents loop: devi → durga → devi',
        'deities/hindu/durga.yaml: Parents loop: durga → devi → durga',
      ]);
    });

    test("a deity's featured practice must exist and be that deity's", () => {
      const files = [
        ...tree(),
        file('deities/hindu/ganesh.yaml', deity('ganesh', { featured_practice_id: 'om-gam' })),
        file('deities/hindu/ram.yaml', deity('ram', { featured_practice_id: 'om-namah-shivaya' })),
      ];

      expect(messages(files)).toEqual([
        'deities/hindu/ganesh.yaml: No practice `om-gam`',
        'deities/hindu/ram.yaml: Practice `om-namah-shivaya` is not a practice of `ram`',
      ]);
    });

    test("a practice's deities must exist", () => {
      const files = replace(
        tree(),
        file(
          'practices/hindu/shiva/om-namah-shivaya.yaml',
          mantra('om-namah-shivaya', { deity_ids: ['shiva', 'parvati'] }),
        ),
      );

      expect(messages(files)).toEqual([
        'practices/hindu/shiva/om-namah-shivaya.yaml: No deity `parvati`',
      ]);
    });

    test("a program's practices must exist", () => {
      const files = replace(tree(), file('programs/mandala-40.yaml', program('mandala-40', 'x')));

      expect(messages(files)).toEqual(['programs/mandala-40.yaml: No practice `x`']);
    });

    test('references to a file that failed to parse are not reported twice', () => {
      const broken = deity('shiva', { sort_order: 'first' });
      const files = replace(tree(), file('deities/hindu/shiva.yaml', broken));

      expect(validateContent(files).issues.map((i) => i.file)).toEqual([
        'deities/hindu/shiva.yaml',
      ]);
    });
  });

  describe('transliteration', () => {
    test('a practice whose IAST and source disagree, at the line of the IAST', () => {
      const step = mantra('om-namah-shivaya').steps[0]!;
      const typo = mantra('om-namah-shivaya', {
        steps: [{ ...step, text: { devanagari: 'ॐ नमः शिवाय', iast: 'oṃ namaḥ sivāya' } }],
      });
      const files = replace(tree(), file('practices/hindu/shiva/om-namah-shivaya.yaml', typo));

      const [issue, ...rest] = validateContent(files).issues;
      const text = files.find((f) => f.path.startsWith('practices/'))!.text;
      const iastLine = text.split('\n').findIndex((line) => line.includes('sivāya')) + 1;

      expect(rest).toEqual([]);
      expect(issue).toEqual({
        file: 'practices/hindu/shiva/om-namah-shivaya.yaml',
        path: ['steps', 0, 'text', 'iast'],
        line: iastLine,
        message: 'Doesn’t match the `devanagari`, which reads “oṃ namaḥ śivāya”',
      });
    });

    test('a practice that failed its schema is not transliterated', () => {
      const broken = mantra('om-namah-shivaya', { version: 0 });
      const files = replace(tree(), file('practices/hindu/shiva/om-namah-shivaya.yaml', broken));

      expect(validateContent(files).issues.map((i) => i.path)).toEqual([['version']]);
    });
  });

  describe('base packs are English', () => {
    const NEEDS_EN = 'Needs `en`: base packs are English';
    const PRACTICE = 'practices/hindu/shiva/om-namah-shivaya.yaml';

    /** The line a field's value starts on: for a map, its first entry. */
    const valueLineOf = (files: ContentFile[], path: string, field: string) =>
      files
        .find((f) => f.path === path)!
        .text.split('\n')
        .findIndex((line) => line.startsWith(`${field}:`)) + 2;

    test.each(['title', 'repetition_word'])(
      'a practice %s without en is an issue at its line',
      (field) => {
        const files = replace(
          tree(),
          file(PRACTICE, mantra('om-namah-shivaya', { [field]: { hi: 'हिन्दी' } })),
        );

        expect(validateContent(files).issues).toEqual([
          {
            file: PRACTICE,
            path: [field],
            line: valueLineOf(files, PRACTICE, field),
            message: NEEDS_EN,
          },
        ]);
      },
    );

    test('deity names without en are an issue at their line', () => {
      const path = 'deities/hindu/shiva.yaml';
      const files = replace(
        tree(),
        file(path, deity('shiva', { names: { hi: { devanagari: 'शिव' } } })),
      );

      expect(validateContent(files).issues).toEqual([
        { file: path, path: ['names'], line: valueLineOf(files, path, 'names'), message: NEEDS_EN },
      ]);
    });

    test('other languages beside en are fine', () => {
      const files = replace(
        tree(),
        file(
          'deities/hindu/shiva.yaml',
          deity('shiva', { names: { en: { latin: 'Shiva' }, hi: { devanagari: 'शिव' } } }),
        ),
        file(
          PRACTICE,
          mantra('om-namah-shivaya', {
            title: { en: 'Om Namah Shivaya', hi: 'ॐ नमः शिवाय' },
            repetition_word: { en: 'japa', hi: 'जप' },
          }),
        ),
      );

      expect(validateContent(files).issues).toEqual([]);
    });
  });

  test('issues are sorted by file', () => {
    const files = replace(
      tree(),
      file('programs/mandala-40.yaml', program('mandala-40', 'x')),
      file('deities/hindu/shiva.yaml', deity('shiva', { parent_id: 'nobody' })),
    );

    expect(validateContent(files).issues.map((i) => i.file)).toEqual([
      'deities/hindu/shiva.yaml',
      'programs/mandala-40.yaml',
    ]);
  });
});

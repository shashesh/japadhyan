/**
 * Generates a practice's other scripts from its master text, and checks them.
 * See docs/architecture/content-pipeline.md#transliteration and
 * docs/decisions/2026-09-23-transliteration-library.md.
 *
 * - Indic scripts come from the source script, which the advisor wrote first.
 * - The IAST is checked against the source script, read through vidyut-lipi,
 *   so a typo in either shows. The IAST itself is never read back: vidyut-lipi
 *   misreads some IAST (ambuda-org/vidyut#253).
 * - Each generated script must hold no letters of the source script, and the
 *   scripts that can are converted back and must match the source exactly.
 * - `latin` comes from the IAST by our rules, unless written by hand.
 */

import type { Practice, Script, SourceScript, TextByScript } from '@japadhyan/shared';

import { latinFromIast } from './latin';
import { transliterate } from './lipi';

export interface GenerationIssue {
  path: readonly PropertyKey[];
  message: string;
}

export interface Generation {
  /** The practice with every generated script, as packs carry it. */
  practice: Practice;
  issues: readonly GenerationIssue[];
}

interface SourceRules {
  /** Scripts generated from this source script. */
  targets: readonly SourceScript[];
  /**
   * The source script's code points, as ranges. vidyut-lipi passes a letter
   * it has no mapping for through unchanged, so none may be left in a
   * generated script.
   */
  letters: readonly (readonly [number, number])[];
}

/** What each source script generates. Gurmukhi and Tibetan wait for P2. */
const GENERATED: Partial<Record<SourceScript, SourceRules>> = {
  devanagari: {
    targets: ['tamil', 'telugu', 'kannada', 'gujarati', 'bengali'],
    // Devanagari, except the daṇḍas U+0964 and U+0965 that other Indic
    // scripts use too; Devanagari Extended.
    letters: [
      [0x0900, 0x0963],
      [0x0966, 0x097f],
      [0xa8e0, 0xa8ff],
    ],
  },
};

/** Scripts that convert back letter for letter. Bengali writes va and ba alike. */
const ROUND_TRIPS: ReadonlySet<SourceScript> = new Set(['tamil', 'telugu', 'kannada', 'gujarati']);

/** Punctuation the IAST check ignores: daṇḍas in any form, and the like. */
const PUNCTUATION = /[|.।॥,;!?]/g;

type Path = readonly PropertyKey[];

interface Generated<T> {
  value: T;
  issues: GenerationIssue[];
}

export function generatePractice(practice: Practice): Generation {
  const source = practice.source_script;
  const issues: GenerationIssue[] = [];
  if (GENERATED[source] === undefined) {
    const from = Object.keys(GENERATED)
      .map((s) => `\`${s}\``)
      .join(', ');
    issues.push({
      path: ['source_script'],
      message: `Scripts are generated only from ${from} so far, not \`${source}\``,
    });
  }
  const collect = <T>(generated: Generated<T>) => {
    issues.push(...generated.issues);
    return generated.value;
  };

  const steps = practice.steps.map((step, i) => {
    const at = ['steps', i];
    return {
      ...step,
      text: collect(generateText(step.text, source, (s) => [...at, 'text', s])),
      words:
        step.words &&
        collect(generateWords(step.words, source, [...at, 'words'], 'latin' in step.text)),
      name: step.name && collect(generateText(step.name, source, (s) => [...at, 'name', s])),
    };
  });

  return { practice: { ...practice, steps } as Practice, issues };
}

/** One text in every script, with `pathOf` placing each script's issues. */
function generateText(
  text: TextByScript,
  source: SourceScript,
  pathOf: (script: Script) => Path,
): Generated<TextByScript> {
  const master = text[source];
  const iast = text.iast;
  // The content schema reports a missing master text.
  if (master === undefined || iast === undefined) return { value: text, issues: [] };

  const issues: GenerationIssue[] = [];
  const issue = (script: Script, message: string) => issues.push({ path: pathOf(script), message });
  const rules = GENERATED[source];

  const formProblem = iastFormProblem(iast);
  if (formProblem) {
    issue('iast', formProblem);
  } else if (rules) {
    const read = transliterate(master, source, 'iast');
    if (comparable(read) !== comparable(iast)) {
      issue('iast', `Doesn’t match the \`${source}\`, which reads “${read.trim()}”`);
    }
  }

  const generated: TextByScript = {};
  for (const target of rules?.targets ?? []) {
    const out = transliterate(master, source, target);
    generated[target] = out;
    const left = leftovers(out, rules?.letters ?? []);
    if (left.length > 0) {
      const letters = left.map((l) => `“${l}”`).join(', ');
      issue(target, `Left ${letters} from the \`${source}\` in the \`${target}\``);
    } else if (ROUND_TRIPS.has(target)) {
      const back = transliterate(out, target, source);
      if (back.normalize('NFC') !== master.normalize('NFC')) {
        issue(target, `Doesn’t convert back to the \`${source}\`: “${out}” reads “${back}”`);
      }
    }
  }

  let latin = text.latin;
  if (latin === undefined && !formProblem) {
    const result = latinFromIast(iast);
    if (result.ok) latin = result.latin;
    else issue('latin', result.message);
  }

  return { value: { ...text, ...generated, ...(latin === undefined ? {} : { latin }) }, issues };
}

type Words = Partial<Record<Script, readonly string[]>>;

/** A mantra's words, one by one, in every script. */
function generateWords(
  words: Words,
  source: SourceScript,
  path: Path,
  textHasOwnLatin: boolean,
): Generated<Words> {
  const master = words[source];
  const iast = words.iast;
  if (master === undefined || iast === undefined) return { value: words, issues: [] };

  const count = (script: Script, n: number, other: Script, m: number): GenerationIssue => ({
    path: [...path, script],
    message: `Has ${n} word${n === 1 ? '' : 's'}; the \`${other}\` has ${m}`,
  });
  if (iast.length !== master.length) {
    return { value: words, issues: [count('iast', iast.length, source, master.length)] };
  }

  const issues: GenerationIssue[] = [];
  let latin = words.latin;
  if (latin !== undefined && latin.length !== iast.length) {
    issues.push(count('latin', latin.length, 'iast', iast.length));
    latin = undefined;
  }
  if (textHasOwnLatin && words.latin === undefined) {
    issues.push({ path, message: '`text` has a hand-written `latin`, so write one here too' });
  }

  const byScript: Partial<Record<Script, string[]>> = {};
  master.forEach((word, j) => {
    const text: TextByScript = {
      [source]: word,
      iast: iast[j]!,
      ...(latin === undefined ? {} : { latin: latin[j]! }),
    };
    const { value, issues: wordIssues } = generateText(text, source, (s) => [...path, s, j]);
    issues.push(...wordIssues);
    for (const [script, out] of Object.entries(value) as [Script, string][]) {
      byScript[script] = [...(byScript[script] ?? []), out];
    }
  });

  return { value: { ...words, ...byScript }, issues };
}

/** vidyut-lipi garbles capitalised IAST and reads ṁ as a Vedic anusvara. */
function iastFormProblem(iast: string): string | null {
  const text = iast.normalize('NFC');
  if (/\p{Lu}/u.test(text)) return 'Write IAST in lower case';
  if (text.includes('ṁ')) return 'Write the anusvara as ṃ, not ṁ';
  return null;
}

const comparable = (iast: string) =>
  iast.normalize('NFC').replace(/’/g, "'").replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();

/** Letters of the source script in `text`, each once. */
function leftovers(text: string, ranges: SourceRules['letters']): string[] {
  const inSource = (letter: string) => {
    const code = letter.codePointAt(0)!;
    return ranges.some(([first, last]) => code >= first && code <= last);
  };
  return [...new Set([...text].filter(inSource))];
}

/**
 * `latin`, the spelling devotees know ("Om Namah Shivaya"), from IAST. No
 * library writes it, so these are our rules, one test per rule. See
 * docs/decisions/2026-09-23-transliteration-library.md#how-latin-is-produced.
 * Where the common spelling drops vowels the Sanskrit keeps ("Shri Ram Jai
 * Ram"), the content carries a hand-written `latin` instead.
 */

export type LatinResult = { ok: true; latin: string } | { ok: false; message: string };

/** IAST letters that change; plain a–z pass through. */
const LETTERS: Readonly<Record<string, string>> = {
  ā: 'a',
  ī: 'i',
  ū: 'u',
  ṛ: 'ri',
  ṝ: 'ri',
  ś: 'sh',
  ṣ: 'sh',
  c: 'ch',
  ṭ: 't',
  ḍ: 'd',
  ṇ: 'n',
  ṅ: 'n',
  ñ: 'n',
  ḥ: 'h',
};

/** Avagraha and daṇḍas, in the forms IAST writes them. */
const DROPPED = new Set(["'", '’', '|', '.', '।', '॥']);

const ANUSVARA = 'ṃ';
const CANDRABINDU = /m̐/g;

/**
 * The anusvara is written n before these, and before their aspirates, which
 * start with the same letter: śaṃkara → Shankara. Everywhere else it is m.
 */
const N_BEFORE = new Set(['k', 'g', 'c', 'j', 'ṭ', 'ḍ', 't', 'd']);

export function latinFromIast(iast: string): LatinResult {
  const letters = [...iast.normalize('NFC').replace(CANDRABINDU, ANUSVARA)];
  const unknown = new Set<string>();

  const out = letters.map((letter, i) => {
    if (letter === ANUSVARA) return N_BEFORE.has(letters[i + 1] ?? '') ? 'n' : 'm';
    if (letter in LETTERS) return LETTERS[letter];
    if (DROPPED.has(letter)) return '';
    if (/^[a-z\s]$/.test(letter)) return letter;
    unknown.add(letter);
    return '';
  });

  if (unknown.size > 0) {
    const named = [...unknown].map((letter) => `“${letter}”`).join(', ');
    return {
      ok: false,
      message: `No \`latin\` rule for ${named}. Add one, or write \`latin\` by hand`,
    };
  }

  const words = out.join('').split(/\s+/).filter(Boolean);
  return { ok: true, latin: words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ') };
}

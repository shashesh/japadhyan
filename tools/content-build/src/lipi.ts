/**
 * vidyut-lipi, through its WebAssembly build. The only file that imports it,
 * so replacing the library touches nothing else. See
 * docs/decisions/2026-09-23-transliteration-library.md.
 */

import { readFileSync } from 'node:fs';

import type { SourceScript } from '@japadhyan/shared';
import { initSync, Scheme, transliterate as vidyut } from '@siva-sh/vidyut';
import wasmUrl from '@siva-sh/vidyut/wasm-url';

const SCHEME: Readonly<Record<SourceScript, Scheme>> = {
  iast: Scheme.Iast,
  devanagari: Scheme.Devanagari,
  gurmukhi: Scheme.Gurmukhi,
  tamil: Scheme.Tamil,
  telugu: Scheme.Telugu,
  kannada: Scheme.Kannada,
  bengali: Scheme.Bengali,
  gujarati: Scheme.Gujarati,
  tibetan: Scheme.Tibetan,
};

let loaded = false;

/** `text` from one script to another. `latin` is ours, in `latin.ts`. */
export function transliterate(text: string, from: SourceScript, to: SourceScript): string {
  if (!loaded) {
    // The bytes from disk, so the library never fetches anything.
    initSync({ module: readFileSync(wasmUrl) });
    loaded = true;
  }
  return vidyut(text, SCHEME[from], SCHEME[to]);
}

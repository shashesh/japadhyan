/**
 * Building blocks shared by the catalog and pack schemas. Internal to
 * `schemas/`: not exported from the package.
 */

import { z } from 'zod';

export const nonBlank = z.string().regex(/\S/, 'Must not be blank');
export const positiveInt = z.number().int().positive();
export const nonNegativeInt = z.number().int().nonnegative();

export const traditionId = z.enum(['hindu', 'sikh', 'buddhist', 'jain']);
export const script = z.enum([
  'latin',
  'iast',
  'devanagari',
  'gurmukhi',
  'tamil',
  'telugu',
  'kannada',
  'bengali',
  'gujarati',
  'tibetan',
]);

/**
 * A language tag: a BCP 47 language, optional script and optional region, in
 * canonical case — `en`, `pt-BR`, `es-419`, `sa-Latn`, `zh-Hant-TW`. Narrower
 * than BCP 47 on purpose: keys are matched exactly, so each language has one
 * spelling, and extensions (`-u-`, `-x-`) say nothing about a text's language.
 */
export const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;
export const languageTag = z.string().regex(LANGUAGE_TAG, 'Not a language tag');

export const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Not a lowercase SHA-256');

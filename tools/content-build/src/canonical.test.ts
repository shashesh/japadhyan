import { describe, expect, test } from 'vitest';

import { canonicalJson } from './canonical';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// Built from code points, so no editor or formatter can normalise them.
const u = (...codes: number[]) => String.fromCodePoint(...codes);
/** ऩ as one code point, and as न plus a nukta. */
const [composed, decomposed] = [u(0x0929), u(0x0928, 0x093c)];

describe('canonicalJson', () => {
  test('keys are sorted at every depth; arrays keep their order', () => {
    const value = { b: 1, a: { d: [3, 1, 2], c: null } };

    expect(text(canonicalJson(value))).toBe('{"a":{"c":null,"d":[3,1,2]},"b":1}');
  });

  test('keys sort by code point, not by locale', () => {
    expect(text(canonicalJson({ b: 1, B: 2, a: 3, 'a-b': 4 }))).toBe(
      '{"B":2,"a":3,"a-b":4,"b":1}',
    );
  });

  test('strings are NFC', () => {
    // Café: é as one code point, and as e plus a combining accent.
    const cafe = [u(0x63, 0x61, 0x66, 0xe9), u(0x63, 0x61, 0x66, 0x65, 0x301)];

    expect(decomposed).not.toBe(composed);
    expect(canonicalJson({ [decomposed]: decomposed })).toEqual(
      canonicalJson({ [composed]: composed }),
    );
    expect(canonicalJson(cafe[1])).toEqual(canonicalJson(cafe[0]));
  });

  test('two keys that are the same in NFC are an error', () => {
    const value = { [composed]: 1, [decomposed]: 2 };

    expect(() => canonicalJson(value)).toThrow(/written twice/);
  });

  test('keys above U+FFFF sort by code point', () => {
    // U+FF5E is below U+1F600, but its UTF-16 unit is above 0xD83D.
    const [high, low] = [u(0x1f600), u(0xff5e)];

    expect(text(canonicalJson({ [high]: 1, [low]: 2 }))).toBe(`{"${low}":2,"${high}":1}`);
  });

  test('no whitespace, UTF-8, no trailing newline', () => {
    const bytes = canonicalJson({ mantra: 'ॐ नमः शिवाय', list: [1, 2] });

    expect(text(bytes)).toBe('{"list":[1,2],"mantra":"ॐ नमः शिवाय"}');
    expect(bytes).toEqual(new TextEncoder().encode('{"list":[1,2],"mantra":"ॐ नमः शिवाय"}'));
    expect(bytes.at(-1)).not.toBe(0x0a);
  });

  test('undefined fields are an error, not dropped', () => {
    expect(() => canonicalJson({ practice: { title: undefined } })).toThrow(/practice\.title/);
    expect(() => canonicalJson([1, undefined])).toThrow(/\[1\]/);
  });

  test('values JSON cannot hold faithfully are an error', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/n/);
    expect(() => canonicalJson({ n: Infinity })).toThrow(/n/);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(/f/);
    expect(() => canonicalJson({ d: new Date(0) })).toThrow(/d/);
  });
});

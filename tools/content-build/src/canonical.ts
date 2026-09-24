/**
 * Canonical JSON: the exact bytes every pack and the manifest are written as,
 * so building the same content twice gives the same SHA-256. Keys sorted by
 * code point at every depth, arrays in order, strings in NFC, no whitespace,
 * UTF-8, no trailing newline. See docs/architecture/content-pipeline.md#packs.
 */

type Path = readonly (string | number)[];

/**
 * `value` as canonical JSON bytes. Anything JSON can't hold faithfully —
 * `undefined`, a non-finite number, a function, a class instance — is an
 * error naming where it is, so a build bug shows instead of vanishing.
 */
export function canonicalJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(serialise(value, []));
}

function serialise(value: unknown, path: Path): string {
  if (value === null || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, `is ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => serialise(item, [...path, i])).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, item]) => {
      const nfc = key.normalize('NFC');
      return [nfc, serialise(item, [...path, nfc])] as const;
    });
    entries.sort(([a], [b]) => byCodePoint(a, b));
    entries.forEach(([key], i) => {
      if (i > 0 && entries[i - 1]![0] === key) fail([...path, key], 'is written twice');
    });
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${item}`).join(',')}}`;
  }
  return fail(path, value === undefined ? 'is undefined' : `is a ${typeof value}, not JSON`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** String order by code point. `<` compares UTF-16 units, which differs above U+FFFF. */
function byCodePoint(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const diff = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (diff !== 0) return diff;
  }
  return x.length - y.length;
}

function fail(path: Path, problem: string): never {
  const where = path
    .map((part, i) => (typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`))
    .join('');
  throw new Error(`Canonical JSON: ${where || 'the value'} ${problem}`);
}

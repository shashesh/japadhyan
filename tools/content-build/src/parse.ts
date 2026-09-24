import { contentSchemas } from '@japadhyan/shared';
import { isNode, LineCounter, parseDocument, type Document } from 'yaml';

import type { Kind } from './layout';

/** A problem in one file, at a field (`[]` for the whole file) and line when known. */
export interface ContentIssue {
  file: string;
  path: readonly PropertyKey[];
  line?: number;
  message: string;
}

type Path = readonly PropertyKey[];

/** Finds the line of a field, or of its closest parent that exists. */
export type Locate = (path: Path) => number | undefined;

const SCHEMAS = {
  tradition: contentSchemas.tradition,
  deity: contentSchemas.deity,
  practice: contentSchemas.practice,
  program: contentSchemas.program,
} as const;

type Parsed<K extends Kind> = ReturnType<(typeof SCHEMAS)[K]['parse']>;

export type ParseResult<K extends Kind> =
  { ok: true; value: Parsed<K>; locate: Locate } | { ok: false; issues: ContentIssue[] };

/**
 * Parses a file as YAML 1.2 — no timestamps, so dates stay strings, and a
 * key written twice is an error — then checks it against its content schema.
 */
export function parseFile<K extends Kind>(file: string, text: string, kind: K): ParseResult<K> {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, uniqueKeys: true });
  const locate: Locate = (path) => lineOf(doc, lines, path);

  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((error) => ({
        file,
        path: [],
        line: error.linePos?.[0].line,
        message: firstLine(error.message),
      })),
    };
  }
  if (doc.contents === null) {
    return { ok: false, issues: [{ file, path: [], message: 'Expected an object, got nothing' }] };
  }

  const result = SCHEMAS[kind].safeParse(doc.toJS());
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.flatMap((issue) =>
        // Zod reports every unknown key of an object as one issue; split it so
        // each key gets its own line.
        issue.code === 'unrecognized_keys'
          ? issue.keys.map((key) => ({
              file,
              path: issue.path,
              line: locate([...issue.path, key]),
              message: `Unrecognized key: "${key}"`,
            }))
          : [{ file, path: issue.path, line: locate(issue.path), message: issue.message }],
      ),
    };
  }
  return { ok: true, value: result.data as Parsed<K>, locate };
}

function lineOf(doc: Document, lines: LineCounter, path: Path): number | undefined {
  for (let depth = path.length; depth >= 0; depth--) {
    const node = doc.getIn(path.slice(0, depth), true);
    if (isNode(node) && node.range) return lines.linePos(node.range[0]).line;
  }
  return undefined;
}

/** The YAML library's message without its " at line …" suffix and source excerpt. */
const firstLine = (message: string) =>
  message.split('\n')[0]!.replace(/ at line \d+, column \d+:?$/, '');

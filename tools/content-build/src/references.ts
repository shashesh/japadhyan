/**
 * Rules that span files: ids are unique, and every id a file refers to has
 * a file of its own, in the right tradition. A file that failed to parse
 * still counts as existing, so its mistake is reported once, where it is.
 */

import type { Deity, Practice, Program, Tradition } from '@japadhyan/shared';

import type { Kind } from './layout';
import type { ContentIssue, Locate } from './parse';

export interface Entry<T> {
  file: string;
  value: T;
  locate: Locate;
}

export interface Entries {
  tradition: readonly Entry<Tradition>[];
  deity: readonly Entry<Deity>[];
  practice: readonly Entry<Practice>[];
  program: readonly Entry<Program>[];
}

/** Ids of files that failed to parse, taken from their file names. */
export type Unparsed = Record<Kind, ReadonlySet<string>>;

const LABEL: Record<Kind, string> = {
  tradition: 'Tradition',
  deity: 'Deity',
  practice: 'Practice',
  program: 'Program',
};

type Path = readonly PropertyKey[];

const issue = (entry: Entry<unknown>, path: Path, message: string): ContentIssue => ({
  file: entry.file,
  path,
  line: entry.locate(path),
  message,
});

export function referenceIssues(entries: Entries, unparsed: Unparsed): ContentIssue[] {
  const traditions = byId(entries.tradition);
  const deities = byId(entries.deity);
  const practices = byId(entries.practice);
  const known = (kind: Kind, index: Map<string, unknown>, id: string) =>
    index.has(id) || unparsed[kind].has(id);

  const traditionExists = (entry: Entry<Deity | Practice>) =>
    known('tradition', traditions, entry.value.tradition_id)
      ? []
      : [
          issue(
            entry,
            ['tradition_id'],
            `Tradition \`${entry.value.tradition_id}\` has no file in traditions/`,
          ),
        ];

  /** A deity that exists, in the given tradition. */
  const deityIn = (entry: Entry<unknown>, path: Path, id: string, tradition: string) => {
    if (!known('deity', deities, id)) return [issue(entry, path, `No deity \`${id}\``)];
    const other = deities.get(id)?.value.tradition_id;
    return other !== undefined && other !== tradition
      ? [issue(entry, path, `Deity \`${id}\` is in tradition \`${other}\`, not \`${tradition}\``)]
      : [];
  };

  const practiceExists = (entry: Entry<unknown>, path: Path, id: string) =>
    known('practice', practices, id) ? [] : [issue(entry, path, `No practice \`${id}\``)];

  const deityIssues = (entry: Entry<Deity>): ContentIssue[] => {
    const { id, parent_id, featured_practice_id, tradition_id } = entry.value;
    const featured =
      featured_practice_id === null ? undefined : practices.get(featured_practice_id);
    return [
      ...traditionExists(entry),
      ...(parent_id === null ? [] : deityIn(entry, ['parent_id'], parent_id, tradition_id)),
      ...parentLoop(entry, deities),
      ...(featured_practice_id === null
        ? []
        : practiceExists(entry, ['featured_practice_id'], featured_practice_id)),
      ...(featured && !featured.value.deity_ids.includes(id)
        ? [
            issue(
              entry,
              ['featured_practice_id'],
              `Practice \`${featured_practice_id}\` is not a practice of \`${id}\``,
            ),
          ]
        : []),
    ];
  };

  const practiceIssues = (entry: Entry<Practice>): ContentIssue[] => [
    ...traditionExists(entry),
    ...entry.value.deity_ids.flatMap((id, i) =>
      deityIn(entry, ['deity_ids', i], id, entry.value.tradition_id),
    ),
  ];

  const programIssues = (entry: Entry<Program>): ContentIssue[] =>
    (entry.value.days ?? []).flatMap((day, i) =>
      practiceExists(entry, ['days', i, 'practice_id'], day.practice_id),
    );

  return [
    ...duplicates('tradition', entries.tradition),
    ...duplicates('deity', entries.deity),
    ...duplicates('practice', entries.practice),
    ...duplicates('program', entries.program),
    ...entries.deity.flatMap(deityIssues),
    ...entries.practice.flatMap(practiceIssues),
    ...entries.program.flatMap(programIssues),
  ];
}

/** Each entry by id; the first file wins when an id is used twice. */
function byId<T extends { id: string }>(entries: readonly Entry<T>[]): Map<string, Entry<T>> {
  const index = new Map<string, Entry<T>>();
  for (const entry of entries) {
    if (!index.has(entry.value.id)) index.set(entry.value.id, entry);
  }
  return index;
}

/** Every file of a kind whose id another file of that kind also uses. */
function duplicates<T extends { id: string }>(
  kind: Kind,
  entries: readonly Entry<T>[],
): ContentIssue[] {
  return entries.flatMap((entry) => {
    const others = entries
      .filter((e) => e !== entry && e.value.id === entry.value.id)
      .map((e) => e.file);
    return others.length === 0
      ? []
      : [
          issue(
            entry,
            ['id'],
            `${LABEL[kind]} \`${entry.value.id}\` is also defined in ${others.join(', ')}`,
          ),
        ];
  });
}

/** A deity whose chain of parents comes back to itself. */
function parentLoop(entry: Entry<Deity>, deities: Map<string, Entry<Deity>>): ContentIssue[] {
  const chain = [entry.value.id];
  let next = entry.value.parent_id;
  while (next !== null) {
    if (next === entry.value.id) {
      return [issue(entry, ['parent_id'], `Parents loop: ${[...chain, next].join(' → ')}`)];
    }
    const parent = deities.get(next);
    // A loop further up that doesn't pass through this deity is reported by its members.
    if (!parent || chain.includes(next)) return [];
    chain.push(next);
    next = parent.value.parent_id;
  }
  return [];
}

import type { Deity, Practice, Program, Tradition } from '@japadhyan/shared';

import type { ContentFile } from './files';
import { placementOf, type Kind, type Placement } from './layout';
import { parseFile, type ContentIssue, type Locate } from './parse';
import { referenceIssues, type Entries, type Entry } from './references';

export type { ContentIssue } from './parse';

export interface Catalog {
  traditions: readonly Tradition[];
  deities: readonly Deity[];
  practices: readonly Practice[];
  programs: readonly Program[];
}

export interface Validation {
  /** Everything that parsed, whether or not it passed the checks across files. */
  catalog: Catalog;
  /** Sorted by file. Empty when the content is valid. */
  issues: readonly ContentIssue[];
}

const NOT_CATALOG = 'Not a catalog file. See docs/architecture/content-pipeline.md for the layout';

/**
 * Checks every file in `content/`: its place in the layout, its YAML, its
 * content schema, and its references to other files.
 */
export function validateContent(files: readonly ContentFile[]): Validation {
  const issues: ContentIssue[] = [];
  const entries = { tradition: [], deity: [], practice: [], program: [] } as {
    [K in keyof Entries]: Entries[K][number][];
  };
  const unparsed: Record<Kind, Set<string>> = {
    tradition: new Set(),
    deity: new Set(),
    practice: new Set(),
    program: new Set(),
  };

  for (const { path, text } of files) {
    const placement = placementOf(path);
    if (placement === 'ignored') continue;
    if (placement === null) {
      issues.push({ file: path, path: [], message: NOT_CATALOG });
      continue;
    }

    const result = parseFile(path, text, placement.kind);
    if (!result.ok) {
      issues.push(...result.issues);
      unparsed[placement.kind].add(placement.id);
      continue;
    }

    const entry = { file: path, value: result.value, locate: result.locate };
    issues.push(...placementIssues(entry, placement));
    (entries[placement.kind] as Entry<unknown>[]).push(entry);
  }

  issues.push(...referenceIssues(entries, unparsed));

  return {
    catalog: {
      traditions: entries.tradition.map((e) => e.value),
      deities: entries.deity.map((e) => e.value),
      practices: entries.practice.map((e) => e.value),
      programs: entries.program.map((e) => e.value),
    },
    issues: [...issues].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
  };
}

type AnyEntity = Tradition | Deity | Practice | Program;

/** The file's name and folders agree with what it says. */
function placementIssues(
  entry: { file: string; value: AnyEntity; locate: Locate },
  placement: Placement,
): ContentIssue[] {
  const { file, value, locate } = entry;
  const at = (path: PropertyKey[], message: string): ContentIssue => ({
    file,
    path,
    line: locate(path),
    message,
  });
  const issues: ContentIssue[] = [];

  if (value.id !== placement.id) {
    issues.push(
      at(['id'], `The id is \`${value.id}\`, but the file is named \`${placement.id}.yaml\``),
    );
  }
  if ('tradition_id' in value && placement.tradition !== null) {
    if (value.tradition_id !== placement.tradition) {
      const folder = `${placement.kind === 'deity' ? 'deities' : 'practices'}/${placement.tradition}/`;
      issues.push(
        at(
          ['tradition_id'],
          `The tradition is \`${value.tradition_id}\`, but the file is in \`${folder}\``,
        ),
      );
    }
  }
  if ('deity_ids' in value && placement.deity !== null) {
    const primary = value.deity_ids[0];
    if (primary !== placement.deity) {
      const folder = `practices/${placement.tradition}/${placement.deity}/`;
      issues.push(
        at(
          ['deity_ids', 0],
          `The primary deity is \`${primary}\`, but the file is in \`${folder}\``,
        ),
      );
    }
  }
  return issues;
}

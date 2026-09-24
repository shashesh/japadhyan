/**
 * Where each kind of catalog file lives in `content/`, and the ids its path
 * implies. See docs/architecture/content-pipeline.md.
 *
 * ```text
 * traditions/<id>.yaml
 * deities/<tradition>/<id>.yaml
 * practices/<tradition>/<primary deity>/<id>.yaml
 * programs/<id>.yaml
 * ```
 */

export type Kind = 'tradition' | 'deity' | 'practice' | 'program';

export interface Placement {
  kind: Kind;
  /** The id the file name implies. */
  id: string;
  /** The tradition folder, for deities and practices. */
  tradition: string | null;
  /** The primary deity folder, for practices. */
  deity: string | null;
}

const EXTENSION = '.yaml';

/** Files in `content/` that aren't catalog entries. */
const IGNORED = new Set(['README.md']);

/**
 * Where a file sits in the layout: a catalog entry, `'ignored'`, or `null`
 * when it has no place in the layout.
 */
export function placementOf(path: string): Placement | 'ignored' | null {
  if (IGNORED.has(path)) return 'ignored';

  const parts = path.split('/');
  const name = parts.at(-1)!;
  if (!name.endsWith(EXTENSION)) return null;
  const id = name.slice(0, -EXTENSION.length);

  const [folder, a = null, b = null] = parts;
  switch (`${folder}/${parts.length}`) {
    case 'traditions/2':
      return { kind: 'tradition', id, tradition: null, deity: null };
    case 'programs/2':
      return { kind: 'program', id, tradition: null, deity: null };
    case 'deities/3':
      return { kind: 'deity', id, tradition: a, deity: null };
    case 'practices/4':
      return { kind: 'practice', id, tradition: a, deity: b };
    default:
      return null;
  }
}

/** Where a practice lives in `content/`, which the layout check guarantees. */
export function practicePath(practice: {
  id: string;
  tradition_id: string;
  deity_ids: readonly string[];
}): string {
  return `practices/${practice.tradition_id}/${practice.deity_ids[0]}/${practice.id}${EXTENSION}`;
}

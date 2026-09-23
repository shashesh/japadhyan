/**
 * The read-only catalog: traditions, deities, practices and programs.
 * Authored in `content/`, delivered as packs, never written by the device.
 * See docs/architecture/data-model.md#catalog.
 *
 * Field names are snake_case to match future Supabase (Postgres) columns.
 */

/** Dharmic traditions the app supports. Hindu ships in P1; the rest in P2. */
export type TraditionId = 'hindu' | 'sikh' | 'buddhist' | 'jain';

/**
 * Scripts a practice's text can be shown in. The source script and `iast`
 * are the master text; the rest are generated at content build time.
 * `latin` is the simple common spelling, e.g. "Om Namah Shivaya".
 */
export type Script =
  | 'latin'
  | 'iast'
  | 'devanagari'
  | 'gurmukhi'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'bengali'
  | 'gujarati'
  | 'tibetan';

/** Text keyed by script. A practice need not carry every script. */
export type TextByScript = Partial<Record<Script, string>>;

/** A language tag, e.g. `en`, `hi`, `ne`. Content is authored per language. */
export type LanguageTag = string;

/** Text keyed by language tag. */
export type TextByLanguage = Partial<Record<LanguageTag, string>>;

/**
 * Media held in object storage, named by its SHA-256 and referenced from
 * content. Never stored in git. See docs/architecture/content-pipeline.md.
 */
export interface MediaRef {
  id: string;
  sha256: string;
  bytes: number;
  /** Audio only. */
  duration_ms?: number;
}

export interface Tradition {
  id: TraditionId;
  /** What the app calls a deity: "Deity", "The Name", "Tirthankaras"… */
  deity_label: TextByLanguage;
  /** "Offer at the lotus feet", "Dedicate the merit"… */
  offering_label: TextByLanguage;
  default_round_size: number;
  /** `false` for Sikh practice, which does not depict God. */
  show_images_by_default: boolean;
}

export interface Deity {
  id: string;
  tradition_id: TraditionId;
  /** Forms and aspects: Shailaputri → Durga → Devi. Browsing and Navadurga. */
  parent_id: string | null;
  names: Partial<Record<LanguageTag, TextByScript>>;
  summary: TextByLanguage;
  image: MediaRef | null;
  /** Pre-selected mala style, e.g. Rudraksha for Shiva. */
  suggested_mala: string | null;
  /** Opened when the devotee has no favourite for this deity. */
  featured_practice_id: string | null;
  sort_order: number;
}

/** `mantra` and `namavali` ship in P1; `stotra` in P2. */
export type PracticeKind = 'mantra' | 'namavali' | 'stotra';

/**
 * One step of a practice: the whole mantra, one name of a namavali, or one
 * verse of a stotra. Each namavali line is stored in full, never built from
 * a pattern — grammatical forms vary too much to generate reliably.
 */
export interface Step {
  text: TextByScript;
  /** Words in chanting order, for word-by-word tap. Mantras only. */
  words: Partial<Record<Script, readonly string[]>> | null;
  /** Namavali only: the name itself, e.g. "Keshava". */
  name: TextByScript | null;
  /** Namavali and stotra: a short meaning. */
  meaning: TextByLanguage | null;
  /** Position in the practice recording, for chant along (P2). */
  audio_start_ms: number | null;
  audio_end_ms: number | null;
}

/** Who reviewed this practice. Unreviewed content never ships in production. */
export interface ContentReview {
  advisor: string;
  /** Local day, YYYY-MM-DD. */
  reviewed_on: string;
}

/**
 * Every practice is an ordered list of steps. One pass through the steps is
 * one repetition. See docs/decisions/2026-09-22-practice-model-ordered-steps.md.
 */
export interface Practice {
  /** Readable slug, e.g. `om-namah-shivaya`. Never changes once published. */
  id: string;
  /**
   * Bumped on any text change. The number of steps may only change with a
   * version bump, and any version change resets a saved namavali position.
   */
  version: number;
  tradition_id: TraditionId;
  kind: PracticeKind;
  /** First is the primary deity. Hare Krishna is `['krishna', 'ram']`. */
  deity_ids: readonly string[];
  title: TextByLanguage;
  /** e.g. "108 names". */
  subtitle: TextByLanguage;
  /** Script the text was authored in: Devanagari for Sanskrit, … */
  source_script: Script;
  /** A mantra has 1 step; an Ashtottara has 108. */
  steps: readonly Step[];
  /** Repetitions per round: 108 for a mantra, 1 for a namavali. */
  default_round: number;
  /** Shown in the app: `japa` for a mantra, `paath` for a namavali. */
  repetition_word: TextByLanguage;
  intro: TextByLanguage;
  audio: MediaRef | null;
  source: string;
  /** Licence of the text, transliteration and translation. */
  licence: string;
  review: ContentReview | null;
}

export type ProgramKind = 'sankalpa_template' | 'festival';

/** One day of a program, e.g. a different form of the Devi each Navaratri day. */
export interface ProgramDay {
  day: number;
  practice_id: string;
  target: number | null;
  reading: TextByLanguage | null;
}

/** Catalog templates for sankalpas and festival programs. */
export interface Program {
  id: string;
  kind: ProgramKind;
  /** Days. */
  duration: number;
  days: readonly ProgramDay[] | null;
}

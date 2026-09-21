/**
 * Core domain types. Field names are snake_case to match future Supabase
 * (Postgres) column names, so the same types work on device and server.
 */

/** Dharmic traditions the app supports. Hindu ships in P1; the rest in P2. */
export type TraditionId = 'hindu' | 'sikh' | 'buddhist' | 'jain';

/** Scripts a mantra's text can be shown in. */
export type Script =
  | 'latin'
  | 'devanagari'
  | 'gurmukhi'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'bengali'
  | 'gujarati'
  | 'tibetan';

/**
 * Every way a repetition can be counted. All modes feed the same total
 * ("one count, many inputs"). See docs/product/features/chanting-modes.md.
 */
export type ChantMode =
  | 'mala_tap' // P1
  | 'word_tap' // P1
  | 'likhita_typing' // P1
  | 'silent_pace' // P1 - estimated
  | 'silent_breath' // P1 - estimated
  | 'volume_button' // P1
  | 'voice' // P2
  | 'watch' // P2
  | 'chant_along' // P2
  | 'listening' // P2 - counted separately, never in the chanted total
  | 'handwriting' // P3
  | 'ring'; // P4 - Bluetooth rings / smart malas

export interface Mantra {
  id: string;
  tradition: TraditionId;
  /** Deity, guru or focus, e.g. "Shiva". Optional for custom mantras. */
  deity: string | null;
  title: string;
  /** Mantra text per script. Empty for private guru mantras. */
  text: Partial<Record<Script, string>>;
  /** Words in chanting order, for word-by-word tap. Latin transliteration. */
  words: string[];
  /** Repetitions per round (mala). Usually 108. */
  round_size: number;
  /** Private guru (diksha) mantra: words are never stored or shared. */
  is_private: boolean;
  meaning: string | null;
}

/**
 * An append-only record of repetitions. Totals are always derived from
 * events, which makes offline sync safe: merging never loses or doubles counts.
 */
export interface CountEvent {
  id: string;
  mantra_id: string;
  session_id: string;
  mode: ChantMode;
  /** Repetitions in this event (1 for a tap; more for batched inputs). */
  count: number;
  /** True for modes that estimate, e.g. silent pace. */
  estimated: boolean;
  device_id: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface Sankalpa {
  id: string;
  mantra_id: string;
  title: string;
  /** Daily target in repetitions. */
  daily_target: number;
  /** Optional total target, e.g. 2,400,000 for a Gayatri anushthana. */
  total_target: number | null;
  /** Local date keys, YYYY-MM-DD. */
  start_date: string;
  end_date: string | null;
}

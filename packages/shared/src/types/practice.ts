/**
 * The devotee's own records: what they chant, when, and where they are in it.
 * Written on the device first, synced only after sign-in and consent.
 * See docs/architecture/data-model.md#your-data.
 */

import type { PracticeKind, Script, TextByScript, TraditionId } from './catalog';
import type { OwnedRecord, SyncFields } from './sync';

/**
 * Every way a repetition can be counted. All chanted modes feed the same
 * total ("one count, many inputs"); listening japa is kept apart.
 * See docs/product/features/chanting-modes.md.
 */
export type ChantMode =
  | 'mala_tap' // P1
  | 'word_tap' // P1 - mantras only
  | 'likhita_typing' // P1
  | 'silent_pace' // P1 - estimated
  | 'silent_breath' // P1 - estimated
  | 'volume_button' // P1
  | 'manual' // P1 - practice done elsewhere, logged by hand
  | 'correction' // P1 - a fix; may be negative
  | 'voice' // P2
  | 'watch' // P2
  | 'chant_along' // P2
  | 'listening' // P2 - counted separately, never in the chanted total
  | 'handwriting' // P3
  | 'ring'; // P4 - Bluetooth rings / smart malas

/**
 * A practice id is either a catalog slug (`vishnu-ashtottara`) or a custom
 * practice's UUID. The two formats never collide.
 */
export type PracticeId = string;

/** A local day key, YYYY-MM-DD. Days are grouped by this, never by UTC. */
export type DayKey = string;

/**
 * A practice the devotee wrote themselves. Same shape as a catalog Practice,
 * owned by them. P1: custom mantra and private guru mantra; custom namavali
 * is P2.
 */
export interface CustomPractice extends OwnedRecord, SyncFields {
  kind: PracticeKind;
  title: string;
  steps: readonly { text: TextByScript; words: readonly string[] | null }[];
  default_round: number;
  deity_ids: readonly string[] | null;
  tradition_id: TraditionId | null;
  source_script: Script | null;
  /**
   * A private guru (diksha) mantra: one step with no text, shown only as the
   * label the devotee chose. Its words are never typed, stored or shared.
   */
  is_private: boolean;
  created_at: string;
}

/** The devotee's relationship with one practice: their own settings for it. */
export interface SavedPractice extends OwnedRecord, SyncFields {
  practice_id: PracticeId;
  round_size: number;
  mala_style: string | null;
  preferred_mode: ChantMode | null;
  preferred_script: Script | null;
  /** Repetitions between offering moments, e.g. 11 or 108. */
  offer_every: number | null;
  daily_target: number | null;
  starred: boolean;
  last_chanted_at: string | null;
}

/** Which practice opens when the devotee picks a deity. */
export interface DeityDefault extends OwnedRecord, SyncFields {
  deity_id: string;
  practice_id: PracticeId;
}

/**
 * One sitting. Set once, then never changed, except to fill in an empty
 * `ended_at`. Carries the content it was chanted with, so a later content
 * update never makes its counts ambiguous.
 */
export interface Session extends OwnedRecord {
  practice_id: PracticeId;
  /** The practice version chanted. A content update ends the session. */
  practice_version: number;
  /** Steps per repetition at the time: 1 for a mantra, 108 for an Ashtottara. */
  steps_per_repetition: number;
  device_id: string;
  started_at: string;
  ended_at: string | null;
}

/**
 * An append-only record of repetitions. Totals are always derived from
 * events, which makes offline sync safe: merging never loses or doubles
 * counts. Sealed on write, then never edited — fixes are `correction` events.
 */
export interface CountEvent extends OwnedRecord {
  practice_id: PracticeId;
  session_id: string;
  mode: ChantMode;
  /** Repetitions in this event. Negative only for a `correction`. */
  count: number;
  /**
   * Steps per repetition **as chanted**, never the practice's current step
   * count. Names chanted is always `count × steps_per_repetition`.
   */
  steps_per_repetition: number;
  /** True for modes that estimate, e.g. silent pace. */
  estimated: boolean;
  device_id: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  /** The local day it was chanted. Days are grouped by this. */
  local_day: DayKey;
  /** Minutes east of UTC when it was chanted, e.g. 330 for IST. */
  tz_offset_min: number;
}

/**
 * The devotee's place in a namavali (and, in P2, a stotra). It is not a
 * count: totals always come from count events.
 * See docs/architecture/data-model.md#practiceposition.
 */
export interface PracticePosition extends OwnedRecord, SyncFields {
  practice_id: PracticeId;
  /** The version the marks belong to. Any version change resets the position. */
  practice_version: number;
  /** The name on screen. */
  step_index: number;
  /** Which steps have been chanted in the current pass: a bitset. */
  chanted_steps: Uint8Array;
  /** Which recitation the marks belong to. A bookmark, never a total. */
  pass_ordinal: number;
}

export type SankalpaStatus = 'active' | 'completed' | 'released';

export interface Sankalpa extends OwnedRecord, SyncFields {
  title: string;
  /** Either this… */
  practice_id: PracticeId | null;
  /** …or this, for programs with a different practice each day (Navaratri). */
  program_id: string | null;
  /** Repetitions. */
  daily_target: number | null;
  /** Repetitions, e.g. 2,400,000 for a Gayatri anushthana. */
  total_target: number | null;
  start_day: DayKey;
  /** Empty for open-ended sankalpas. */
  end_day: DayKey | null;
  /** Private. Never in analytics, sharing, community features or logs. */
  intention: string | null;
  /** `released` is the gentle word for letting a sankalpa go. */
  status: SankalpaStatus;
}

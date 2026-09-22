/**
 * The devotee's own records: what they chant, when, and where they are in it.
 * Written on the device first, synced only after sign-in and consent.
 *
 * Every field here follows the tables in docs/architecture/data-model.md.
 */

import type { LanguageTag, PracticeKind, Script, TextByScript, TraditionId } from './catalog';
import type { Hlc, OwnedRecord, SyncFields } from './sync';

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
  | 'correction' // P1 - adjusts a session, may be negative
  | 'voice' // P2
  | 'watch' // P2
  | 'chant_along' // P2
  | 'listening' // P2 - counted separately, never in the chanted total
  | 'handwriting' // P3
  | 'ring'; // P4 - Bluetooth rings / smart malas

/**
 * A mode the devotee can choose to chant in, and so the chant screen can open
 * in. `correction` and `manual` are bookkeeping — one adjusts a session, the
 * other logs practice done elsewhere — and neither is a way of chanting, so
 * neither can be a preference.
 */
export type ChantableMode = Exclude<ChantMode, 'correction' | 'manual'>;

/**
 * A practice id is either a catalog slug (`vishnu-ashtottara`) or a custom
 * practice's UUID. The two formats never collide.
 */
export type PracticeId = string;

/** A local day key, YYYY-MM-DD. Days are grouped by this, never by UTC. */
export type DayKey = string;

/** One per user. Before sign-in there is a local profile. */
export interface Profile extends OwnedRecord, SyncFields {
  display_name: string | null;
  /** From the phone's setting at first launch. */
  ui_language: LanguageTag;
  /** Script the mantra is shown in. */
  primary_script: Script;
  /** Show a second line in Latin script. */
  show_transliteration: boolean;
  /** Traditions to browse. P1: Hindu. */
  traditions: readonly TraditionId[];
  /**
   * When the devotee's day starts, in minutes after midnight. `0` by
   * default; `180` is 3 AM, for someone who rises for Brahma muhurta.
   */
  day_start_minutes: number;
  default_mala_style: string | null;
  haptics: boolean;
  sounds: boolean;
  /** `false` by default. */
  analytics_opt_in: boolean;
  /** Set when onboarding finishes; a returning user who signs in skips it. */
  onboarded_at: string | null;
}

/** One step of a practice the devotee wrote themselves. */
export interface CustomStep {
  text: TextByScript;
  words: readonly string[] | null;
}

interface CustomPracticeBase extends OwnedRecord, SyncFields {
  title: string;
  default_round: number;
  created_at: string;
}

/**
 * A practice the devotee wrote themselves. P1: custom mantra and private
 * guru mantra; custom namavali is P2.
 */
export interface OpenCustomPractice extends CustomPracticeBase {
  is_private: false;
  kind: PracticeKind;
  steps: readonly CustomStep[];
  deity_ids: readonly string[] | null;
  tradition_id: TraditionId | null;
  source_script: Script | null;
}

/**
 * A private guru (diksha) mantra. It has **no `steps` field at all**: the
 * words are never typed, stored, synced or shared, so there is nowhere for
 * them to live. It is one step long and shown only as the devotee's own
 * label, e.g. "My guru mantra".
 *
 * Word-by-word and typing are unavailable for it because they need the words.
 */
export interface PrivateGuruPractice extends CustomPracticeBase {
  is_private: true;
  kind: 'mantra';
  /** Always one step, which carries no text. */
  step_count: 1;
}

export type CustomPractice = OpenCustomPractice | PrivateGuruPractice;

/** True when this practice's words are never stored. Narrows the union. */
export function isPrivateGuruPractice(practice: CustomPractice): practice is PrivateGuruPractice {
  return practice.is_private;
}

/**
 * The devotee's relationship with one practice: their own settings for it.
 * Created the first time they chant it or star it; one per practice.
 */
export interface SavedPractice extends OwnedRecord, SyncFields {
  practice_id: PracticeId;
  /** Starred. */
  is_favourite: boolean;
  /** Order in the Favourites list. */
  favourite_order: number | null;
  /** Drives Recent and "open to your current practice". */
  last_used_at: string | null;
  /** Repetitions per day, e.g. 324 (3 malas) or 1 recitation. */
  daily_goal: number | null;
  /**
   * Mantras only; falls back to the practice's `default_round`. A namavali's
   * round is always one recitation.
   */
  round_size: number | null;
  /** Override; falls back to the profile. */
  mala_style: string | null;
  /** Mode the chant screen opens in. Never a correction or a manual log. */
  preferred_mode: ChantableMode | null;
  /** Repetitions between offerings: 11, 108, …; empty means end of round. */
  offer_every: number | null;
  /** Override of the profile's script. */
  script: Script | null;
  bell_at_meru: boolean;
  /** The traditional practice of not crossing the meru. */
  reverse_at_meru: boolean;
}

/** Which practice opens when the devotee picks a deity. One row per deity. */
export interface DeityDefault extends OwnedRecord, SyncFields {
  deity_id: string;
  practice_id: PracticeId;
}

/**
 * One sitting. Set once, then never changed, except to fill in an empty
 * `ended_at`.
 *
 * **A session never crosses a local day**, and ends when its practice's
 * content updates, so every event and correction in it shares one
 * `local_day` and one `steps_per_repetition`.
 */
export interface Session extends OwnedRecord {
  practice_id: PracticeId;
  device_id: string;
  /** Created at the first count. */
  started_at: string;
  /**
   * Set when the devotee leaves the chant screen, after 30 minutes idle, at
   * the day boundary, or when the practice's content updates.
   */
  ended_at: string | null;
  /** The one local day this session belongs to. */
  local_day: DayKey;
  tz_offset_min: number;
  /** The practice as it was when the session began. */
  practice_version: number;
  /** 1 for a mantra, 108 for an Ashtottara. Every event shares it. */
  steps_per_repetition: number;
}

/**
 * An append-only record of completed repetitions. Totals are always derived
 * from events, which makes offline sync safe: merging never loses or doubles
 * counts. Sealed on write, then never edited — fixes are `correction` events.
 */
export interface CountEvent extends OwnedRecord {
  practice_id: PracticeId;
  session_id: string;
  mode: ChantMode;
  /** Completed repetitions; recitations for a namavali. Negative only for a correction. */
  count: number;
  /** True for silent pace and breath. */
  estimated: boolean;
  device_id: string;
  /** UTC. For ordering. */
  created_at: string;
  /**
   * The source of truth for which day this count belongs to, using the
   * devotee's `day_start_minutes` at the time, so history doesn't move when
   * they travel.
   */
  local_day: DayKey;
  /** Time zone offset when the event was created. */
  tz_offset_min: number;
  /**
   * The practice's step count **when chanted**. Copied from the session, so
   * a later content update never changes past totals.
   */
  steps_per_repetition: number;
}

/**
 * The devotee's place in a namavali (and, in P2, a stotra). It is not a
 * count: totals always come from count events.
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
  /**
   * The clock of the deletion, or empty if never deleted. Deletion is settled
   * by this alone and never competes with the version or the pass: a position
   * is deleted when `deleted_hlc` is later than `hlc`, and chanting again
   * gives it a later `hlc` and brings it back.
   *
   * Without it the merge is not associative and devices never converge
   * (docs/decisions/2026-09-22-position-deletion-barrier.md).
   */
  deleted_hlc: Hlc | null;
}

export type SankalpaStatus = 'active' | 'completed' | 'released';

/**
 * A sankalpa targets **either** one practice **or** one program, never both
 * and never neither, so resolving its progress is never ambiguous.
 */
export type SankalpaTarget =
  | { practice_id: PracticeId; program_id: null }
  /** For programs with a different practice each day (Navaratri). */
  | { practice_id: null; program_id: string };

interface SankalpaBase extends OwnedRecord, SyncFields {
  title: string;
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

export type Sankalpa = SankalpaBase & SankalpaTarget;

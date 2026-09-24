/**
 * How the catalog reaches devices: packs, and the signed manifest that lists
 * them. The content build writes them and the app reads them, both through
 * the schemas in `../schemas/packs`. See
 * docs/architecture/content-pipeline.md#packs.
 */

import type { PACK_SCHEMA_VERSION } from '../constants/packs';
import type {
  Deity,
  LanguageTag,
  Practice,
  PracticeKind,
  Program,
  Script,
  Tradition,
} from './catalog';

/** Development packs may hold unreviewed content; production apps never trust them. */
export type Channel = 'development' | 'production';

interface PackBase {
  /** `index`, `programs`, `core`, `deity/<id>`, `deity/<id>/script/<script>`, `deity/<id>/lang/<language>`. */
  id: string;
  schema_version: typeof PACK_SCHEMA_VERSION;
}

/** A deity as the index lists it, for browsing and search before its pack is open. */
export interface IndexDeity extends Pick<
  Deity,
  'id' | 'tradition_id' | 'parent_id' | 'names' | 'featured_practice_id' | 'sort_order'
> {
  /** `deity/<id>`. */
  pack_id: string;
}

/** A practice as the index lists it. Titles keep every language, for search. */
export interface IndexPractice extends Pick<
  Practice,
  'id' | 'version' | 'tradition_id' | 'deity_ids' | 'title'
> {
  kind: PracticeKind;
  step_count: number;
  /** The pack of its primary deity, `deity/<deity_ids[0]>`. */
  pack_id: string;
  has_audio: boolean;
  /** Reviewed at this version. Only development packs list `false`. */
  reviewed: boolean;
}

/** Every tradition, deity and practice, small enough to ship in the app. */
export interface IndexPack extends PackBase {
  id: 'index';
  traditions: readonly Tradition[];
  deities: readonly IndexDeity[];
  practices: readonly IndexPractice[];
}

export interface ProgramsPack extends PackBase {
  id: 'programs';
  programs: readonly Program[];
}

/**
 * A deity and the practices whose primary deity it is, in the source script,
 * IAST and `latin`, and in English. Other scripts and languages are add-ons.
 */
export interface DeityPack extends PackBase {
  deity: Deity;
  practices: readonly Practice[];
}

/** One step of a practice in a script pack's one script. */
export interface ScriptStep {
  text: string;
  words: readonly string[] | null;
  name: string | null;
}

/** A script an add-on can bring: the base pack always has `latin` and `iast`. */
export type AddOnScript = Exclude<Script, 'latin' | 'iast'>;

/**
 * One extra script for a deity's practices. Each entry applies only to the
 * practice at the `version` it was built from, merged step by step.
 */
export interface ScriptPack extends PackBase {
  script: AddOnScript;
  practices: readonly {
    id: string;
    version: number;
    steps: readonly ScriptStep[];
  }[];
}

/**
 * One extra language for a deity and its practices, applied like a script
 * pack. A deity's names aren't here: the index has every language's names.
 */
export interface LanguagePack extends PackBase {
  language: LanguageTag;
  deity: { summary: string | null };
  practices: readonly {
    id: string;
    version: number;
    title: string | null;
    subtitle: string | null;
    repetition_word: string | null;
    intro: string | null;
    steps: readonly { meaning: string | null }[];
  }[];
}

/** Any pack but `core`, which holds them. */
export type BundledPack = IndexPack | ProgramsPack | DeityPack | ScriptPack | LanguagePack;

/**
 * What ships inside the app: whole packs, each installed as if downloaded.
 * In P1 it holds every pack, so using the library fetches nothing.
 */
export interface CorePack extends PackBase {
  id: 'core';
  packs: readonly BundledPack[];
}

export type Pack = BundledPack | CorePack;

export interface ManifestEntry {
  id: string;
  /** `packs/<id>.<first 16 hex of sha256>.json`: new content, new name. */
  path: string;
  bytes: number;
  /** Of the file exactly as stored: plain JSON, compressed only in transit. */
  sha256: string;
}

/** The list of packs a release is made of. Signed; see {@link ManifestSignature}. */
export interface Manifest {
  schema_version: typeof PACK_SCHEMA_VERSION;
  channel: Channel;
  /**
   * Only goes up. The app rejects a manifest older than one it has accepted,
   * so an old but validly signed manifest can't roll content back.
   */
  release: number;
  /** Sorted by id, each once. */
  packs: readonly ManifestEntry[];
}

/** `manifest.sig.json`: the signature over the exact bytes of `manifest.json`. */
export interface ManifestSignature {
  algorithm: 'ed25519';
  /** First 16 hex digits of the SHA-256 of the raw 32-byte public key. */
  key_id: string;
  /** Base64 of the 64-byte signature. */
  signature: string;
}

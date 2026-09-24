/**
 * The pack format's major version. An app ignores a pack or manifest with a
 * different one, keeps what it has and suggests updating. Fields added within
 * a major version are dropped by older apps, so they never need a bump. See
 * docs/architecture/content-pipeline.md#packs.
 */
export const PACK_SCHEMA_VERSION = 1;

import type { Practice } from '../types';

/**
 * Whether a practice has been reviewed as it is now. A review covers one
 * version; any change a devotee would see bumps the version, so the change
 * goes back to the advisor before it can ship in production. See
 * docs/architecture/content-pipeline.md.
 */
export function isReviewed(practice: Pick<Practice, 'version' | 'review'>): boolean {
  return practice.review !== null && practice.review.version === practice.version;
}

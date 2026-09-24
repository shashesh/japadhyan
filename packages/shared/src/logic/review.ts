import type { Practice } from '../types';

/**
 * Whether a practice's chanted text has been reviewed as it is now. A review
 * covers one version, and any change to the chanted text bumps the version,
 * so that change goes back to the advisor before it can ship in production.
 * Titles, intros and meanings change without a bump and keep the review.
 * See docs/architecture/content-pipeline.md.
 */
export function isReviewed(practice: Pick<Practice, 'version' | 'review'>): boolean {
  return practice.review !== null && practice.review.version === practice.version;
}

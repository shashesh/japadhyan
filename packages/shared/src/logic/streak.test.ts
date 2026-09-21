import { describe, expect, it } from 'vitest';
import { computeStreak } from './streak';

describe('computeStreak', () => {
  it('counts consecutive days including today', () => {
    expect(computeStreak(['2026-09-19', '2026-09-20', '2026-09-21'], '2026-09-21')).toEqual({
      days: 3,
      grace_days_used: 0,
    });
  });

  it('does not break when today is not practised yet', () => {
    expect(computeStreak(['2026-09-19', '2026-09-20'], '2026-09-21').days).toBe(2);
  });

  it('forgives a single missed day', () => {
    expect(computeStreak(['2026-09-18', '2026-09-19', '2026-09-21'], '2026-09-21')).toEqual({
      days: 3,
      grace_days_used: 1,
    });
  });

  it('keeps the streak alive through yesterday as a grace day', () => {
    expect(computeStreak(['2026-09-18', '2026-09-19'], '2026-09-21').days).toBe(2);
  });

  it('ends after two missed days in a row', () => {
    expect(computeStreak(['2026-09-17', '2026-09-18', '2026-09-21'], '2026-09-21')).toEqual({
      days: 1,
      grace_days_used: 0,
    });
  });

  it('is zero with no practice', () => {
    expect(computeStreak([], '2026-09-21')).toEqual({ days: 0, grace_days_used: 0 });
  });
});

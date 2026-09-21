import { describe, expect, it } from 'vitest';
import { countTypedRepetitions } from './likhita';

describe('likhita japa typing', () => {
  it('counts repetitions regardless of case and spacing', () => {
    expect(countTypedRepetitions('sri ram jai ram  SRI RAM jai ram', 'Sri Ram')).toBe(2);
  });

  it('counts Devanagari entries', () => {
    expect(countTypedRepetitions('राम\nराम\nराम', 'राम')).toBe(3);
  });

  it('returns 0 for an empty mantra', () => {
    expect(countTypedRepetitions('anything', '   ')).toBe(0);
  });
});

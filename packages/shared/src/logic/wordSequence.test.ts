import { describe, expect, it } from 'vitest';
import { createWordTapState, tapWord } from './wordSequence';

describe('word-by-word tap', () => {
  const words = ['Aum', 'Sri', 'Sai', 'Ram'];

  it('counts one repetition when all words are tapped in order', () => {
    let state = createWordTapState(words);
    const results = [0, 1, 2, 3].map((i) => {
      const r = tapWord(state, i);
      state = r.state;
      return r.completed;
    });
    expect(results).toEqual([false, false, false, true]);
    expect(state.next_index).toBe(0);
  });

  it('ignores a wrong tap', () => {
    const state = createWordTapState(words);
    const r = tapWord(state, 2);
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(state);
  });

  it('handles repeated words by position', () => {
    let state = createWordTapState(['Jai', 'Jai', 'Ram']);
    state = tapWord(state, 0).state;
    expect(tapWord(state, 0).accepted).toBe(false);
    expect(tapWord(state, 1).accepted).toBe(true);
  });

  it('rejects an empty mantra', () => {
    expect(() => createWordTapState([])).toThrow();
  });
});

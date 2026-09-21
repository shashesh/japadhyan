/**
 * Word-by-word tap (inspired by the Sai app's Nama Japam screen): the devotee
 * taps the mantra's words in order; completing the sequence is one repetition.
 * A wrong tap is gently ignored.
 */
export interface WordTapState {
  words: readonly string[];
  /** Index of the next word expected. */
  next_index: number;
}

export interface WordTapResult {
  state: WordTapState;
  /** The tap matched the expected word. */
  accepted: boolean;
  /** The tap completed one full repetition. */
  completed: boolean;
}

export function createWordTapState(words: readonly string[]): WordTapState {
  if (words.length === 0) throw new Error('A mantra needs at least one word');
  return { words, next_index: 0 };
}

export function tapWord(state: WordTapState, tappedIndex: number): WordTapResult {
  if (tappedIndex !== state.next_index) {
    return { state, accepted: false, completed: false };
  }
  const next = state.next_index + 1;
  if (next === state.words.length) {
    return { state: { ...state, next_index: 0 }, accepted: true, completed: true };
  }
  return { state: { ...state, next_index: next }, accepted: true, completed: false };
}

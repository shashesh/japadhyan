import { render, screen, fireEvent } from '@testing-library/react-native';
// jest.mock is hoisted above this import, so the screen sees the mock below.
import { ChantScreen } from './ChantScreen';

/**
 * A practice with no Latin word sequence — a namavali, or a mantra that has
 * not been segmented. `Step.words` is nullable in the catalog, so the chant
 * screen has to cope rather than crash before the mala can be used.
 */
jest.mock('@japadhyan/shared', () => {
  const actual = jest.requireActual('@japadhyan/shared');
  return {
    ...actual,
    devPractices: () => [
      {
        id: 'unsegmented',
        version: 1,
        tradition_id: 'hindu',
        kind: 'mantra',
        deity_ids: ['shiva'],
        title: { en: 'A mantra with no word split' },
        subtitle: {},
        source_script: 'devanagari',
        steps: [
          {
            text: { devanagari: 'ॐ', latin: 'Om' },
            words: null,
            name: null,
            meaning: null,
            audio_start_ms: null,
            audio_end_ms: null,
          },
        ],
        default_round: 108,
        repetition_word: { en: 'japa' },
        intro: {},
        audio: null,
        source: 'test',
        licence: 'test',
        review: null,
      },
    ],
  };
});

describe('ChantScreen with a practice that has no word sequence', () => {
  it('still renders and counts by mala tap', async () => {
    await render(<ChantScreen />);

    await fireEvent.press(screen.getByTestId('tap-area'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('does not offer word-by-word, which needs the words', async () => {
    await render(<ChantScreen />);

    expect(screen.queryByText('Word by word')).toBeNull();
  });
});

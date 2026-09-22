import { act, renderHook } from '@testing-library/react-native';
import type { Practice } from '@japadhyan/shared';
import { useChantSession } from './useChantSession';

const mantra: Practice = {
  id: 'om-namah-shivaya',
  version: 1,
  tradition_id: 'hindu',
  kind: 'mantra',
  deity_ids: ['shiva'],
  title: { en: 'Om Namah Shivaya' },
  subtitle: {},
  source_script: 'devanagari',
  steps: [
    {
      text: { latin: 'Om Namah Shivaya' },
      words: { latin: ['Om', 'Namah', 'Shivaya'] },
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
};

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-22T06:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useChantSession', () => {
  it('keeps one session while the devotee keeps chanting on the same day', async () => {
    const { result } = await renderHook(() => useChantSession(mantra));

    await act(async () => result.current.addRepetitions('mala_tap'));
    await act(async () => result.current.addRepetitions('mala_tap'));

    const [first, second] = result.current.events;
    expect(second!.session_id).toBe(first!.session_id);
    expect(second!.local_day).toBe(first!.local_day);
    expect(result.current.total).toBe(2);
  });

  it('starts a new session when the devotee’s day rolls over', async () => {
    const { result } = await renderHook(() => useChantSession(mantra));

    await act(async () => result.current.addRepetitions('mala_tap'));
    jest.setSystemTime(new Date('2026-09-23T06:00:00.000Z'));
    await act(async () => result.current.addRepetitions('mala_tap'));

    const [yesterday, today] = result.current.events;
    // A session never crosses a local day, so the two cannot share one.
    expect(today!.local_day).not.toBe(yesterday!.local_day);
    expect(today!.session_id).not.toBe(yesterday!.session_id);
  });

  it('seals each event with the day it was chanted on', async () => {
    const { result } = await renderHook(() => useChantSession(mantra));

    await act(async () => result.current.addRepetitions('mala_tap'));
    const firstDay = result.current.events[0]!.local_day;

    jest.setSystemTime(new Date(Date.now() + DAY_MS));
    await act(async () => result.current.addRepetitions('mala_tap'));

    // The earlier event keeps its day: sealed events are never rewritten.
    expect(result.current.events[0]!.local_day).toBe(firstDay);
  });

  it('starts a new session when the practice’s content updates', async () => {
    const { result, rerender } = await renderHook(
      ({ practice }: { practice: Practice }) => useChantSession(practice),
      { initialProps: { practice: mantra } },
    );

    await act(async () => result.current.addRepetitions('mala_tap'));
    await rerender({ practice: { ...mantra, version: 2 } });
    await act(async () => result.current.addRepetitions('mala_tap'));

    const [before, after] = result.current.events;
    expect(after!.session_id).not.toBe(before!.session_id);
  });
});

import { createMarks, markStep, type PracticePosition } from '@japadhyan/shared';

import { LAB_NAMAVALI_STEPS as STEPS, nextUnmarkedStep } from './lab';

jest.mock('@powersync/react-native', () => ({ PowerSyncDatabase: jest.fn() }));

function position(marked: number[], deleted = false): PracticePosition {
  return {
    id: '7f64746d-3241-5ed7-a7b0-cfa9400cad6f',
    user_id: '0192a4b0-8c3e-7d4a-9b1f-2e3d4c5b6a79',
    practice_id: 'sync-lab-namavali',
    practice_version: 1,
    step_index: marked.at(-1) ?? 0,
    chanted_steps: marked.reduce((marks, i) => markStep(marks, i, STEPS), createMarks(STEPS)),
    pass_ordinal: 0,
    hlc: { millis: 1, counter: 0, device_id: 'device-a' },
    deleted_hlc: deleted ? { millis: 2, counter: 0, device_id: 'device-a' } : null,
    deleted_at: deleted ? '2026-09-25T00:00:00.000Z' : null,
  };
}

describe('nextUnmarkedStep', () => {
  it('starts at the first name with no position, or a deleted one', () => {
    expect(nextUnmarkedStep(null, STEPS)).toBe(0);
    expect(nextUnmarkedStep(position([0, 1, 2], true), STEPS)).toBe(0);
  });

  it('is the first name not yet marked, even behind the last one marked', () => {
    expect(nextUnmarkedStep(position([0, 1, 2]), STEPS)).toBe(3);
    expect(nextUnmarkedStep(position([0, 5, 6]), STEPS)).toBe(1);
  });

  it('refuses once every name is marked', () => {
    expect(() => nextUnmarkedStep(position([...Array(STEPS).keys()]), STEPS)).toThrow(
      /finish the pass/,
    );
  });
});

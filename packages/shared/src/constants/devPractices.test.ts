import { afterEach, describe, expect, test } from 'vitest';

import { devPractices } from './devPractices';

// This package is platform-agnostic and carries no node types, so the tests
// reach the environment the same way the source does.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  env.NODE_ENV = originalNodeEnv;
});

describe('devPractices', () => {
  test('hands out the fixtures in development', () => {
    env.NODE_ENV = 'development';

    expect(devPractices().length).toBeGreaterThan(0);
  });

  test('refuses to hand out unreviewed fixtures in a production build', () => {
    env.NODE_ENV = 'production';

    expect(() => devPractices()).toThrow(/production build/i);
  });

  test('every fixture is marked unreviewed, so it can never pass as real content', () => {
    env.NODE_ENV = 'development';

    for (const practice of devPractices()) {
      expect(practice.review).toBeNull();
    }
  });
});

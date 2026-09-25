// `@noble/hashes`, which `@japadhyan/shared` uses for derived ids, ships only
// ES modules, so Jest has to transform it like the React Native packages.
import preset from 'jest-expo/jest-preset.js';

const ALLOW_LIST = '/node_modules/(?!(';
if (!preset.transformIgnorePatterns.some((pattern) => pattern.startsWith(ALLOW_LIST))) {
  throw new Error("jest-expo's transformIgnorePatterns changed shape; update jest.config.mjs");
}

export default {
  preset: 'jest-expo',
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.startsWith(ALLOW_LIST)
      ? pattern.replace(ALLOW_LIST, `${ALLOW_LIST}@noble/hashes|`)
      : pattern,
  ),
};

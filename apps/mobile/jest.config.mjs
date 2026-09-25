// These ship only ES modules, so Jest has to transform them like the React
// Native packages: `@noble/hashes`, which `@japadhyan/shared` uses for derived
// ids, and PowerSync's SDK.
import preset from 'jest-expo/jest-preset.js';

const ALLOW_LIST = '/node_modules/(?!(';
const ES_MODULE_PACKAGES = ['@noble/hashes', '@powersync/.*'];
if (!preset.transformIgnorePatterns.some((pattern) => pattern.startsWith(ALLOW_LIST))) {
  throw new Error("jest-expo's transformIgnorePatterns changed shape; update jest.config.mjs");
}

export default {
  preset: 'jest-expo',
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.startsWith(ALLOW_LIST)
      ? pattern.replace(ALLOW_LIST, `${ALLOW_LIST}${ES_MODULE_PACKAGES.join('|')}|`)
      : pattern,
  ),
};

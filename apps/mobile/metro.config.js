// PowerSync's per-platform resolution, after its Expo demo
// (powersync-js/demos/react-native-web-supabase-todolist/metro.config.js).
// Expo finds the monorepo's workspaces on its own.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `@powersync/web` picks its Metro build through package exports.
config.resolver.unstable_enablePackageExports = true;

// Expo drops the `react-native` export condition on web, and `@powersync/web`
// ships its Metro build under `react-native-web`.
config.resolver.unstable_conditionsByPlatform.web.push('react-native-web');

// Each platform's SDK is left out of the other's bundle.
const OTHER_PLATFORM_SDK = { web: '@powersync/react-native', native: '@powersync/web' };

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const skip = platform === 'web' ? OTHER_PLATFORM_SDK.web : OTHER_PLATFORM_SDK.native;
  if (moduleName === skip) return { type: 'empty' };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

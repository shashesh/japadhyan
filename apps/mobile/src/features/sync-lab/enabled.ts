/**
 * The sync lab exists in development builds, and in a web export built with
 * `EXPO_PUBLIC_SYNC_LAB=true`: the plan's browser runs use the static export,
 * a production build, to test what ships.
 */
export function isSyncLabEnabled(
  dev: boolean = __DEV__,
  flag: string | undefined = process.env.EXPO_PUBLIC_SYNC_LAB,
): boolean {
  return dev || flag === 'true';
}

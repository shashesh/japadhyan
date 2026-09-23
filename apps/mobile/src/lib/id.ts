import { getRandomBytes } from 'expo-crypto';
import { uuidv7 } from '@japadhyan/shared';

/**
 * A new UUIDv7, using the platform's cryptographic random source.
 *
 * `@japadhyan/shared` is platform-agnostic and can only reach Web Crypto,
 * which a bare native runtime does not provide — calling `uuidv7()` there
 * throws. The app owns the platform, so it injects Expo's native RNG here
 * and every id in the app is made through this function.
 */
export function newId(): string {
  return uuidv7({ randomBytes: getRandomBytes });
}

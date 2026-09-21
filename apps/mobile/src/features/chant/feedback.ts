import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Light tap on every bead, a stronger one at the meru bead. */
export function beadFeedback(atMeru: boolean): void {
  if (Platform.OS === 'web') return;
  if (atMeru) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

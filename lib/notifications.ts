import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permissions and registers the device with Expo Push.
 * Writes the resulting token to the current player's row so Edge Functions
 * can target it. Returns null if permission is denied or on simulator.
 */
export async function registerPushToken(playerId: string): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators can't receive pushes; skip silently.
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFCC00',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  // Without an EAS projectId, getExpoPushTokenAsync throws on real devices.
  // Bail quietly — the app still works; pushes just won't land until EAS is
  // set up (run `eas init` and add the id to app.json's extra.eas.projectId).
  if (!projectId) return null;
  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;

  await supabase
    .from('players')
    .update({ expo_push_token: token })
    .eq('id', playerId);

  return token;
}

/** Clears the stored token (called when user toggles notifications off). */
export async function clearPushToken(playerId: string): Promise<void> {
  await supabase
    .from('players')
    .update({ expo_push_token: null })
    .eq('id', playerId);
}

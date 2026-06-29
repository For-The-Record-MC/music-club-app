import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { useCurrentClubStore } from '@/stores/currentClubStore';
import { pushTokens } from '@/utils/supabase/db';

// Foreground behavior: suppress the OS banner. The in-app bell badge already
// reflects new activity for the screen the member is on, so we don't shove a
// banner over them. Background/killed delivery is the OS's job regardless.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const projectId =
  (Constants?.expoConfig?.extra as any)?.eas?.projectId ??
  (Constants as any)?.easConfig?.projectId;

// Register this device's Expo push token for the signed-in member. No-op on web
// (no Expo token) and on simulators (Device.isDevice false). Safe to call on
// every login — the token row is upserted on (profile_id, platform).
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) return;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return;
    await pushTokens.register(userId, Platform.OS === 'ios' ? 'ios' : 'android', token);
  } catch {
    // Non-fatal: a missing token just means no push on this device.
  }
}

// Tapping a notification deep-links exactly like tapping an activity-feed row:
// switch to the event's club first (so the tab screens show the right club),
// then push the same ActivityTarget the bell would have used.
export function routeFromNotification(data: unknown): void {
  const d = (data ?? {}) as { club_id?: string; target?: { pathname?: string; params?: Record<string, string> } };
  const target = d.target;
  if (!target?.pathname) return;
  if (d.club_id) useCurrentClubStore.getState().setClub(String(d.club_id));
  router.push({ pathname: target.pathname, params: target.params } as never);
}

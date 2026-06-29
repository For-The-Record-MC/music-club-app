import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useThemeStore } from '@/stores/themeStore';
import { registerPushToken, routeFromNotification } from '@/utils/push';

// Runs on every web page load — including the Spotify OAuth callback popup,
// which boots from this layout (not from spotifyAuth.ts) — so the popup hands
// the redirect back to the opener and closes.
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const { palette, isDark } = useTheme();
  const { userId, isHydrated, hydrate } = useAuthStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateClub = useCurrentClubStore((s) => s.hydrate);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    hydrate();
    hydrateTheme();
    hydrateClub();
    hydrateOnboarding();
    if (Platform.OS === 'web') document.title = 'For The Record MC — Listening Clubs';
  }, [hydrate, hydrateTheme, hydrateClub, hydrateOnboarding]);

  // Register this device's push token once signed in (no-op on web/simulator).
  useEffect(() => {
    if (userId) registerPushToken(userId);
  }, [userId]);

  // Deep-link a notification tap to the same place the activity bell would.
  // Native only — web has no Expo notifications to respond to.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      routeFromNotification(resp.notification.request.content.data);
    });
    // Cold start: app launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) routeFromNotification(resp.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded || !isHydrated) return null;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Protected guard={!!userId}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile-setup" />
          <Stack.Screen name="how-it-works" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="create-club" />
          <Stack.Screen name="join/index" />
          <Stack.Screen name="club/[id]/members" />
          <Stack.Screen name="club/[id]/member/[profileId]" />
          <Stack.Screen name="club/[id]/wheel" />
          <Stack.Screen name="club/[id]/pick-albums" />
          <Stack.Screen name="club/[id]/schedule" />
          <Stack.Screen name="club/[id]/rsvp" />
          <Stack.Screen name="club/[id]/album/[albumId]" />
          <Stack.Screen name="club/[id]/rate/[albumId]" />
          <Stack.Screen name="club/[id]/suggestions" />
          <Stack.Screen name="club/[id]/activity" />
          <Stack.Screen name="club/[id]/cycle/[cycleId]" />
        </Stack.Protected>
        <Stack.Protected guard={!userId}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        {/* join/[code] is reachable signed-out: it renders the AuthForm inline
            so an invite link survives the sign-in step without losing the code. */}
        <Stack.Screen name="join/[code]" />
      </Stack>
    </>
  );
}

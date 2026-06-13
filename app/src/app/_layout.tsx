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
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { useThemeStore } from '@/stores/themeStore';

export default function RootLayout() {
  const { palette, isDark } = useTheme();
  const { userId, isHydrated, hydrate } = useAuthStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateClub = useCurrentClubStore((s) => s.hydrate);
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
    if (Platform.OS === 'web') document.title = 'Vinyl & Vino — Listening Clubs';
  }, [hydrate, hydrateTheme, hydrateClub]);

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
          <Stack.Screen name="create-club" />
          <Stack.Screen name="join/index" />
          <Stack.Screen name="club/[id]/members" />
          <Stack.Screen name="club/[id]/wheel" />
          <Stack.Screen name="club/[id]/pick-albums" />
          <Stack.Screen name="club/[id]/schedule" />
          <Stack.Screen name="club/[id]/rsvp" />
          <Stack.Screen name="club/[id]/album/[albumId]" />
          <Stack.Screen name="club/[id]/rate/[albumId]" />
          <Stack.Screen name="club/[id]/suggestions" />
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

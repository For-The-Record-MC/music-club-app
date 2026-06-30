import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useDefaultClub } from '@/hooks/useDefaultClub';
import { useTheme } from '@/hooks/use-theme';
import { useClubSwitcherStore } from '@/stores/clubSwitcherStore';
import { fonts } from '@/theme';

function tabIcon(emoji: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const { palette } = useTheme();
  // Snap to your first club when nothing valid is selected (fresh login, relog).
  useDefaultClub();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.teal,
        tabBarInactiveTintColor: palette.text3,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
        tabBarLabelStyle: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.2 },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      {/* index forwards to home; hidden from the tab bar. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('🏠') }}
        listeners={({ navigation }) => ({
          // Tapping Home while already on Home reopens the club switcher instead
          // of the default no-op.
          tabPress: (e) => {
            if (navigation.isFocused()) {
              e.preventDefault();
              useClubSwitcherStore.getState().setOpen(true);
            }
          },
        })}
      />
      <Tabs.Screen name="feed" options={{ title: 'Clubhouse', tabBarIcon: tabIcon('🎪') }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes', tabBarIcon: tabIcon('📝') }} />
      <Tabs.Screen name="concerts" options={{ title: 'Concerts', tabBarIcon: tabIcon('🎤') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tabIcon('📜') }} />
    </Tabs>
  );
}

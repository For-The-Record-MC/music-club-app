import { StyleSheet, Text, View } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';

export default function SignIn() {
  const { palette } = useTheme();
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>🎵</Text>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>LISTENING CLUBS</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>Vinyl &amp; Vino</Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Albums with friends: spin the wheel, listen together, rate and reveal.
        </Text>
      </View>
      <AuthForm />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 40, marginBottom: 24 },
  logo: { fontSize: 42, marginBottom: 12 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 3, marginBottom: 4 },
  title: { fontFamily: fonts.sansBold, fontSize: 28, marginBottom: 8 },
  sub: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
});

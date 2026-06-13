import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { Button, Card, InlineNote, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts } from '@/theme';
import { clubs } from '@/utils/supabase/db';

// Invite-link landing page: /join/<CODE>. Reachable signed-out — it shows the
// sign-in form inline so the code isn't lost across the auth step, then joins
// automatically once a session exists.
export default function JoinByLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const setClub = useCurrentClubStore((s) => s.setClub);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!userId || !code || attempted.current) return;
    attempted.current = true;
    clubs.join(code).then(({ data, error: err }) => {
      if (err || !data) {
        setError(err?.message ?? 'Could not join.');
      } else {
        setClub(data.id);
        router.replace('/home');
      }
    });
  }, [userId, code, router, setClub]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>💌</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>You're invited</Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          {userId
            ? 'Joining the club…'
            : 'Sign in (or create an account) to join this listening club.'}
        </Text>
      </View>
      {!userId ? <AuthForm subtitle="You'll be added to the club right after." /> : null}
      {error ? (
        <Card>
          <InlineNote text={error} tone="error" />
          <Button title="Go to my clubs" variant="ghost" onPress={() => router.replace('/')} style={{ marginTop: 10 }} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 40, marginBottom: 24 },
  logo: { fontSize: 42, marginBottom: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 24, marginBottom: 8 },
  sub: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
});

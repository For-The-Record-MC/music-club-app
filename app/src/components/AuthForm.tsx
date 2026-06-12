import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { supabase } from '@/utils/supabase/client';

// Email OTP sign-in: enter email → receive 6-digit code → verify.
// Works identically on web (GitHub Pages) and native — no redirect URLs.
// Session pickup happens via authStore's onAuthStateChange listener.
export function AuthForm({ subtitle }: { subtitle?: string }) {
  const { palette } = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setStep('code');
  };

  const verifyCode = async () => {
    const addr = email.trim().toLowerCase();
    const token = code.trim();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: addr,
      token,
      type: 'email',
    });
    if (err) {
      // Fallback: accounts with a password set (dev/testing) can enter it here
      // instead of an emailed code. Real auth — no bypass logic.
      const { error: pwErr } = await supabase.auth.signInWithPassword({
        email: addr,
        password: token,
      });
      if (pwErr) setError(err.message);
    }
    setBusy(false);
    // On success onAuthStateChange fires and the protected routes take over.
  };

  return (
    <Card>
      <Label>Sign in</Label>
      {subtitle ? (
        <Text style={[styles.sub, { color: palette.text2 }]}>{subtitle}</Text>
      ) : null}
      {step === 'email' ? (
        <View style={styles.fields}>
          <TextField
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={sendCode}
          />
          <Button title="Email me a code" onPress={sendCode} loading={busy} />
        </View>
      ) : (
        <View style={styles.fields}>
          <Text style={[styles.codeHint, { color: palette.text2 }]}>
            We sent a 6-digit code to {email.trim().toLowerCase()}.
          </Text>
          <TextField
            placeholder="123456"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            onSubmitEditing={verifyCode}
          />
          <Button title="Verify" onPress={verifyCode} loading={busy} disabled={code.trim().length !== 6} />
          <Button title="Use a different email" variant="ghost" onPress={() => { setStep('email'); setCode(''); setError(null); }} />
        </View>
      )}
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 10 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  codeHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});

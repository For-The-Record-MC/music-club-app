import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { supabase } from '@/utils/supabase/client';

// Email OTP sign-in: enter email → receive 6-digit code → verify.
// Works identically on web (GitHub Pages) and native — no redirect URLs.
// Accounts with a password set (admin/dev) can take the password path instead,
// which sends no email at all (useful when the OTP email rate limit is hit).
// Session pickup happens via authStore's onAuthStateChange listener.
export function AuthForm({ subtitle }: { subtitle?: string }) {
  const { palette } = useTheme();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addr = () => email.trim().toLowerCase();

  const validEmail = () => {
    if (!addr().includes('@')) {
      setError('Enter a valid email address.');
      return false;
    }
    return true;
  };

  const sendCode = async () => {
    if (!validEmail()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: addr(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setStep('code');
  };

  const goToPassword = () => {
    if (!validEmail()) return;
    setError(null);
    setSecret('');
    setStep('password');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    if (step === 'code') {
      const { error: err } = await supabase.auth.verifyOtp({
        email: addr(),
        token: secret.trim(),
        type: 'email',
      });
      if (err) {
        // Six digits also double as a password for accounts set up that way.
        const { error: pwErr } = await supabase.auth.signInWithPassword({
          email: addr(),
          password: secret.trim(),
        });
        if (pwErr) setError(err.message);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: addr(),
        password: secret,
      });
      if (err) setError(err.message);
    }
    setBusy(false);
    // On success onAuthStateChange fires and the protected routes take over.
  };

  const backToEmail = () => {
    setStep('email');
    setSecret('');
    setError(null);
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
          <Button title="I have a password" variant="ghost" onPress={goToPassword} />
        </View>
      ) : step === 'code' ? (
        <View style={styles.fields}>
          <Text style={[styles.hint, { color: palette.text2 }]}>
            We sent a 6-digit code to {addr()}.
          </Text>
          <TextField
            placeholder="123456"
            value={secret}
            onChangeText={setSecret}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            onSubmitEditing={verify}
          />
          <Button title="Verify" onPress={verify} loading={busy} disabled={secret.trim().length !== 6} />
          <Button title="Use a different email" variant="ghost" onPress={backToEmail} />
        </View>
      ) : (
        <View style={styles.fields}>
          <Text style={[styles.hint, { color: palette.text2 }]}>
            Password for {addr()} — no email needed.
          </Text>
          <TextField
            placeholder="Password"
            value={secret}
            onChangeText={setSecret}
            secureTextEntry
            autoFocus
            onSubmitEditing={verify}
          />
          <Button title="Sign in" onPress={verify} loading={busy} disabled={!secret} />
          <Button title="Back" variant="ghost" onPress={backToEmail} />
        </View>
      )}
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 10 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  hint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});

import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData } from '@/hooks/useClubData';
import { inviteUrl } from '@/constants';
import { fonts } from '@/theme';

// Club home. Phase 1: identity + invite + members. The cycle hero (albums,
// wheel, meeting, RSVP) replaces the placeholder card in Phase 2.
export default function ClubHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const { club, members, myRole, loading } = useClubData(id);
  const [copied, setCopied] = useState(false);

  if (loading || !club) {
    return (
      <Screen>
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>
          {loading ? 'Loading…' : 'Club not found (are you a member?).'}
        </Text>
      </Screen>
    );
  }

  const url = inviteUrl(club.invite_code);

  const shareInvite = async () => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      await Share.share({ message: `Join "${club.name}" on Vinyl & Vino: ${url}` });
    }
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>LISTENING CLUB</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>
            {club.emoji} {club.name}
          </Text>
        </View>
      </View>

      <Card style={{ backgroundColor: palette.purpleBg, borderColor: palette.border }}>
        <Text style={[styles.placeholderTitle, { color: palette.text1 }]}>
          🎡 The wheel arrives in Phase 2
        </Text>
        <Text style={[styles.placeholderSub, { color: palette.text2 }]}>
          Cycles, the picker wheel, album picks, meetings, and RSVPs land next. For
          now: invite your members so the club is ready.
        </Text>
      </Card>

      <Label>Invite members</Label>
      <Card>
        <Text style={[styles.inviteText, { color: palette.text2 }]}>
          Anyone with this link can join. Share it in your group chat:
        </Text>
        <Text selectable style={[styles.inviteUrl, { color: palette.teal }]}>
          {url}
        </Text>
        <Button
          title={copied ? '✓ Copied!' : Platform.OS === 'web' ? '📋 Copy invite link' : 'Share invite link'}
          onPress={shareInvite}
        />
        {copied ? <InlineNote text="Paste it anywhere — text, email, group chat." tone="success" /> : null}
      </Card>

      <Label>Members ({members.length})</Label>
      <Card>
        <View style={styles.avRow}>
          {members.slice(0, 8).map((m) => (
            <Avatar
              key={m.id}
              name={m.profiles?.display_name ?? null}
              colorIndex={m.profiles?.avatar_color ?? 0}
              size={36}
            />
          ))}
        </View>
        <Button
          title="Manage members"
          variant="ghost"
          onPress={() => router.push(`/club/${club.id}/members`)}
          style={{ marginTop: 12 }}
        />
      </Card>

      {myRole ? (
        <Text style={[styles.roleNote, { color: palette.text3 }]}>
          You are {myRole === 'owner' ? 'the owner' : myRole === 'admin' ? 'an admin' : 'a member'} of this club.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  placeholderTitle: { fontFamily: fonts.sansBold, fontSize: 14, marginBottom: 6 },
  placeholderSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  inviteText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  inviteUrl: { fontFamily: fonts.mono, fontSize: 12, marginBottom: 12 },
  avRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  roleNote: { fontFamily: fonts.mono, fontSize: 11, textAlign: 'center', marginTop: 8 },
});

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputProps, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { Avatar, TextField } from './ui';

// The member shape mention helpers need — a subset of MemberRow.profiles paired
// with the profile id, so callers can pass their existing member lists.
export interface MentionMember {
  profile_id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: number;
  avatar_url: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Members with a usable name, longest name first so greedy matching/alternation
// prefers "Jo Anna" over "Jo".
function namedMembers(members: MentionMember[]): { id: string; name: string }[] {
  return members
    .filter((m) => m.display_name?.trim())
    .map((m) => ({ id: m.profile_id, name: m.display_name!.trim() }))
    .sort((a, b) => b.name.length - a.name.length);
}

// The "@query" the cursor is currently inside, or null. The trigger '@' must sit
// at the start or after whitespace; the query runs from it to the cursor and
// stops at a newline (so it never spans separate words/lines awkwardly).
function activeMentionQuery(text: string, cursor: number): { start: number; text: string } | null {
  const upto = text.slice(0, cursor);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const q = upto.slice(at + 1);
  if (q.includes('\n') || q.length > 40) return null;
  return { start: at, text: q };
}

// Profile ids tagged in `text` — any member whose "@Name" appears (bounded by
// whitespace / punctuation / string ends so "@Jo" doesn't match "@Jordan").
export function resolveMentions(text: string, members: MentionMember[]): string[] {
  const ids = new Set<string>();
  for (const m of namedMembers(members)) {
    const re = new RegExp(`(^|\\s)@${escapeRegExp(m.name)}(?=\\s|$|[.,!?;:])`, 'u');
    if (re.test(text)) ids.add(m.id);
  }
  return [...ids];
}

// Renders comment text with "@Name" mentions highlighted.
export function MentionText({
  text,
  members,
  style,
}: {
  text: string;
  members: MentionMember[];
  style?: TextStyle | TextStyle[];
}) {
  const { palette } = useTheme();
  const named = useMemo(() => namedMembers(members), [members]);

  const nodes = useMemo<ReactNode[]>(() => {
    if (!named.length) return [text];
    const pattern = new RegExp(
      `(^|\\s)@(${named.map((n) => escapeRegExp(n.name)).join('|')})(?=\\s|$|[.,!?;:])`,
      'gu',
    );
    const out: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const atStart = m.index + (m[1]?.length ?? 0);
      if (atStart > last) out.push(text.slice(last, atStart));
      const mention = `@${m[2]}`;
      out.push(
        <Text key={atStart} style={{ color: palette.teal, fontFamily: fonts.sansMedium }}>
          {mention}
        </Text>,
      );
      last = atStart + mention.length;
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, named, palette.teal]);

  return <Text style={style}>{nodes}</Text>;
}

// A TextField that offers an @-mention autocomplete. Picking a member inserts
// "@Name " at the cursor; resolve the tagged ids at submit with resolveMentions.
export function MentionInput({
  value,
  onChangeText,
  members,
  style,
  ...rest
}: {
  value: string;
  onChangeText: (t: string) => void;
  members: MentionMember[];
} & Omit<TextInputProps, 'value' | 'onChangeText'>) {
  const { palette } = useTheme();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // Set once right after a programmatic insert to place the cursor, then cleared
  // so the field controls its own selection while typing.
  const [forced, setForced] = useState<{ start: number; end: number } | null>(null);

  const query = activeMentionQuery(value, selection.start);
  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return members
      .filter((m) => m.display_name?.trim())
      .filter((m) => !q || m.display_name!.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, members]);

  const pick = (m: MentionMember) => {
    if (!query) return;
    const insert = `@${m.display_name!.trim()} `;
    const next = value.slice(0, query.start) + insert + value.slice(selection.start);
    const cursor = query.start + insert.length;
    onChangeText(next);
    setForced({ start: cursor, end: cursor });
    setSelection({ start: cursor, end: cursor });
  };

  return (
    <View style={styles.wrap}>
      {suggestions.length > 0 ? (
        <View style={[styles.dropdown, { backgroundColor: palette.card2, borderColor: palette.border }]}>
          {suggestions.map((m) => (
            <Pressable
              key={m.profile_id}
              onPress={() => pick(m)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: palette.card }]}
            >
              <Avatar name={m.display_name} colorIndex={m.avatar_color} imageUrl={m.avatar_url} size={22} />
              <Text style={[styles.optionName, { color: palette.text1 }]} numberOfLines={1}>
                {m.display_name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextField
        {...rest}
        value={value}
        style={style}
        onChangeText={(t) => {
          setForced(null);
          onChangeText(t);
        }}
        selection={forced ?? undefined}
        onSelectionChange={(e) => {
          setForced(null);
          setSelection(e.nativeEvent.selection);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  dropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 4,
    zIndex: 20,
    elevation: 6,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10 },
  optionName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
});

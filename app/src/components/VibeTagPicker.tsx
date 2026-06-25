import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet, Button } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';

// Compact multi-select vibe-tag picker. On the card it collapses to a single
// trigger row; tapping opens a bottom sheet with the full toggle list plus an
// inline "+ add" for coining a custom tag. The parent owns the catalog
// (canonical + club-added custom tags, loaded once) and the selection.
export function VibeTagPicker({
  selected,
  catalog,
  onChange,
  onCreate,
}: {
  selected: string[];
  catalog: string[];
  onChange: (next: string[]) => void;
  // Persist a brand-new custom tag (also gets selected). No-op if it already
  // exists in the catalog (case-insensitive) — we just select it instead.
  onCreate: (name: string) => void;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag],
    );
  };

  const commitDraft = () => {
    const name = draft.trim();
    setDraft('');
    if (!name) return;
    const existing = catalog.find((t) => t.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selected.includes(existing)) onChange([...selected, existing]);
    } else {
      onCreate(name);
      onChange([...selected, name]);
    }
  };

  // Catalog plus any selected tags not yet in it (e.g. one just created this
  // session before the catalog refetches).
  const all = [...catalog, ...selected.filter((t) => !catalog.includes(t))];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, { backgroundColor: palette.card2, borderColor: palette.border }]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            { color: selected.length ? palette.text1 : palette.text3 },
          ]}
        >
          {selected.length ? selected.join(' · ') : '＋ Add vibes'}
        </Text>
        <Text style={[styles.caret, { color: palette.text3 }]}>▾</Text>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <Text style={[styles.sheetLabel, { color: palette.teal }]}>VIBE TAGS</Text>

        <View style={styles.addRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commitDraft}
            placeholder="Add a custom vibe…"
            placeholderTextColor={palette.text3}
            maxLength={40}
            style={[
              styles.addInput,
              { backgroundColor: palette.card2, borderColor: palette.border, color: palette.text1 },
            ]}
          />
          <Pressable
            onPress={commitDraft}
            disabled={!draft.trim()}
            style={[
              styles.addBtn,
              { borderColor: palette.teal },
              !draft.trim() && { opacity: 0.4 },
            ]}
          >
            <Text style={[styles.addBtnText, { color: palette.teal }]}>Add</Text>
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.chipWrap}>
          {all.map((tag) => {
            const on = selected.includes(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggle(tag)}
                style={[
                  styles.chip,
                  { backgroundColor: palette.card2, borderColor: palette.border },
                  on && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                ]}
              >
                <Text style={[styles.chipText, { color: on ? palette.teal : palette.text2 }]}>
                  {on ? '✓ ' : ''}
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Button title="Done" onPress={() => setOpen(false)} />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  triggerText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  caret: { fontSize: 12 },
  sheetLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 2.5, marginBottom: 12 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  addInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  addBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnText: { fontFamily: fonts.sansBold, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 14 },
  chip: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13 },
});

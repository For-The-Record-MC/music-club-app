import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';

// Native datetime picker (iOS/Android). A .web.tsx sibling renders a real
// <input type="datetime-local"> for the web build.
export function DateTimeField({
  value,
  onChange,
  mode: fieldMode = 'datetime',
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  mode?: 'datetime' | 'date';
}) {
  const { palette } = useTheme();
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const current = value ?? new Date();
  const dateOnly = fieldMode === 'date';

  const open = (m: 'date' | 'time') => {
    setMode(m);
    setShow(true);
  };

  const display = dateOnly
    ? ({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } as const)
    : ({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const);

  return (
    <>
      <Pressable
        onPress={() => open('date')}
        style={[styles.field, { backgroundColor: palette.card2, borderColor: palette.border }]}
      >
        <Text style={[styles.value, { color: value ? palette.text1 : palette.text3 }]}>
          {value ? value.toLocaleString(undefined, display) : dateOnly ? 'Pick a date' : 'Pick a date & time'}
        </Text>
        {value && !dateOnly ? (
          <Text onPress={() => open('time')} style={[styles.editTime, { color: palette.teal }]}>
            edit time
          </Text>
        ) : null}
      </Pressable>
      {show ? (
        <DateTimePicker
          value={current}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShow(Platform.OS === 'ios');
            if (event.type === 'dismissed' || !selected) {
              setShow(false);
              return;
            }
            if (mode === 'date') {
              // Keep the existing time, swap the date; then prompt for time
              // (datetime mode only).
              const next = new Date(current);
              next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
              if (dateOnly) next.setHours(12, 0, 0, 0);
              onChange(next);
              if (!dateOnly && Platform.OS !== 'ios') open('time');
            } else {
              const next = new Date(current);
              next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
              onChange(next);
              setShow(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontFamily: fonts.sansMedium, fontSize: 14 },
  editTime: { fontFamily: fonts.monoMedium, fontSize: 11 },
});

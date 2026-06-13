import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';

// Web build: a real <input type="datetime-local">. react-native-web renders to
// the DOM, so returning an intrinsic element here is fine. Sibling .tsx handles native.
export function DateTimeField({
  value,
  onChange,
  mode = 'datetime',
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  mode?: 'datetime' | 'date';
}) {
  const { palette } = useTheme();
  const pad = (n: number) => String(n).padStart(2, '0');

  // The input wants LOCAL time strings: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm".
  const toLocalInput = (d: Date) => {
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return mode === 'date' ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <input
      type={mode === 'date' ? 'date' : 'datetime-local'}
      value={value ? toLocalInput(value) : ''}
      onChange={(e) => {
        const v = (e.target as HTMLInputElement).value;
        if (!v) return;
        // For date-only, anchor at local noon so the calendar date never shifts
        // across time zones.
        onChange(new Date(mode === 'date' ? `${v}T12:00` : v));
      }}
      style={{
        backgroundColor: palette.card2,
        border: `0.5px solid ${palette.border}`,
        borderRadius: radius.md,
        padding: '11px 13px',
        fontSize: 14,
        fontFamily: fonts.sans,
        color: palette.text1,
        colorScheme: 'dark light',
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
      }}
    />
  );
}

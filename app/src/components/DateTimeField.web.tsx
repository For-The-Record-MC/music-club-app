import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';

// Web build: a real <input type="datetime-local">. react-native-web renders to
// the DOM, so returning an intrinsic element here is fine. Sibling .tsx handles native.
export function DateTimeField({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const { palette } = useTheme();

  // datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time.
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <input
      type="datetime-local"
      value={value ? toLocalInput(value) : ''}
      onChange={(e) => {
        const v = (e.target as HTMLInputElement).value;
        if (v) onChange(new Date(v));
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

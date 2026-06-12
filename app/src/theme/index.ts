// Theme ported from the legacy MVP (legacy/index.html :root / .light CSS variables).
// Screens read the active palette via useTheme(); never hardcode hex values in components.

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 } as const;

// Loaded in src/app/_layout.tsx via @expo-google-fonts.
export const fonts = {
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansBold: 'DMSans_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export const palettes = {
  dark: {
    bg: '#080808',
    surface: '#101010',
    card: '#181818',
    card2: '#1f1f1f',
    border: '#252525',
    border2: '#303030',
    text1: '#F2F1EE',
    text2: '#8A8A86',
    text3: '#484846',
    teal: '#5DCAA5',
    tealBg: 'rgba(93,202,165,0.13)',
    tealDark: '#04342C',
    purple: '#7F77DD',
    purpleBg: 'rgba(127,119,221,0.13)',
    coral: '#D85A30',
    coralBg: 'rgba(216,90,48,0.13)',
    amber: '#EF9F27',
    amberBg: 'rgba(239,159,39,0.13)',
    blue: '#378ADD',
    blueBg: 'rgba(55,138,221,0.13)',
    spotify: '#1DB954',
    apple: '#FC3C44',
  },
  light: {
    bg: '#EEECE6',
    surface: '#F8F7F3',
    card: '#FFFFFF',
    card2: '#F2F0EA',
    border: '#DDD9D0',
    border2: '#C8C4BB',
    text1: '#181816',
    text2: '#66635C',
    text3: '#AAAA9C',
    teal: '#0F6E56',
    tealBg: 'rgba(15,110,86,0.1)',
    tealDark: '#E1F5EE',
    purple: '#534AB7',
    purpleBg: 'rgba(83,74,183,0.1)',
    coral: '#993C1D',
    coralBg: 'rgba(153,60,29,0.1)',
    amber: '#854F0B',
    amberBg: 'rgba(133,79,11,0.1)',
    blue: '#185FA5',
    blueBg: 'rgba(24,95,165,0.1)',
    spotify: '#1DB954',
    apple: '#FC3C44',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['dark']]: string };

// Avatar background/foreground pairs; a member's color index (ci) picks one.
export const avatarColors = [
  { bg: '#5DCAA5', fg: '#04342C' },
  { bg: '#7F77DD', fg: '#26215C' },
  { bg: '#D85A30', fg: '#4A1B0C' },
  { bg: '#D4537E', fg: '#4B1528' },
  { bg: '#378ADD', fg: '#042C53' },
  { bg: '#EF9F27', fg: '#412402' },
  { bg: '#639922', fg: '#173404' },
] as const;

export const clubEmojis = [
  '🎵', '🎸', '🎹', '🎺', '🥁', '🎷', '🎻', '🎤', '🎧',
  '📻', '💿', '🍷', '🎶', '🌙', '🦋', '🌿', '🔥', '✨',
] as const;

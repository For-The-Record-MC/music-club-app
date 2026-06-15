import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Custom HTML shell for the static web build. This is where the app stops
// looking like "a website in a browser" and starts looking like an installed
// iPhone app: standalone display, an add-to-home-screen icon, notch-aware
// safe areas, and the small interaction tweaks (no tap-highlight flash, no
// double-tap zoom, no rubber-band document bounce) that read as "native".
//
// Asset/manifest links are prefixed with the configured baseUrl so they resolve
// correctly when the site is served from a subpath (app.json -> experiments.baseUrl).

const BASE = process.env.EXPO_BASE_URL ?? '';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover lets content extend under the notch/home indicator
            (paired with the safe-area insets the screens already respect);
            maximum-scale=1 stops iOS Safari from zooming when an input is focused. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />

        {/* Add-to-home-screen / standalone (iOS + Android Chrome) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Vinyl & Vino" />
        <meta name="application-name" content="Vinyl & Vino" />

        {/* Browser chrome color (per color scheme) */}
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#080808" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#EEECE6" />

        {/* Sharing / SEO */}
        <meta
          name="description"
          content="Run a music listening club: pick albums, rate them, share notes, and plan concerts with your crew."
        />
        <meta property="og:title" content="Vinyl & Vino — Listening Clubs" />
        <meta
          property="og:description"
          content="Run a music listening club: pick albums, rate them, share notes, and plan concerts with your crew."
        />

        <link rel="apple-touch-icon" href={`${BASE}/icons/apple-touch-icon.png`} />
        <link rel="manifest" href={`${BASE}/manifest.json`} />

        {/* Keep React Native ScrollView behaving on web (Expo's recommended reset). */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: nativeFeelCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Small set of overrides that remove the "this is a web page" tells. Everything
// here is intentionally conservative: text inputs keep selection/callout so the
// app stays usable; only the browser's app-breaking defaults are turned off.
const nativeFeelCss = `
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* No 300ms tap delay, no double-tap-to-zoom. */
  touch-action: manipulation;
  /* No long-press "copy / save image" callout menu on app chrome. */
  -webkit-touch-callout: none;
  /* No grey flash when tapping buttons. */
  -webkit-tap-highlight-color: transparent;
  /* No rubber-band bounce of the whole document; the in-app lists bounce instead. */
  overscroll-behavior: none;
}
* {
  -webkit-tap-highlight-color: transparent;
}
/* Real text fields stay first-class: selectable, with the native callout. */
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
/* Fill the dynamic viewport so the dark background reaches the very edges
   (under the status bar and the home indicator) instead of leaving a gap. */
html, body, #root {
  height: 100%;
  min-height: 100dvh;
  background-color: #080808;
}
@media (prefers-color-scheme: light) {
  html, body, #root { background-color: #EEECE6; }
}
`;

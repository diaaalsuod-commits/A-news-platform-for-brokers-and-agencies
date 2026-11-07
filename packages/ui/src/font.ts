import localFont from 'next/font/local';

const arabic = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2', weight: '600' },
  ],
  variable: '--font-arabic',
  display: 'swap',
  adjustFontFallback: false,
});

const latin = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-arabic-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-sans-arabic-latin-600-normal.woff2', weight: '600' },
  ],
  variable: '--font-latin',
  display: 'swap',
  // The generated fallback is a local font with Arabic letters, so Arabic text would
  // stop there and never reach the Arabic file above.
  adjustFontFallback: false,
});

/** Self-hosted IBM Plex Sans Arabic. Set this class on <html>. */
export const fontClassName = `${arabic.variable} ${latin.variable}`;

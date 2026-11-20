import type { Config } from 'tailwindcss'
import { COLORS, FONTS } from './src/funil/tokens'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: COLORS.bg, raised: COLORS.bgRaised },
        line: COLORS.line,
        ink: { DEFAULT: COLORS.ink, muted: COLORS.inkMuted },
        signal: COLORS.signal,
        leak: COLORS.leak,
        lead: COLORS.neutralLead,
        researching: COLORS.researching,
      },
      fontFamily: {
        sans: FONTS.sans.split(', '),
        mono: FONTS.mono.split(', '),
        serif: FONTS.serif.split(', '),
      },
      letterSpacing: { telemetry: '0.08em' },
      transitionTimingFunction: { expo: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [],
} satisfies Config

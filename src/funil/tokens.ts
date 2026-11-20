/**
 * TOKENS VISUAIS do Funil Vivo — fonte única para o Tailwind (tailwind.config.ts)
 * e para o motor de canvas (engine/), que não lê CSS.
 *
 * Regra de cor narrativa: antes do STD ligar, a tela vive em neutral-lead + leak.
 * `signal` só aparece de verdade quando o STD liga (até lá, só o botão "Ligar o STD").
 * Paleta escura do brief; o cobre do site da It's Time ficou de fora de propósito
 * (próximo demais de `leak`: a marca passaria a significar "dinheiro perdido").
 */
export const COLORS = {
  bg: '#07080A',
  bgRaised: '#0E1013',
  line: '#1C1F24',
  ink: '#F2F1EC',
  inkMuted: '#8A8F98',
  signal: '#C6FF3D',
  leak: '#FF5A36',
  neutralLead: '#C9CDD4',
  /** lead identificado pelo STD que ainda está pesquisando (chega no WhatsApp, em cinza) */
  researching: '#5B6370',
} as const

/**
 * Avatares: 6 tons suaves (fundo pastel escuro, iniciais no claro do mesmo tom).
 * Nenhum perto do verde signal, que é reservado ao STD.
 */
export const AVATAR_TONES = [
  { bg: '#3B2A31', fg: '#F2C4D0' }, // rosa
  { bg: '#233140', fg: '#BCD7F2' }, // azul
  { bg: '#3A3324', fg: '#EBD9AE' }, // areia
  { bg: '#30293D', fg: '#D5C6F0' }, // lilás
  { bg: '#213638', fg: '#B5E2E0' }, // azul-petróleo
  { bg: '#3C2C24', fg: '#F0C9AE' }, // terracota
] as const

export const FONTS = {
  sans: '"Inter Tight", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
} as const

/** Easing de cinema: entradas expo out. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
/** Springs só em elementos tocáveis. */
export const SPRING_TOUCH = { type: 'spring', stiffness: 260, damping: 30 } as const

export const MOTION = {
  panelEnterMs: 420,
  panelExitMs: 180,
  routeMorphMs: 700,
  funnelDrawMs: 900,
  typeMsPerChar: 28,
} as const

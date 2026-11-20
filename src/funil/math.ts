import {
  CLOSE_ASSUMED, GAP_CAPTURE, LEADS_MAX, LEADS_MIN, READY_TO_BUY_SHARE, RECOVERABLE, REF_CONV,
  SPAWN_MAX, SPAWN_MIN,
} from './config'

/**
 * Matemática pura do Funil Vivo. Sem React, sem DOM: testável.
 * Fórmulas da seção 6 do brief. (Testes completos na Fase 4.)
 */

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Conversão hoje: A de cada 10. */
export const convToday = (a10: number) => clamp(a10, 0, 10) / 10

/** Conversão projetada com STD. Variante honesta: se já está ≥ referência, não infla. */
export function convProjected(a10: number): number {
  const c = convToday(a10)
  return c >= REF_CONV ? c : c + (REF_CONV - c) * GAP_CAPTURE
}

export interface Diagnosis {
  convHoje: number
  conversasHoje: number
  vazam: number
  valorEmJogo: number
  convProj: number
  conversasProj: number
  receitaExtra: number
  /** conversão atual já ≥ referência do caso real: não mostrar ganho inflado */
  honest: boolean
  prontasHoje: number
  prontasProj: number
}

export function diagnose(leads: number, a10: number, ticket: number): Diagnosis {
  const L = clamp(leads, LEADS_MIN, LEADS_MAX)
  const T = Math.max(0, ticket)
  const convHoje = convToday(a10)
  const conversasHoje = L * convHoje
  const vazam = L - conversasHoje
  const valorEmJogo = vazam * T * RECOVERABLE
  const convProj = convProjected(a10)
  const conversasProj = L * convProj
  const receitaExtra = (conversasProj - conversasHoje) * T * CLOSE_ASSUMED
  return {
    convHoje, conversasHoje, vazam, valorEmJogo, convProj, conversasProj, receitaExtra,
    honest: convHoje >= REF_CONV,
    prontasHoje: conversasHoje * READY_TO_BUY_SHARE,
    prontasProj: conversasProj * READY_TO_BUY_SHARE,
  }
}

/** Densidade visual de partículas por segundo a partir de leads/mês. */
export function spawnRate(leads: number): number {
  const L = clamp(leads, LEADS_MIN, LEADS_MAX)
  return lerp(SPAWN_MIN, SPAWN_MAX, clamp(Math.log10(L / 10) / 2, 0, 1))
}

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
/** Número exibido: sempre arredondado e no formato pt-BR. */
export const fmt = (n: number) => nf.format(Math.round(n))

import { GAP_CAPTURE, LEADS_MAX, LEADS_MIN, REF_CONV, SPAWN_MAX, SPAWN_MIN } from './config'

/**
 * Matemática pura do Funil Vivo. Sem React, sem DOM: testável.
 * (Fase 1: só o que o motor precisa. Diagnóstico completo + testes entram na Fase 4.)
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

/** Densidade visual de partículas por segundo a partir de leads/mês. */
export function spawnRate(leads: number): number {
  const L = clamp(leads, LEADS_MIN, LEADS_MAX)
  return lerp(SPAWN_MIN, SPAWN_MAX, clamp(Math.log10(L / 10) / 2, 0, 1))
}

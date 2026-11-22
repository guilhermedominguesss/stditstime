import { describe, expect, it } from 'vitest'
import { CLOSE_ASSUMED, GAP_CAPTURE, LEADS_MAX, LEADS_MIN, RECOVERABLE, REF_CONV } from './config'
import { convProjected, diagnose, fmt, spawnRate } from './math'

describe('diagnose', () => {
  it('segue as fórmulas da seção 6 (caso típico)', () => {
    const d = diagnose(100, 4, 2000)
    expect(d.convHoje).toBeCloseTo(0.4)
    expect(d.conversasHoje).toBeCloseTo(40)
    expect(d.vazam).toBeCloseTo(60)
    expect(d.valorEmJogo).toBeCloseTo(60 * 2000 * RECOVERABLE)
    const proj = 0.4 + (REF_CONV - 0.4) * GAP_CAPTURE
    expect(d.convProj).toBeCloseTo(proj)
    expect(d.conversasProj).toBeCloseTo(100 * proj)
    expect(d.receitaExtra).toBeCloseTo((100 * proj - 40) * 2000 * CLOSE_ASSUMED)
    expect(d.honest).toBe(false)
  })

  it('variante honesta: conversão ≥ referência não ganha projeção inflada', () => {
    const d = diagnose(100, 6, 650) // 0,6 ≥ 0,556
    expect(d.honest).toBe(true)
    expect(d.convProj).toBe(d.convHoje)
    expect(d.receitaExtra).toBe(0)
  })

  it('A = 0: nada vira conversa, tudo vaza, ganho positivo', () => {
    const d = diagnose(100, 0, 650)
    expect(d.conversasHoje).toBe(0)
    expect(d.vazam).toBe(100)
    expect(d.convProj).toBeCloseTo(REF_CONV * GAP_CAPTURE)
    expect(d.receitaExtra).toBeGreaterThan(0)
  })

  it('A = 10: nada vaza e cai na variante honesta', () => {
    const d = diagnose(100, 10, 650)
    expect(d.vazam).toBe(0)
    expect(d.valorEmJogo).toBe(0)
    expect(d.honest).toBe(true)
    expect(d.receitaExtra).toBe(0)
  })

  it('L é limitado ao intervalo do slider', () => {
    expect(diagnose(1, 3, 650).conversasHoje).toBeCloseTo(LEADS_MIN * 0.3)
    expect(diagnose(50_000, 3, 650).conversasHoje).toBeCloseTo(LEADS_MAX * 0.3)
  })

  it('A fora de 0–10 é limitado', () => {
    expect(diagnose(100, -3, 650).convHoje).toBe(0)
    expect(diagnose(100, 14, 650).convHoje).toBe(1)
  })

  it('ticket negativo vira 0', () => {
    expect(diagnose(100, 3, -50).valorEmJogo).toBe(0)
  })
})

describe('convProjected', () => {
  it('nunca passa da referência quando parte de baixo', () => {
    for (let a = 0; a <= 5; a++) expect(convProjected(a)).toBeLessThanOrEqual(REF_CONV)
  })
})

describe('spawnRate e fmt', () => {
  it('densidade cresce com o volume', () => {
    expect(spawnRate(LEADS_MAX)).toBeGreaterThan(spawnRate(LEADS_MIN))
  })
  it('formata em pt-BR, arredondado', () => {
    expect(fmt(7777.8)).toBe('7.778')
  })
})

import { describe, expect, it } from 'vitest'
import { INBOX_BANK } from './config'

describe('banco da caixa de entrada por nicho', () => {
  it.each(Object.entries(INBOX_BANK))('%s segue as regras da demo', (_k, niche) => {
    const ps = niche.people
    expect(ps).toHaveLength(8)
    // a última a chegar fica no topo: é a que a pessoa responde com o preço
    const top = ps[ps.length - 1]
    expect(top.readyBefore).toBe(false)
    expect(top.msg).toMatch(/quanto|valor|preço/i)
    // 2 já prontas antes (não somem), 6 prontas com triagem (placar 2 → 6)
    expect(ps.filter((p) => p.readyBefore)).toHaveLength(2)
    expect(ps.filter((p) => p.readyBefore).every((p) => p.ready)).toBe(true)
    expect(ps.filter((p) => p.ready)).toHaveLength(6)
    expect(new Set(ps.map((p) => p.name)).size).toBe(8)
  })
})

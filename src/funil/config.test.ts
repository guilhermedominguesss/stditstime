import { describe, expect, it } from 'vitest'
import { INBOX_BANK, REPLY_AVALIACAO } from './config'

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
    // a Mariana da intro é a última da lista em todos os nichos (a que pergunta o preço)
    expect(ps[ps.length - 1].name).toBe('Mariana Costa')
    // "Antes de chamar, viu:" nunca fala de preço (regras de conselho profissional)
    expect(niche.seenBefore).toHaveLength(5)
    for (const s of niche.seenBefore) expect(s).not.toMatch(/R\$|preço|valor|custa/i)
  })

  it.each(['odonto', 'estetica', 'clinica'] as const)('%s não responde com preço (conselho profissional)', (k) => {
    expect(INBOX_BANK[k].reply).toBe(REPLY_AVALIACAO)
    expect(INBOX_BANK[k].reply).not.toMatch(/R\$/)
  })
})

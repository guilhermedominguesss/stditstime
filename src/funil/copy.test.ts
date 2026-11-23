import { describe, expect, it } from 'vitest'
import { CAPTIONS, INTRO } from './copy'

describe('legendas de filme', () => {
  it.each(Object.entries(CAPTIONS))('%s tem no máximo 60 caracteres', (_k, text) => {
    expect(text.length).toBeLessThanOrEqual(60)
  })
})

describe('intro', () => {
  // tudo o que aparece na intro, como texto corrido
  const all = [...INTRO.headline, INTRO.support, INTRO.cta, INTRO.name, INTRO.when, INTRO.msg, ...INTRO.nicheTitle].join(' ')

  it('não explica o produto (palavras proibidas)', () => {
    expect(all).not.toMatch(/\bSTD\b|sistema de triagem|raio-?x|diagn[oó]stico|simula[cç][aã]o|\bteste\b/i)
  })

  it('não usa números do caso real nem contador', () => {
    expect(all).not.toMatch(/\b(135|75|49)\b|\d+\s?%/)
    // nenhum número fora do "1 minuto" do apoio: sem contador, sem placar
    expect(all.replace(INTRO.support, '')).not.toMatch(/\d/)
  })

  it('não fala de acesso ao WhatsApp nem de conversa sumindo', () => {
    expect(all).not.toMatch(/acesso|link do whatsapp|chamar no whatsapp|falar no whatsapp|sumiu|visualizad/i)
  })

  it('headline e botão são os combinados', () => {
    expect(INTRO.headline.join(' ')).toBe('Quanto está escapando do seu WhatsApp?')
    expect(INTRO.headline).toHaveLength(3) // máx. 3 linhas
    expect(INTRO.cta).toBe('Quero ver quanto eu perco')
    expect(INTRO.support).toBe('1 minuto. Sem formulário, só toques na tela.')
  })
})

import { describe, expect, it } from 'vitest'
import { CAPTIONS, INTRO } from './copy'

describe('legendas de filme', () => {
  it.each(Object.entries(CAPTIONS))('%s tem no máximo 60 caracteres', (_k, text) => {
    expect(text.length).toBeLessThanOrEqual(60)
  })
})

describe('intro', () => {
  // tudo o que aparece na intro, como texto corrido
  const all = [
    ...INTRO.counter(0, 0), ...INTRO.headline, INTRO.support, INTRO.cta, ...INTRO.incoming,
    INTRO.reply, INTRO.you, INTRO.seen, INTRO.typing, INTRO.stamp, INTRO.answered, ...INTRO.names,
  ].join(' ')

  it('não explica o produto (palavras proibidas)', () => {
    expect(all).not.toMatch(/\bSTD\b|sistema de triagem|raio-?x|diagn[oó]stico|simula[cç][aã]o|\bteste\b/i)
  })

  it('não usa números do caso real (135, 75, 49, 77%, 36%)', () => {
    expect(all).not.toMatch(/\b(135|75|49)\b|77\s?%|36\s?%/)
  })

  it('não fala de acesso ao WhatsApp', () => {
    expect(all).not.toMatch(/acesso|link do whatsapp|chamar no whatsapp|falar no whatsapp/i)
  })

  it('headline e botão são os combinados', () => {
    expect(INTRO.headline.join('')).toBe('Quanto está escapando do seu WhatsApp?')
    expect(INTRO.cta).toBe('Quero ver quanto eu perco')
  })
})

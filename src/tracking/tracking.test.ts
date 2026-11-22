import { describe, expect, it } from 'vitest'
import { whatsappMessage, whatsappNumber } from '../funil/config'
import { fmt } from '../funil/math'
import { REF_CODE_RE, detectDevice, detectInAppBrowser, generateRefCode, readAttribution } from './session'

describe('refCode', () => {
  it('tem o formato FV-XXXX sem caracteres ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateRefCode()
      expect(c).toMatch(REF_CODE_RE)
      expect(c.slice(3)).not.toMatch(/[01OIL]/)
    }
  })
  it('é determinístico dado o gerador', () => {
    expect(generateRefCode(() => new Uint8Array([0, 1, 2, 3]))).toBe('FV-ABCD')
  })
})

describe('atribuição', () => {
  it('lê UTMs e fbclid; vazio vira null', () => {
    const a = readAttribution('?utm_source=ig&utm_campaign=+&fbclid=abc')
    expect(a.utm_source).toBe('ig')
    expect(a.utm_campaign).toBeNull()
    expect(a.fbclid).toBe('abc')
  })
  it('detecta navegador interno e aparelho', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe('instagram')
    expect(detectInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/400]')).toBe('facebook')
    expect(detectInAppBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBeNull()
    expect(detectDevice('Mozilla/5.0 (Linux; Android 13; SM-A546E) Mobile', 412)).toBe('mobile')
  })
})

describe('WhatsApp', () => {
  const base = { segmento: 'Odontologia', leads: 100, conv10: 4, ticketLabel: 'R$1.000 a R$3.000', refCode: 'FV-AB12' }
  it('monta a mensagem com refCode e a projeção', () => {
    const m = whatsappMessage({ ...base, receitaExtraMes: 7778 }, fmt)
    expect(m).toContain('Olá, Guilherme! Fiz o Funil Vivo.')
    expect(m).toContain('Negócio: Odontologia')
    expect(m).toContain('Conversão hoje: 4/10 · Ticket: R$1.000 a R$3.000')
    expect(m).toContain('Projeção: + R$ 7.778/mês')
    expect(m.trim().endsWith('[FV-AB12]')).toBe(true)
  })
  it('variante honesta não promete ganho', () => {
    const m = whatsappMessage({ ...base, receitaExtraMes: null }, fmt)
    expect(m).not.toContain('Projeção')
    expect(m).toContain('acima da média')
  })
  it('1.000 leads aparece como 1.000+', () => {
    expect(whatsappMessage({ ...base, leads: 1000, receitaExtraMes: 1 }, fmt)).toContain('Leads/mês: 1.000+')
  })
  it('normaliza o número com DDI 55', () => {
    expect(whatsappNumber('(41) 99999-8888')).toBe('5541999998888')
    expect(whatsappNumber('5541999998888')).toBe('5541999998888')
    expect(whatsappNumber('')).toBe('')
  })
})

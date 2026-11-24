import { describe, expect, it } from 'vitest'
import { WHATSAPP_NUMBER_DEFAULT, whatsappMessage, whatsappNumber } from '../funil/config'
import { fmt } from '../funil/math'
import { REF_CODE_RE, detectDevice, detectInAppBrowser, generateRefCode, isCrawler, normalizeUtm, readAttribution } from './session'

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

describe('robôs', () => {
  it('reconhece os robôs de prévia e de busca', () => {
    for (const ua of [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Facebot',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0',
      'Some-Link-Preview/1.0',
    ]) expect(isCrawler(ua)).toBe(true)
  })
  it('não confunde gente de verdade (Instagram, Safari, Cubot)', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 12; Cubot Note 30) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; SM-A546E) [FB_IAB/FB4A;FBAV/450.0;]',
    ]) expect(isCrawler(ua)).toBe(false)
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
  it('o WhatsApp do lead entra na mensagem pronta', () => {
    expect(whatsappMessage({ ...base, receitaExtraMes: 1, telefone: '(41) 99999-9999' }, fmt)).toContain('Meu WhatsApp: (41) 99999-9999')
    expect(whatsappMessage({ ...base, receitaExtraMes: 1 }, fmt)).not.toContain('Meu WhatsApp')
  })
  it('1.000 leads aparece como 1.000+', () => {
    expect(whatsappMessage({ ...base, leads: 1000, receitaExtraMes: 1 }, fmt)).toContain('Leads/mês: 1.000+')
  })
  it('o número padrão abre a conversa com o Guilherme (55 + DDD + número)', () => {
    expect(whatsappNumber(WHATSAPP_NUMBER_DEFAULT)).toBe('5541984804266')
    expect(whatsappNumber('41984804266')).toBe('5541984804266')
    expect(whatsappNumber('+55 (41) 98480-4266')).toBe('5541984804266')
  })
  it('normaliza o número com DDI 55', () => {
    expect(whatsappNumber('(41) 99999-8888')).toBe('5541999998888')
    expect(whatsappNumber('5541999998888')).toBe('5541999998888')
    expect(whatsappNumber('')).toBe('')
  })
})

describe('UTM codificada', () => {
  it('decodifica o nome do anúncio que o Meta manda codificado (e com +)', () => {
    expect(normalizeUtm('%5BAD2%5D%5BPARE+DE+PAGAR')).toBe('[AD2][PARE DE PAGAR')
    expect(normalizeUtm('%255BAD2%255D+teste')).toBe('[AD2] teste')
    expect(normalizeUtm('[AD2][PARE DE PAGAR]')).toBe('[AD2][PARE DE PAGAR]')
  })
  it('a mesma UTM codificada ou não vira a mesma string', () => {
    const a = readAttribution('?utm_content=%255BAD2%255D%255BPARE%2BDE%2BPAGAR%255D').utm_content
    const b = readAttribution('?utm_content=%5BAD2%5D%5BPARE+DE+PAGAR%5D').utm_content
    expect(a).toBe('[AD2][PARE DE PAGAR]')
    expect(b).toBe(a)
  })
  it('não quebra com % solto', () => {
    expect(normalizeUtm('100%+off')).toBe('100% off')
  })
})

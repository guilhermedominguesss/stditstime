import { describe, expect, it } from 'vitest'
import { displayOwnerNumber, isValidPhone, maskPhone, phoneDigits } from './phone'

describe('WhatsApp do lead', () => {
  it('aceita 11 dígitos com DDD válido e 9 na frente', () => {
    expect(isValidPhone('41984804266')).toBe(true)
    expect(isValidPhone('11912345678')).toBe(true)
  })
  it('recusa fixo, DDD inexistente e número curto', () => {
    expect(isValidPhone('4133334444')).toBe(false) // 10 dígitos
    expect(isValidPhone('41884804266')).toBe(false) // sem o 9
    expect(isValidPhone('20984804266')).toBe(false) // DDD 20 não existe
    expect(isValidPhone('')).toBe(false)
  })
  it('limpa o que a pessoa cola', () => {
    expect(phoneDigits('+55 (41) 98480-4266')).toBe('41984804266')
    expect(phoneDigits('041984804266')).toBe('41984804266')
    expect(phoneDigits('(41) 9 8480-4266 ramal')).toBe('41984804266')
  })
  it('máscara (DD) 9XXXX-XXXX', () => {
    expect(maskPhone('4')).toBe('(4')
    expect(maskPhone('419848')).toBe('(41) 9848')
    expect(maskPhone('41984804266')).toBe('(41) 98480-4266')
  })
  it('número do Guilherme para copiar', () => {
    expect(displayOwnerNumber('5541984804266')).toBe('41 98480-4266')
  })
})

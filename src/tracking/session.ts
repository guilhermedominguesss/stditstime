import { REF_ALPHABET, REF_PREFIX } from '../funil/config'

/**
 * Identidade da sessão: id (uuid), refCode (liga o WhatsApp à linha no Supabase),
 * atribuição (UTMs + fbclid, lidos UMA vez no primeiro load), aparelho e navegador interno.
 */

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) return crypto.getRandomValues(a)
  for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256)
  return a
}

/** "FV-" + 4 caracteres sem ambiguidade (sem 0/O, 1/I/L). */
export function generateRefCode(random: (n: number) => Uint8Array = randomBytes): string {
  const b = random(4)
  let s = ''
  for (let i = 0; i < 4; i++) s += REF_ALPHABET[b[i] % REF_ALPHABET.length]
  return `${REF_PREFIX}${s}`
}

export const REF_CODE_RE = new RegExp(`^${REF_PREFIX}[${REF_ALPHABET}]{4}$`)

export interface Attribution {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
}

/**
 * UTM limpa: o Meta às vezes manda o nome do anúncio codificado duas vezes
 * ("%5BAD2%5D%5BPARE+DE+PAGAR..."). Troca "+" por espaço e decodifica até ficar estável.
 */
export function normalizeUtm(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let v = raw
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}|\+/.test(v); i++) {
    let next = v.replace(/\+/g, ' ')
    try {
      next = decodeURIComponent(next)
    } catch {
      /* % solto: fica só a troca do "+" */
    }
    if (next === v) break
    v = next
  }
  v = v.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, 200) : null
}

export function readAttribution(search: string): Attribution {
  const q = new URLSearchParams(search)
  const pick = (k: string) => (k === 'fbclid' ? (q.get(k)?.trim().slice(0, 500) || null) : normalizeUtm(q.get(k)))
  return {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_content: pick('utm_content'),
    utm_term: pick('utm_term'),
    fbclid: pick('fbclid'),
  }
}

export type Device = 'mobile' | 'tablet' | 'desktop'

export function detectDevice(ua: string, width: number): Device {
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile'
  if (width > 0 && width < 768) return 'mobile'
  if (width > 0 && width < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Robôs que abrem o link (prévia do Facebook/Instagram, buscadores, verificadores):
 * não viram sessão.
 */
export function isCrawler(ua: string): boolean {
  // "bot/" (Googlebot/2.1, bingbot/2.0…) e não "bot" solto: o celular Cubot não é robô
  return /facebookexternalhit|facebot|bot\/|crawler|spider|preview|headlesschrome|lighthouse/i.test(ua)
}

/**
 * Aparelho de teste: abrir UMA vez com ?test=1 marca este aparelho (localStorage + cookie
 * de 1 ano) e todas as sessões seguintes dele saem com is_test. ?test=0 desmarca.
 */
export const TEST_DEVICE_KEY = 'fv_test_device'

export function resolveTestDevice(search: string): boolean {
  const q = new URLSearchParams(search).get('test')
  try {
    if (q === '1') {
      localStorage.setItem(TEST_DEVICE_KEY, '1')
      document.cookie = `${TEST_DEVICE_KEY}=1; max-age=31536000; path=/; samesite=lax`
      return true
    }
    if (q === '0') {
      localStorage.removeItem(TEST_DEVICE_KEY)
      document.cookie = `${TEST_DEVICE_KEY}=; max-age=0; path=/`
      return false
    }
    return localStorage.getItem(TEST_DEVICE_KEY) === '1' || /(?:^|; )fv_test_device=1/.test(document.cookie)
  } catch {
    return q === '1'
  }
}

/** Navegador interno: 95% do tráfego vem daqui. */
export function detectInAppBrowser(ua: string): 'instagram' | 'facebook' | 'outro' | null {
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook'
  if (/; wv\)|WebView/i.test(ua)) return 'outro'
  return null
}

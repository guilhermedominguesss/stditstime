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

export function readAttribution(search: string): Attribution {
  const q = new URLSearchParams(search)
  const pick = (k: string) => {
    const v = q.get(k)
    return v && v.trim() ? v.trim().slice(0, 200) : null
  }
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

/** Navegador interno: 95% do tráfego vem daqui. */
export function detectInAppBrowser(ua: string): 'instagram' | 'facebook' | 'outro' | null {
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook'
  if (/; wv\)|WebView/i.test(ua)) return 'outro'
  return null
}

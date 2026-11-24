import { ENV } from '../funil/config'

/**
 * Meta Pixel. Regras do projeto:
 *  - PageView no load; ViewContent no fv_start.
 *  - Customizados: FV_IntroCTA (toque na intro), FV_Diagnostico (viu o resultado), FV_StdOn,
 *    FV_Caso, FV_NaoQualificado. Base das conversões personalizadas no Gerenciador.
 *  - Lead SOMENTE no clique de WhatsApp de lead QUALIFICADO, com eventID = refCode
 *    (o mesmo event_id vai para a API de Conversões, para a Meta deduplicar).
 * Pixel bloqueado ou sem ID: tudo vira no-op, nada quebra.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }
    _fbq?: unknown
  }
}

const on = () => !!ENV.metaPixelId

export function initPixel() {
  if (!on() || typeof window === 'undefined' || window.fbq) return
  try {
    /* eslint-disable */
    ;(function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return
      const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
      })
      if (!f._fbq) f._fbq = n
      n.push = n
      n.loaded = true
      n.version = '2.0'
      n.queue = []
      const t = b.createElement(e) as HTMLScriptElement
      t.async = true
      t.src = v
      const s = b.getElementsByTagName(e)[0]
      s.parentNode!.insertBefore(t, s)
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    /* eslint-enable */
    // sem os cliques automáticos da Meta: eles enviariam o texto dos botões (as respostas)
    window.fbq!('set', 'autoConfig', false, ENV.metaPixelId)
    window.fbq!('init', ENV.metaPixelId)
    window.fbq!('track', 'PageView')
  } catch {
    /* silencioso */
  }
}

export type StandardEvent = 'ViewContent' | 'Lead'
export type CustomEvent = 'FV_IntroCTA' | 'FV_Diagnostico' | 'FV_StdOn' | 'FV_Caso' | 'FV_NaoQualificado'

export function pixel(event: StandardEvent | CustomEvent, params: Record<string, unknown> = {}, eventId?: string) {
  try {
    if (!on() || typeof window.fbq !== 'function') return
    const custom = event.startsWith('FV_')
    window.fbq(custom ? 'trackCustom' : 'track', event, params, eventId ? { eventID: eventId } : undefined)
  } catch {
    /* silencioso */
  }
}

const cookie = (name: string) => {
  try {
    return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1]
  } catch {
    return undefined
  }
}

/**
 * Código da aba "Testar eventos", se o site foi aberto com ?test_event_code=TEST…
 * (só esse formato). Com ele, o Lead do servidor também cai na aba de teste.
 */
function testEventCode(): string | undefined {
  try {
    const c = new URLSearchParams(window.location.search).get('test_event_code') ?? sessionStorage.getItem('fv_test_event_code')
    if (c && /^TEST[A-Z0-9]{2,16}$/.test(c)) {
      sessionStorage.setItem('fv_test_event_code', c)
      return c
    }
  } catch {
    /* sem sessionStorage: segue sem código de teste */
  }
  return undefined
}

/** Lead na API de Conversões (função /api/capi na Vercel; o token nunca vem ao navegador). */
export function capiLead(eventId: string, custom: Record<string, unknown>) {
  try {
    void fetch('/api/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'Lead',
        event_id: eventId,
        event_source_url: window.location.href,
        fbp: cookie('_fbp'),
        fbc: cookie('_fbc'),
        custom_data: custom,
        test_event_code: testEventCode(),
      }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    /* silencioso */
  }
}

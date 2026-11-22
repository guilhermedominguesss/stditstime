/**
 * API de Conversões da Meta — função de servidor da Vercel (mesmo modelo do STD Berti).
 *
 * Só aceita `Lead`, e o front só chama isto no clique de WhatsApp de lead QUALIFICADO.
 * O event_id é o refCode da sessão — o mesmo eventID do Pixel —, e é assim que a Meta
 * deduplica. O token fica só em META_CAPI_TOKEN (sem prefixo VITE_): nunca vai ao
 * navegador. Sem token/Pixel configurados, responde { skipped: true } e não quebra nada.
 */
type Env = Record<string, string | undefined>

interface Req {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
}

const REF_RE = /^FV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/
const str = (v: unknown, max = 500) => (typeof v === 'string' && v ? v.slice(0, max) : undefined)
const header = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function sendLead(body: Record<string, unknown>, ctx: { ip?: string; userAgent?: string; env: Env; fetchFn?: typeof fetch }) {
  const { META_CAPI_TOKEN: token, META_TEST_EVENT_CODE: testCode, META_GRAPH_VERSION: version } = ctx.env
  // Pixel da It's Time por padrão: no servidor só o token é obrigatório
  const pixelId = ctx.env.META_PIXEL_ID || ctx.env.VITE_META_PIXEL_ID || '1914116903334296'
  if (!token || !pixelId) return { status: 200, json: { skipped: true } }
  const eventId = str(body.event_id, 16)
  if (body.event_name !== 'Lead' || !eventId || !REF_RE.test(eventId)) return { status: 400, json: { error: 'invalid event' } }

  const custom = (body.custom_data ?? {}) as Record<string, unknown>
  const payload = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: str(body.event_source_url, 1000),
        user_data: {
          client_ip_address: ctx.ip || undefined,
          client_user_agent: ctx.userAgent || undefined,
          fbp: str(body.fbp, 200),
          fbc: str(body.fbc, 300),
        },
        custom_data: {
          content_name: 'Funil Vivo',
          segmento: str(custom.segmento, 30),
          value: typeof custom.value === 'number' && custom.value >= 0 ? Math.round(custom.value) : undefined,
          currency: 'BRL',
        },
      },
    ],
    test_event_code: testCode || undefined,
  }
  const r = await (ctx.fetchFn ?? fetch)(`https://graph.facebook.com/${version || 'v23.0'}/${pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  // o detalhe da Meta fica de fora: a resposta vai para o navegador
  return { status: r.ok ? 200 : 502, json: { ok: r.ok } }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>
    const { status, json } = await sendLead(body, {
      ip: header(req.headers['x-forwarded-for'])?.split(',')[0].trim(),
      userAgent: header(req.headers['user-agent']),
      env: process.env,
    })
    return res.status(status).json(json)
  } catch {
    return res.status(500).json({ error: 'internal' })
  }
}

import { describe, expect, it, vi } from 'vitest'
import { sendLead } from './capi'

const env = { META_CAPI_TOKEN: 'tok', META_PIXEL_ID: '123' }

describe('CAPI', () => {
  it('sem token/pixel não envia nada', async () => {
    const r = await sendLead({ event_name: 'Lead', event_id: 'FV-AB23' }, { env: {} })
    expect(r.json).toEqual({ skipped: true })
  })

  it('só aceita Lead com refCode válido', async () => {
    const fetchFn = vi.fn()
    expect((await sendLead({ event_name: 'ViewContent', event_id: 'FV-AB23' }, { env, fetchFn })).status).toBe(400)
    expect((await sendLead({ event_name: 'Lead', event_id: 'qualquer' }, { env, fetchFn })).status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('envia o Lead com o mesmo event_id do Pixel (dedup)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true })
    const r = await sendLead(
      { event_name: 'Lead', event_id: 'FV-AB23', custom_data: { segmento: 'odonto', value: 7778 } },
      { env, fetchFn, ip: '1.2.3.4', userAgent: 'ua' },
    )
    expect(r.status).toBe(200)
    const body = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(body.data[0].event_id).toBe('FV-AB23')
    expect(body.data[0].event_name).toBe('Lead')
    expect(body.data[0].custom_data.currency).toBe('BRL')
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(body.test_event_code).toBeUndefined()
  })

  it('aceita o código de teste no pedido, só no formato TEST…', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true })
    await sendLead({ event_name: 'Lead', event_id: 'FV-AB23', test_event_code: 'TEST34013' }, { env, fetchFn })
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).test_event_code).toBe('TEST34013')
    await sendLead({ event_name: 'Lead', event_id: 'FV-AB23', test_event_code: 'qualquer coisa' }, { env, fetchFn })
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).test_event_code).toBeUndefined()
  })
})

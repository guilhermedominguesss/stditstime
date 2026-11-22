import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ENV, LEADS_MAX, TICKET_MIDPOINTS, isQualified, whatsappMessage, whatsappNumber,
  type FaturamentoId, type InvesteId, type TicketId,
} from '../funil/config'
import { INBOX, SAIDA_QUALIFICADO as SQ } from '../funil/copy'
import { fmt } from '../funil/math'
import { InboxFlow, type InboxEvent, type InboxResult } from '../inbox/InboxFlow'
import { PhoneFrame } from '../inbox/parts'
import { capiLead, initPixel, pixel } from '../tracking/pixel'
import { tracker } from '../tracking/tracker'
import { Prova, Qualificacao, SaidaNaoQualificado, SaidaQualificado, type SheetRow } from './scenes'

/**
 * O APP (rota /): Caixa de Entrada Viva (cenas 0–7) → Prova (8) → Qualificação (9)
 * → Saída qualificado (10A) | Saída não qualificado (10B).
 * As cenas 8–10 sobem por cima da caixa de entrada, que nunca é desmontada.
 *
 * Tracking: Supabase (fila resiliente) + Meta Pixel + CAPI.
 * Lead dispara SOMENTE no clique de WhatsApp de lead QUALIFICADO, com eventID = refCode.
 * Não qualificado dispara só FV_NaoQualificado.
 */

type Scene = 'inbox' | 'prova' | 'qualificacao' | 'saida_qualificado' | 'saida_nao_qualificado'

export default function App() {
  const [scene, setScene] = useState<Scene>('inbox')
  const [result, setResult] = useState<InboxResult | null>(null)
  const [run, setRun] = useState(0)
  const stdOnSent = useRef(false)

  // tracking e pixel depois da primeira pintura (nunca atrasam o texto da abertura)
  useEffect(() => {
    const id = window.setTimeout(() => {
      tracker.init()
      initPixel()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const enter = useCallback((name: string) => {
    tracker.setScene(name)
    tracker.event('fv_scene_enter', { scene: name })
    tracker.patch({ last_scene: name })
  }, [])

  /* ---------------- eventos da caixa de entrada ---------------- */

  const onInboxEvent = useCallback((e: InboxEvent) => {
    switch (e.type) {
      case 'start':
        tracker.event('fv_start', { segmento: e.segment })
        tracker.patch({ segmento: e.segment })
        pixel('ViewContent', { content_name: 'Funil Vivo', segmento: e.segment })
        break
      case 'scene':
        if (e.scene !== 'nicho') enter(e.scene)
        break
      case 'input': {
        const valor = e.field === 'ticket' ? TICKET_MIDPOINTS[e.value as TicketId] : e.value
        tracker.event('fv_input', { campo: e.field, valor: e.value })
        tracker.patch({ [e.field]: valor })
        break
      }
      case 'std_on':
        if (!stdOnSent.current) {
          stdOnSent.current = true
          tracker.event('fv_std_on')
          tracker.patch({ std_on_at: 'now' })
          pixel('FV_StdOn')
        }
        break
      case 'result': {
        const { diag } = e.result
        setResult(e.result)
        tracker.event('fv_diagnosis_view', {
          conv_hoje: diag.convHoje, conv_proj: diag.convProj, receita_extra: Math.round(diag.receitaExtra), honesta: diag.honest,
        })
        tracker.patch({ valor_em_jogo: Math.round(diag.valorEmJogo), receita_extra: Math.round(diag.receitaExtra) })
        pixel('FV_Diagnostico', { segmento: e.result.segment })
        break
      }
      case 'open_card':
        tracker.event('fv_scene_enter', { scene: 'card_aberto' })
        break
    }
  }, [enter])

  /* ---------------- cenas 8–10 ---------------- */

  const openProof = () => {
    setScene('prova')
    enter('prova')
    tracker.event('fv_case_view')
    pixel('FV_Caso')
  }

  const back = (to: Scene, from: string) => {
    tracker.event('fv_back', { de: from })
    setScene(to)
    enter(to === 'inbox' ? 'resultado' : to)
  }

  const qualify = (investe: InvesteId, faturamento: FaturamentoId) => {
    const ok = isQualified(investe, faturamento)
    tracker.patch({ investe, faturamento, qualificado: ok })
    if (ok) {
      tracker.event('fv_qualified', { investe, faturamento })
      setScene('saida_qualificado')
      enter('saida_qualificado')
    } else {
      tracker.event('fv_disqualified', { investe, faturamento })
      tracker.patch({ outcome: 'nao_qualificado', completed_at: 'now' })
      pixel('FV_NaoQualificado')
      setScene('saida_nao_qualificado')
      enter('saida_nao_qualificado')
    }
  }

  // mensagem e ficha técnica da saída qualificada
  const exit = useMemo(() => {
    if (!result) return null
    const { diag } = result
    const ticketLabel = INBOX.ticketChip[result.ticket]
    const message = whatsappMessage(
      {
        segmento: INBOX.segmentChip[result.segment],
        leads: result.leads,
        conv10: result.a10,
        ticketLabel,
        receitaExtraMes: diag.honest ? null : Math.round(diag.receitaExtra),
        refCode: tracker.refCode,
      },
      fmt,
    )
    const rows: SheetRow[] = [
      { label: SQ.sheet.negocio, value: INBOX.segmentChip[result.segment] },
      { label: SQ.sheet.leads, value: result.leads >= LEADS_MAX ? '1.000+' : fmt(result.leads) },
      { label: SQ.sheet.conv, value: `${result.a10}/10` },
      { label: SQ.sheet.ticket, value: ticketLabel },
      diag.honest
        ? { label: SQ.sheet.ganho, value: SQ.sheet.honest, accent: true }
        : { label: SQ.sheet.ganho, value: `+ R$ ${fmt(diag.receitaExtra)}/mês`, accent: true },
    ]
    const href = `https://wa.me/${whatsappNumber(ENV.whatsappNumber)}?text=${encodeURIComponent(message)}`
    return { message, rows, href }
  }, [result])

  /** O único lugar que dispara Lead: clique de WhatsApp de lead QUALIFICADO. */
  const onWhatsApp = () => {
    if (!result) return
    const value = result.diag.honest ? 0 : Math.round(result.diag.receitaExtra)
    tracker.event('fv_whatsapp_click', { ref_code: tracker.refCode })
    tracker.patch({ outcome: 'whatsapp', completed_at: 'now' })
    pixel('Lead', { content_name: 'Funil Vivo', value, currency: 'BRL' }, tracker.refCode)
    capiLead(tracker.refCode, { segmento: result.segment, value })
  }

  const restart = () => {
    setScene('inbox')
    setResult(null)
    setRun((r) => r + 1)
  }

  return (
    <MotionConfig reducedMotion="user">
      <PhoneFrame>
        <InboxFlow key={run} onEvent={onInboxEvent} onProof={openProof} />
        <AnimatePresence>
          {(scene === 'prova' || scene === 'qualificacao') && (
            <Prova
              key="prova"
              onBack={() => back('inbox', 'prova')}
              onNext={() => { setScene('qualificacao'); enter('qualificacao') }}
              onOpenStd={() => tracker.event('fv_case_open_std')}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {scene === 'qualificacao' && <Qualificacao key="qual" onBack={() => back('prova', 'qualificacao')} onDone={qualify} />}
        </AnimatePresence>
        <AnimatePresence>
          {scene === 'saida_qualificado' && exit && (
            <SaidaQualificado key="sq" rows={exit.rows} message={exit.message} href={exit.href} onWhatsApp={onWhatsApp} />
          )}
          {scene === 'saida_nao_qualificado' && (
            <SaidaNaoQualificado
              key="snq"
              onCheck={(i, checked) => tracker.event('fv_checklist_check', { item: i + 1, marcado: checked })}
              onRestart={restart}
            />
          )}
        </AnimatePresence>
      </PhoneFrame>
    </MotionConfig>
  )
}

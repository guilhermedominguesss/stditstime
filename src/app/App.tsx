import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ENV, TICKET_MIDPOINTS, isQualified, whatsappMessage, whatsappNumber,
  type FaturamentoId, type InvesteId, type TicketId,
} from '../funil/config'
import { INBOX, SAIDA_QUALIFICADO as SQ } from '../funil/copy'
import { fmt } from '../funil/math'
import { InboxFlow, type InboxEvent, type InboxResult } from '../inbox/InboxFlow'
import { PhoneFrame } from '../inbox/parts'
import { capiLead, initPixel, pixel } from '../tracking/pixel'
import { tracker } from '../tracking/tracker'
import { maskPhone } from '../funil/phone'
import { Prova, Qualificacao, SaidaNaoQualificado, SaidaQualificado, WhatsAppBack, type GainLine } from './scenes'

/** abriu o WhatsApp: guardado na aba para a rede de segurança (sobrevive a recarregar) */
const WA_KEY = 'fv_wa_open'
const WA_WINDOW_MS = 90_000
interface WaOpen { at: number; sid: string; ref: string; href: string; message: string }

function readWaOpen(): WaOpen | null {
  try {
    const raw = sessionStorage.getItem(WA_KEY)
    const v = raw ? (JSON.parse(raw) as WaOpen) : null
    return v && Date.now() - v.at <= WA_WINDOW_MS ? v : null
  } catch {
    return null
  }
}

/**
 * O APP (rota /): Caixa de Entrada Viva (cenas 0–7) → Prova (8) → Qualificação (9)
 * → Saída qualificado (10A) | Saída não qualificado (10B).
 * As cenas 8–10 sobem por cima da caixa de entrada, que nunca é desmontada.
 *
 * Tracking: Supabase (fila resiliente) + Meta Pixel + CAPI.
 * Lead dispara SOMENTE quando o lead QUALIFICADO envia o número (antes de abrir o WhatsApp),
 * com eventID = refCode.
 * Não qualificado dispara só FV_NaoQualificado.
 */

type Scene = 'inbox' | 'prova' | 'qualificacao' | 'saida_qualificado' | 'saida_nao_qualificado'

export default function App() {
  const [scene, setScene] = useState<Scene>('inbox')
  const [result, setResult] = useState<InboxResult | null>(null)
  const [run, setRun] = useState(0)
  const stdOnSent = useRef(false)
  /** rede de segurança: voltou do WhatsApp em até 90s */
  const [waBack, setWaBack] = useState<(WaOpen & { via: string }) | null>(null)
  const waShown = useRef(false)

  useEffect(() => {
    const check = (via: string) => {
      if (waShown.current || document.visibilityState !== 'visible') return
      const open = readWaOpen()
      if (!open) return
      waShown.current = true
      setWaBack({ ...open, via })
      tracker.eventFor(open.sid, 'fv_whatsapp_retorno', { via, segundos: Math.round((Date.now() - open.at) / 1000) }, 'saida_qualificado')
    }
    // a página foi recarregada ao voltar (o WhatsApp abriu na mesma aba)
    check('recarregou')
    const onVis = () => check('voltou')
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) check('voltou') }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

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
        // a sessão já nasce com last_scene = intro
        if (e.scene !== 'intro') enter(e.scene)
        break
      case 'intro_painted':
        tracker.firstPaint({ ...e.check })
        tracker.event('fv_intro_view', tracker.timing())
        break
      case 'intro_cta':
        tracker.event('fv_intro_cta', { watched_ms: e.watchedMs, ...tracker.timing() })
        tracker.patch({ intro_cta_at: 'now' })
        pixel('FV_IntroCTA')
        break
      case 'input': {
        const valor = e.field === 'ticket' ? TICKET_MIDPOINTS[e.value as TicketId] : e.value
        tracker.event('fv_input', { campo: e.field, valor: e.value, ...e.meta })
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
    const buildMessage = (telefone?: string) => whatsappMessage(
      {
        segmento: INBOX.segmentChip[result.segment],
        leads: result.leads,
        conv10: result.a10,
        ticketLabel,
        receitaExtraMes: diag.honest ? null : Math.round(diag.receitaExtra),
        refCode: tracker.refCode,
        telefone,
      },
      fmt,
    )
    const gain: GainLine = diag.honest
      ? { label: SQ.sheet.ganho, value: SQ.sheet.honest }
      : { label: SQ.sheet.ganho, value: `+ R$ ${fmt(diag.receitaExtra)}/mês` }
    const hrefFor = (message: string) => `https://wa.me/${whatsappNumber(ENV.whatsappNumber)}?text=${encodeURIComponent(message)}`
    return { buildMessage, gain, hrefFor }
  }, [result])

  /**
   * O único lugar que dispara Lead: o lead QUALIFICADO enviou o número.
   * Ordem: grava o número (keepalive + fila) → Lead (pixel + CAPI, eventID = refCode) →
   * só então abre o WhatsApp.
   */
  const onWhatsApp = (digits: string) => {
    if (!result || !exit) return
    const value = result.diag.honest ? 0 : Math.round(result.diag.receitaExtra)
    const message = exit.buildMessage(maskPhone(digits))
    const href = exit.hrefFor(message)
    tracker.saveNow({ whatsapp: digits, qualificado: true, outcome: 'whatsapp', completed_at: 'now' })
    tracker.event('fv_whatsapp_click', { ref_code: tracker.refCode, com_numero: true })
    pixel('Lead', { content_name: 'Funil Vivo', value, currency: 'BRL' }, tracker.refCode)
    capiLead(tracker.refCode, { segmento: result.segment, value })
    try {
      sessionStorage.setItem(WA_KEY, JSON.stringify({ at: Date.now(), sid: tracker.sessionId, ref: tracker.refCode, href, message } satisfies WaOpen))
    } catch { /* sem sessionStorage: a volta pela visibilidade ainda funciona na mesma página */ }
    waShown.current = false
    // um respiro para o pixel sair antes de a página trocar
    window.setTimeout(() => { window.location.href = href }, 250)
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
            <SaidaQualificado key="sq" gain={exit.gain} buildMessage={exit.buildMessage} onSubmit={onWhatsApp} />
          )}
          {scene === 'saida_nao_qualificado' && (
            <SaidaNaoQualificado
              key="snq"
              onCheck={(i, checked) => tracker.event('fv_checklist_check', { item: i + 1, marcado: checked })}
              onRestart={restart}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {waBack && (
            <WhatsAppBack
              key="waback"
              href={waBack.href}
              message={waBack.message}
              onYes={() => {
                tracker.eventFor(waBack.sid, 'fv_whatsapp_confirmado', {}, 'saida_qualificado')
                try { sessionStorage.removeItem(WA_KEY) } catch { /* ok */ }
                setWaBack(null)
              }}
              onNo={() => {
                tracker.eventFor(waBack.sid, 'fv_whatsapp_nao_abriu', {}, 'saida_qualificado')
                window.open(waBack.href, '_blank', 'noopener')
              }}
              onClose={() => {
                try { sessionStorage.removeItem(WA_KEY) } catch { /* ok */ }
                setWaBack(null)
              }}
            />
          )}
        </AnimatePresence>
      </PhoneFrame>
    </MotionConfig>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ExternalLink, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CASE_REF, ENV, FATURAMENTO_OPTIONS, INSTAGRAM, INVESTE_OPTIONS,
  type FaturamentoId, type InvesteId,
} from '../funil/config'
import { CHECKLIST_VAZAMENTOS, PROVA, QUALIFICACAO, SAIDA_NAO_QUALIFICADO, SAIDA_QUALIFICADO } from '../funil/copy'

import { displayOwnerNumber, isValidPhone, maskPhone, phoneDigits } from '../funil/phone'
import { EASE_OUT_EXPO } from '../funil/tokens'
import { CountUp, vibrate } from '../inbox/parts'

/* ------------------------------------------------------------------ */
/* Moldura de cena: sobe por cima da caixa de entrada                  */
/* ------------------------------------------------------------------ */

function Screen({ children, onBack, z = 40, footer }: { children: ReactNode; onBack?: () => void; z?: number; footer?: ReactNode }) {
  // barra fixa sobreposta: o conteúdo ganha padding-bottom = altura medida da barra + 24px
  const footerRef = useRef<HTMLDivElement>(null)
  const [footerH, setFooterH] = useState(0)
  useEffect(() => {
    const el = footerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight))
    ro.observe(el)
    setFooterH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  return (
    <motion.section
      className="absolute inset-0 flex flex-col bg-[#0B0C0F]"
      style={{ zIndex: z }}
      initial={{ y: '100%' }}
      animate={{ y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
      exit={{ y: '100%', transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
    >
      <div className="flex h-12 shrink-0 items-center px-2" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        {onBack && (
          <button type="button" onClick={onBack} className="flex h-11 items-center gap-0.5 rounded-xl px-2 text-[15px] text-ink-muted" aria-label={PROVA.back}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" /> {PROVA.back}
          </button>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6"
        style={footer ? { paddingBottom: footerH + 24 } : undefined}
      >
        {children}
      </div>
      {footer && (
        <div
          ref={footerRef}
          className="absolute inset-x-0 bottom-0 border-t border-line bg-[#0B0C0F] px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          {footer}
        </div>
      )}
    </motion.section>
  )
}

function Primary({ children, onClick, href, icon }: { children: ReactNode; onClick?: () => void; href?: string; icon?: ReactNode }) {
  const cls = 'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-signal text-[17px] font-semibold text-bg'
  if (href) {
    return (
      <motion.a href={href} onClick={onClick} whileTap={{ scale: 0.97 }} className={cls} rel="noopener">
        {icon}
        {children}
      </motion.a>
    )
  }
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.97 }} className={cls}>
      {icon}
      {children}
    </motion.button>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="pb-safe shrink-0 px-5 pb-4 pt-2">{children}</div>
}

/* ------------------------------------------------------------------ */
/* Cena 8 · Prova                                                      */
/* ------------------------------------------------------------------ */

export function Prova({ onBack, onNext, onOpenStd }: { onBack: () => void; onNext: () => void; onOpenStd: () => void }) {
  const [modal, setModal] = useState(false)
  const bars = [
    { label: PROVA.bars.leads, value: CASE_REF.leads },
    { label: PROVA.bars.appointments, value: CASE_REF.appointments },
    { label: PROVA.bars.closes, value: CASE_REF.closes },
  ]
  const chips = [
    { v: Math.round(CASE_REF.qualifiedReplyRate * 100), label: PROVA.chips.qualified },
    { v: Math.round(CASE_REF.abandonRate * 100), label: PROVA.chips.abandon },
    { v: Math.round(CASE_REF.leadToClient * 100), label: PROVA.chips.leadToClient },
  ]
  return (
    <Screen onBack={onBack}>
      <div className="flex min-h-full flex-col">
        <p className="font-mono text-[15px] uppercase tracking-telemetry text-ink-muted">{PROVA.label}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink">
          {CASE_REF.name} · {CASE_REF.niche} · {CASE_REF.city}
        </h2>

        {/* mini funil: barras que se preenchem em sequência */}
        <div className="mt-6 space-y-3">
          {bars.map((b, i) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{b.label}</span>
                <span className="font-mono text-[20px] font-medium text-ink"><DelayedCount value={b.value} delay={300 + i * 300} /></span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-line">
                <motion.div
                  className={`h-full rounded-full ${i === 2 ? 'bg-signal' : 'bg-ink/70'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(b.value / CASE_REF.leads) * 100}%`, transition: { duration: 0.9, delay: 0.3 + i * 0.3, ease: EASE_OUT_EXPO } }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          {chips.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 1.3 + i * 0.15, duration: 0.4 } }}
              className="rounded-2xl border border-line bg-bg-raised px-2.5 py-3"
            >
              <p className="font-mono text-[22px] font-medium text-signal">{c.v}%</p>
              <p className="mt-1 text-[12px] font-semibold uppercase leading-tight tracking-[0.04em] text-ink-muted">{c.label}</p>
            </motion.div>
          ))}
        </div>

        <p className="mt-4 text-[15px] leading-snug text-ink-muted">{PROVA.fine}</p>

        <div className="mt-auto space-y-2.5 pt-6">
          {ENV.thaisStdUrl && (
            <button
              type="button"
              onClick={() => { onOpenStd(); setModal(true) }}
              className="h-[52px] w-full rounded-2xl border border-line text-[15px] font-semibold text-ink"
            >
              {PROVA.openStd}
            </button>
          )}
          <Primary onClick={onNext}>{PROVA.cta}</Primary>
        </div>
      </div>
      <AnimatePresence>{modal && <StdPreview url={ENV.thaisStdUrl} onClose={() => setModal(false)} />}</AnimatePresence>
    </Screen>
  )
}

function DelayedCount({ value, delay }: { value: number; delay: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return <CountUp value={v} ms={900} />
}

/** STD da Thais numa moldura de celular. Se o site bloquear iframe, oferece nova aba. */
function StdPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => { if (!loaded) setBlocked(true) }, 4500)
    return () => clearTimeout(id)
  }, [loaded])
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col bg-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center justify-between px-3 py-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} className="flex h-11 items-center gap-1 px-1 text-[15px] font-semibold text-ink">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> {PROVA.backToFunnel}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-1.5 px-2 text-[15px] text-ink-muted">
          {PROVA.openNewTab} <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
        <div className="relative h-full max-h-[780px] w-full max-w-[380px] overflow-hidden rounded-[36px] border-[8px] border-[#1C1F24] bg-white">
          {!blocked && <iframe src={url} title="STD Thais Kislin" className="h-full w-full" onLoad={() => setLoaded(true)} />}
          {blocked && (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg-raised p-6 text-center">
              <p className="text-[15px] text-ink">{PROVA.iframeBlocked}</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center gap-2 rounded-2xl bg-ink px-5 text-[15px] font-semibold text-bg">
                {PROVA.openNewTab} <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Cena 9 · Qualificação                                               */
/* ------------------------------------------------------------------ */

export function Qualificacao({ onBack, onDone }: { onBack: () => void; onDone: (investe: InvesteId, faturamento: FaturamentoId) => void }) {
  const [investe, setInveste] = useState<InvesteId | null>(null)
  const [fat, setFat] = useState<FaturamentoId | null>(null)
  const [missing, setMissing] = useState(false)
  const submit = () => {
    if (!investe || !fat) { setMissing(true); vibrate(20); return }
    vibrate(12)
    onDone(investe, fat)
  }
  return (
    <Screen onBack={onBack} z={45}>
      <div className="flex min-h-full flex-col">
        <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink">{QUALIFICACAO.title}</h2>
        <fieldset className="mt-6">
          <legend className="text-[17px] font-semibold text-ink">{QUALIFICACAO.investe}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {INVESTE_OPTIONS.map((o) => (
              <Chip key={o} on={investe === o} onClick={() => { setInveste(o); setMissing(false); vibrate(6) }}>{QUALIFICACAO.investeOpt[o]}</Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-7">
          <legend className="text-[17px] font-semibold text-ink">{QUALIFICACAO.faturamento}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {FATURAMENTO_OPTIONS.map((o) => (
              <Chip key={o} on={fat === o} onClick={() => { setFat(o); setMissing(false); vibrate(6) }}>{QUALIFICACAO.faturamentoOpt[o]}</Chip>
            ))}
          </div>
        </fieldset>
        <div className="mt-auto pt-6">
          <AnimatePresence>
            {missing && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 text-[15px] font-semibold text-leak" role="alert">
                {QUALIFICACAO.missing}
              </motion.p>
            )}
          </AnimatePresence>
          <motion.button
            type="button"
            onClick={submit}
            aria-disabled={!investe || !fat}
            whileTap={{ scale: 0.97 }}
            className={`h-14 w-full rounded-2xl text-[17px] font-semibold transition-colors ${investe && fat ? 'bg-signal text-bg' : 'bg-line text-ink-muted'}`}
          >
            {QUALIFICACAO.cta}
          </motion.button>
        </div>
      </div>
    </Screen>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={`h-12 rounded-2xl border px-4 text-[15px] font-semibold transition-colors ${on ? 'border-ink bg-ink text-bg' : 'border-line bg-bg-raised text-ink'}`}
    >
      {children}
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/* Cena 10A · Saída qualificado                                        */
/* ------------------------------------------------------------------ */

/** Linha de destaque da saída: "A MAIS (PROJEÇÃO)" + valor (ou a variante honesta). */
export interface GainLine { label: string; value: string }

export function SaidaQualificado({ gain, buildMessage, onSubmit }: {
  gain: GainLine
  /** mensagem pronta do WhatsApp (com o número da pessoa, quando válido) */
  buildMessage: (telefone?: string) => string
  /** número válido (11 dígitos): grava, dispara o Lead e só então abre o WhatsApp */
  onSubmit: (digits: string) => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [sent, setSent] = useState(false)
  const valid = isValidPhone(digits)
  const submit = () => {
    if (!valid) { setError(true); vibrate(20); return }
    if (sent) return
    setSent(true)
    vibrate(12)
    onSubmit(digits)
    window.setTimeout(() => setSent(false), 2500) // evita toque duplo, mas deixa tentar de novo
  }
  const message = buildMessage(valid ? maskPhone(digits) : undefined)
  return (
    <Screen
      z={50}
      footer={
        <form onSubmit={(e) => { e.preventDefault(); submit() }} noValidate>
          <label htmlFor="fv-whatsapp" className="block text-[15px] font-semibold text-ink">{SAIDA_QUALIFICADO.phoneLabel}</label>
          <input
            id="fv-whatsapp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="send"
            placeholder={SAIDA_QUALIFICADO.phonePlaceholder}
            value={maskPhone(digits)}
            onChange={(e) => { setDigits(phoneDigits(e.target.value)); setError(false) }}
            aria-invalid={error}
            aria-describedby="fv-whatsapp-note"
            className={`mt-1.5 h-[52px] w-full rounded-2xl border bg-bg-raised px-4 font-mono text-[18px] tabular text-ink outline-none placeholder:text-ink-muted/60 focus:border-ink ${error ? 'border-leak' : 'border-line'}`}
          />
          <p id="fv-whatsapp-note" className={`mt-1.5 text-[12px] leading-tight ${error ? 'font-semibold text-leak' : 'text-ink-muted'}`} aria-live="polite">
            {error ? SAIDA_QUALIFICADO.phoneError : SAIDA_QUALIFICADO.phoneNote}
          </p>
          <motion.button
            type="submit"
            aria-disabled={!valid}
            whileTap={valid ? { scale: 0.97 } : undefined}
            className={`mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-semibold text-bg transition-opacity ${valid ? 'bg-signal' : 'bg-signal/35'}`}
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {SAIDA_QUALIFICADO.cta}
          </motion.button>
          <p className="mt-2.5 text-center text-[12px] font-medium leading-tight text-ink-muted">{SAIDA_QUALIFICADO.micro}</p>
        </form>
      }
    >
      <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.01em] text-ink">{SAIDA_QUALIFICADO.title}</h2>
      <div className="mt-5 rounded-2xl border border-signal/30 bg-bg-raised px-4 py-3">
        <p className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{gain.label}</p>
        <p className="mt-0.5 font-mono text-[28px] font-medium leading-tight text-signal">{gain.value}</p>
      </div>
      <p className="mt-6 text-[17px] font-semibold text-ink">{SAIDA_QUALIFICADO.subtitle}</p>
      <div className="mt-3 flex justify-end">
        <div className="max-w-[92%] whitespace-pre-line rounded-2xl rounded-br-md bg-[#2A2F37] px-4 py-3 text-[15px] leading-snug text-ink">{message}</div>
      </div>
      <p className="mt-6 font-serif text-[30px] italic leading-[1.1] text-ink">{SAIDA_QUALIFICADO.narrator}</p>
    </Screen>
  )
}

/* ------------------------------------------------------------------ */
/* Rede de segurança: voltou do WhatsApp em até 90s                    */
/* ------------------------------------------------------------------ */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function WhatsAppBack({ href, message, onYes, onNo, onClose }: {
  href: string; message: string; onYes: () => void; onNo: () => void; onClose: () => void
}) {
  const B = SAIDA_QUALIFICADO.back
  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState<'num' | 'msg' | null>(null)
  const owner = displayOwnerNumber(ENV.whatsappNumber)
  const copy = async (what: 'num' | 'msg') => {
    if (await copyText(what === 'num' ? owner.replace(/\D/g, '') : message)) {
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1800)
    }
  }
  return (
    <motion.div
      className="absolute inset-0 z-[80] flex items-end bg-black/70"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fv-back-title"
    >
      <motion.div
        className="w-full rounded-t-3xl border-t border-line bg-[#0E1013] px-5 pt-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        initial={{ y: 40 }}
        animate={{ y: 0, transition: { duration: 0.35, ease: EASE_OUT_EXPO } }}
      >
        <h2 id="fv-back-title" className="text-[24px] font-semibold leading-tight text-ink">{B.title}</h2>
        {!help ? (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onYes} className="h-14 rounded-2xl bg-signal text-[16px] font-semibold text-bg">{B.yes}</button>
            <button
              type="button"
              onClick={() => { setHelp(true); onNo() }}
              className="h-14 rounded-2xl border border-line text-[16px] font-semibold text-ink"
            >
              {B.no}
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[15px] leading-snug text-ink">{B.help}</p>
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-bg-raised px-4 py-3">
              <span className="flex-1 font-mono text-[20px] tabular text-ink">{owner}</span>
              <button type="button" onClick={() => void copy('num')} className="h-10 rounded-xl border border-line px-3 text-[14px] font-semibold text-ink">
                {copied === 'num' ? B.copied : B.copyNumber}
              </button>
            </div>
            <div className="mt-2 rounded-2xl border border-line bg-bg-raised px-4 py-3">
              <p className="max-h-28 overflow-y-auto whitespace-pre-line text-[13px] leading-snug text-ink">{message}</p>
              <button type="button" onClick={() => void copy('msg')} className="mt-2 h-10 w-full rounded-xl border border-line text-[14px] font-semibold text-ink">
                {copied === 'msg' ? B.copied : B.copyMessage}
              </button>
            </div>
            <a href={href} target="_blank" rel="noopener" className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-signal text-[16px] font-semibold text-bg">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {B.reopen}
            </a>
            <button type="button" onClick={onClose} className="mt-2 h-11 w-full text-[15px] text-ink-muted">{B.close}</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Cena 10B · Saída não qualificado (tom respeitoso, nunca de rejeição) */
/* ------------------------------------------------------------------ */

export function SaidaNaoQualificado({ onCheck, onRestart }: { onCheck: (i: number, checked: boolean) => void; onRestart: () => void }) {
  const [checked, setChecked] = useState<number[]>([])
  const toggle = (i: number) => {
    const on = !checked.includes(i)
    vibrate(6)
    setChecked((c) => (on ? [...c, i] : c.filter((x) => x !== i)))
    onCheck(i, on)
  }
  return (
    <Screen z={50}>
      <h2 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.01em] text-ink">{SAIDA_NAO_QUALIFICADO.title}</h2>
      <p className="mt-3 text-[17px] leading-snug text-ink">{SAIDA_NAO_QUALIFICADO.subtitle}</p>
      <ul className="mt-4 space-y-2">
        {CHECKLIST_VAZAMENTOS.map((item, i) => {
          const on = checked.includes(i)
          return (
            <li key={item}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${on ? 'border-signal/40 bg-signal/[0.06]' : 'border-line bg-bg-raised'}`}
              >
                <span className={`mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? 'border-signal bg-signal text-bg' : 'border-line text-transparent'}`} aria-hidden="true">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className={`text-[15px] leading-snug ${on ? 'text-ink' : 'text-ink'}`}>{item}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-6 text-[15px] leading-snug text-ink">{SAIDA_NAO_QUALIFICADO.footer}</p>
      <a href={INSTAGRAM.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[15px] font-semibold text-ink underline underline-offset-4">
        {INSTAGRAM.handle}
      </a>
      <Footer>
        <button type="button" onClick={onRestart} className="mt-4 h-[52px] w-full rounded-2xl border border-line text-[15px] font-medium text-ink">
          {SAIDA_NAO_QUALIFICADO.restart}
        </button>
      </Footer>
    </Screen>
  )
}


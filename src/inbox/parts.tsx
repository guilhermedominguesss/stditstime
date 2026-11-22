import { AnimatePresence, LayoutGroup, motion, type Variants } from 'framer-motion'
import {
  Briefcase, CheckCheck, ChevronLeft, CircleEllipsis, Eye, GraduationCap, Smile, Sparkles,
  Stethoscope, Store, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CASE_REF, type InboxPerson, type SegmentId } from '../funil/config'
import { INBOX as C } from '../funil/copy'
import { fmt } from '../funil/math'
import { AVATAR_TONES, EASE_OUT_EXPO } from '../funil/tokens'

/**
 * Peças da Caixa de Entrada Viva (base do app). Sem estado de fluxo: quem orquestra é a
 * tela (ex.: src/lab4/Lab4.tsx). Texto mínimo de 15px; mono só em números.
 */

export const TOTAL = 8
export const TOP = TOTAL - 1
export const time = (i: number) => `09:${String(12 + i * 4).padStart(2, '0')}`
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
export const firstName = (name: string) => name.split(' ')[0]

export function vibrate(ms: number) {
  try { navigator.vibrate?.(ms) } catch { /* iOS: silencioso */ }
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ---------------- números ---------------- */

/** Odômetro de valor: interpola até o alvo (sem motion reduzido, troca direto). */
export function CountUp({ value, ms = 600, format = fmt }: { value: number; ms?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(value)
  const cur = useRef(value)
  useEffect(() => {
    if (reduced()) { cur.current = value; setV(value); return }
    const a = cur.current
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const x = a + (value - a) * (1 - Math.pow(1 - k, 3))
      cur.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <span className="tabular">{format(v)}</span>
}

/* ---------------- nicho ---------------- */

const SEGMENT_ICONS: Record<SegmentId, LucideIcon> = {
  clinica: Stethoscope, estetica: Sparkles, odonto: Smile, educacao: GraduationCap,
  servicos: Briefcase, varejo: Store, alimentacao: UtensilsCrossed, outro: CircleEllipsis,
}
export const SEGMENT_ORDER: SegmentId[] = ['clinica', 'estetica', 'odonto', 'educacao', 'servicos', 'varejo', 'alimentacao', 'outro']

export function NichePicker({ onPick }: { onPick: (s: SegmentId) => void }) {
  return (
    <motion.section className="pt-safe flex flex-1 flex-col justify-center px-5 pb-8" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.5 } }}>
      <motion.h1
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: { duration: 0.6, ease: EASE_OUT_EXPO } }}
        className="text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink"
      >
        {C.nicheTitle}
      </motion.h1>
      <p className="mt-2 text-[15px] leading-snug text-ink-muted">{C.nicheSub}</p>
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {SEGMENT_ORDER.map((s, i) => {
          const Icon = SEGMENT_ICONS[s]
          return (
            <motion.button
              key={s}
              type="button"
              onClick={(e) => { e.stopPropagation(); onPick(s) }}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { duration: 0.45, delay: 0.15 + i * 0.04, ease: EASE_OUT_EXPO } }}
              whileTap={{ scale: 0.97 }}
              className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-line bg-bg-raised px-3.5 py-3 text-left text-[15px] font-medium leading-tight text-ink"
            >
              <Icon className="h-5 w-5 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
              {C.segmentChip[s]}
            </motion.button>
          )
        })}
      </div>
    </motion.section>
  )
}

/* ---------------- avatar e linha de conversa ---------------- */

export function Avatar({ name, idx, size, dim = false }: { name: string; idx: number; size: number; dim?: boolean }) {
  const tone = AVATAR_TONES[idx % AVATAR_TONES.length]
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold transition-opacity"
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: size * 0.36, opacity: dim ? 0.45 : 1 }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}

export const rowVariants = (stagger: number): Variants => ({
  initial: { opacity: 0, y: -28, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
  // rebobinar: sai para cima, em sequência rápida (de cima para baixo)
  exit: (i: number) => ({ opacity: 0, y: -70, transition: { duration: 0.24, delay: i * (stagger / 1000), ease: [0.4, 0, 1, 1] } }),
})

export function ConversationRow({ p, idx, index, variants, pulsing, ghost, onTap }: {
  p: InboxPerson; idx: number; index: number; variants: Variants; pulsing: boolean; ghost: boolean; onTap?: () => void
}) {
  return (
    <motion.li layout="position" custom={index} variants={variants} initial="initial" animate="enter" exit="exit" className="relative">
      <motion.div
        role={onTap ? 'button' : undefined}
        tabIndex={onTap ? 0 : undefined}
        onClick={onTap ? (e) => { e.stopPropagation(); onTap() } : undefined}
        onKeyDown={onTap ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap() } } : undefined}
        className="relative flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left"
        animate={{ backgroundColor: ghost ? 'rgba(14,16,19,0.6)' : 'rgba(14,16,19,0)' }}
      >
        {pulsing && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-1 rounded-2xl ring-2 ring-ink"
            animate={{ opacity: [0.7, 0.15, 0.7] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <Avatar name={p.name} idx={idx} size={44} dim={ghost} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[16px] font-semibold ${ghost ? 'text-ink-muted' : 'text-ink'}`}>{p.name}</span>
            <span className="shrink-0 text-[15px] text-ink-muted">{time(idx)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className={`truncate text-[15px] ${ghost ? 'text-ink-muted' : 'font-medium text-ink'}`}>{p.msg}</p>
            {!ghost && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" aria-label="não lida" />}
          </div>
          <AnimatePresence>
            {ghost && (
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE_OUT_EXPO } }}
                className="mt-1.5 inline-flex h-7 items-center rounded-full bg-leak/10 px-2.5 text-[15px] font-semibold text-leak"
              >
                {C.ghostSeal}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.li>
  )
}

/* ---------------- card de triagem (compacto) ---------------- */

export function TriageCard({ p, idx, extraLabel, seenBefore, onOpen }: {
  p: InboxPerson; idx: number; extraLabel: string; seenBefore: string[]; onOpen?: () => void
}) {
  return (
    <motion.button
      type="button"
      layout="position"
      disabled={!onOpen}
      onClick={(e) => { e.stopPropagation(); onOpen?.() }}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      whileTap={onOpen ? { scale: 0.985 } : undefined}
      className="w-full rounded-2xl border border-line bg-bg-raised px-3.5 py-2 text-left"
    >
      {p.ready && (
        <p className="mb-1 text-[15px] leading-[1.28] text-ink-muted">
          {C.seenBeforeLabel} <span className="text-ink">{seenBefore.join(' · ')}</span>
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <Avatar name={p.name} idx={idx} size={26} />
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight text-ink">{p.name}</span>
        <span
          className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[15px] font-semibold ${
            p.ready ? 'bg-signal/15 text-signal' : 'border border-line text-ink-muted'
          }`}
        >
          {p.ready ? C.readyTag : C.researchingTag}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[15px] leading-[1.28]">
        <span className="text-ink-muted">{C.fieldQuer}:</span> <span className="text-ink">{p.quer}</span>
        <span className="text-ink-muted"> · {C.fieldQuando}:</span> <span className="text-ink">{p.quando}</span>
        <span className="text-ink-muted"> · {extraLabel}:</span> <span className="text-ink">{p.extra}</span>
      </p>
    </motion.button>
  )
}

/**
 * Card v2 (/lab5): linha 1 avatar + nome + etiqueta (o nome nunca trunca: a etiqueta
 * quebra para a linha de baixo); linha 2 os 3 campos; rodapé "Viu antes de chamar".
 */
export function TriageCardV2({ p, idx, extraLabel, seenBefore, onOpen }: {
  p: InboxPerson; idx: number; extraLabel: string; seenBefore: string[]; onOpen?: () => void
}) {
  return (
    <motion.button
      type="button"
      layout="position"
      disabled={!onOpen}
      onClick={(e) => { e.stopPropagation(); onOpen?.() }}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      whileTap={onOpen ? { scale: 0.985 } : undefined}
      className="w-full rounded-2xl border border-line bg-bg-raised px-3.5 py-2.5 text-left"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={p.name} idx={idx} size={26} />
          <span className="text-[16px] font-semibold leading-tight text-ink">{p.name}</span>
        </div>
        <span
          className={`ml-auto inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[15px] font-semibold ${
            p.ready ? 'bg-signal/15 text-signal' : 'border border-line text-ink-muted'
          }`}
        >
          {p.ready ? C.readyTag : C.researchingTag}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[15px] leading-[1.28]">
        <span className="text-ink-muted">{C.fieldQuer}:</span> <span className="text-ink">{p.quer}</span>
        <span className="text-ink-muted"> · {C.fieldQuando}:</span> <span className="text-ink">{p.quando}</span>
        <span className="text-ink-muted"> · {extraLabel}:</span> <span className="text-ink">{p.extra}</span>
      </p>
      {p.ready && (
        <p className="mt-1.5 flex gap-1.5 text-[15px] leading-[1.28] text-ink/85">
          <Eye className="mt-[2px] h-4 w-4 shrink-0 text-signal" strokeWidth={2} aria-hidden="true" />
          <span>{C.seenBeforeFooter} {seenBefore.join(' · ')}</span>
        </p>
      )}
    </motion.button>
  )
}

/** 3 dos 5 itens do nicho, variando por pessoa. */
export const seenFor = (items: string[], idx: number) => [0, 1, 2].map((j) => items[(idx + j * 2) % items.length])

/* ---------------- chats ---------------- */

export function ChatShell({ children, header, onClick }: { children: ReactNode; header: ReactNode; onClick?: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col bg-[#0B0C0F]"
      initial={{ x: '100%' }}
      animate={{ x: 0, transition: { duration: 0.42, ease: EASE_OUT_EXPO } }}
      exit={{ x: '100%', transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
      onClick={(e) => { e.stopPropagation(); onClick?.() }}
    >
      <div className="flex items-center gap-3 border-b border-line px-3 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>{header}</div>
      {children}
    </motion.div>
  )
}

export type PainStep = 'compose' | 'sent' | 'seen' | 'typing' | 'idle' | 'gone'

export function ChatPain({ p, idx, reply, step, onSend, onFastForward }: {
  p: InboxPerson; idx: number; reply: string; step: PainStep; onSend: () => void; onFastForward?: () => void
}) {
  const sent = step !== 'compose'
  const seen = step === 'seen' || step === 'typing' || step === 'idle' || step === 'gone'
  const status = step === 'typing' ? C.typing : step === 'gone' ? C.lastSeen('09:43') : 'online'
  return (
    <ChatShell
      onClick={onFastForward}
      header={
        <>
          <ChevronLeft className="h-6 w-6 text-ink-muted" aria-hidden="true" />
          <Avatar name={p.name} idx={idx} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-ink">{p.name}</p>
            <AnimatePresence mode="wait">
              <motion.p key={status} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[15px] text-ink-muted">
                {status}
              </motion.p>
            </AnimatePresence>
          </div>
        </>
      }
    >
      <LayoutGroup>
        <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 py-5">
          <Bubble time={time(idx)}>{p.msg}</Bubble>
          {sent && (
            <motion.div layoutId="reply" transition={{ duration: 0.5, ease: EASE_OUT_EXPO }} className="max-w-[80%] self-end">
              <div className="rounded-2xl rounded-br-md bg-[#2A2F37] px-3.5 py-2.5 text-[16px] leading-snug text-ink">{reply}</div>
            </motion.div>
          )}
          <AnimatePresence>
            {seen && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.4 } }} className="flex items-center gap-1.5 self-end text-[15px] text-ink-muted">
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                {C.seen}
              </motion.p>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {step === 'typing' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md bg-bg-raised px-4 py-3.5"
                aria-label={C.typing}
              >
                {[0, 1, 2].map((d) => (
                  <motion.span key={d} className="h-2 w-2 rounded-full bg-ink-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pb-safe border-t border-line px-3 pb-4 pt-3">
          {!sent ? (
            <div className="flex items-end gap-2">
              <motion.div layoutId="reply" transition={{ duration: 0.5, ease: EASE_OUT_EXPO }} className="min-w-0 flex-1 rounded-2xl border border-line bg-bg-raised px-3.5 py-2.5">
                <div className="text-[16px] leading-snug text-ink">{reply}</div>
              </motion.div>
              <motion.button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSend() }}
                whileTap={{ scale: 0.95 }}
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="h-12 shrink-0 rounded-2xl bg-ink px-5 text-[16px] font-semibold text-bg"
              >
                {C.send}
              </motion.button>
            </div>
          ) : (
            <div className="h-12 rounded-2xl border border-line px-3.5 text-[16px] leading-[48px] text-ink-muted/60">Mensagem</div>
          )}
        </div>
      </LayoutGroup>
    </ChatShell>
  )
}

export function ChatTriage({ p, idx, extraLabel, seenBefore, onBack }: {
  p: InboxPerson; idx: number; extraLabel: string; seenBefore: string[]; onBack: () => void
}) {
  return (
    <ChatShell
      header={
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onBack() }} className="flex h-11 items-center pr-1 text-ink" aria-label={C.back}>
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <Avatar name={p.name} idx={idx} size={36} />
          <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">{p.name}</p>
          <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-signal/15 px-2.5 text-[15px] font-semibold text-signal">{C.readyTag}</span>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.45, delay: 0.25, ease: EASE_OUT_EXPO } }}
          className="max-w-[88%] rounded-2xl rounded-bl-md bg-bg-raised px-4 py-3 text-[16px] leading-snug text-ink"
        >
          <p>{C.triageIntro}</p>
          <div className="my-3 rounded-xl border border-signal/30 bg-signal/[0.06] px-3 py-2.5">
            <p className="mb-1.5 text-[15px] font-semibold text-signal">{C.triageHeader}</p>
            <dl className="space-y-1 text-[15px]">
              <Field label={C.fieldQuer} value={p.quer} />
              <Field label={C.fieldQuando} value={p.quando} />
              <Field label={extraLabel} value={p.extra} />
            </dl>
            <p className="mt-2 text-[15px] leading-snug text-ink-muted">
              {C.seenBeforeLabel} <span className="text-ink">{seenBefore.join(' · ')}</span>
            </p>
          </div>
          <p>{C.triageName(firstName(p.name))}</p>
          <p className="mt-1.5 text-right text-[15px] text-ink-muted">09:44</p>
        </motion.div>
      </div>
      <div className="pb-safe px-4 pb-4">
        <button type="button" onClick={(e) => { e.stopPropagation(); onBack() }} className="h-[52px] w-full rounded-2xl border border-line text-[15px] font-medium text-ink">
          {C.back}
        </button>
      </div>
    </ChatShell>
  )
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="text-ink-muted">{label}:</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function Bubble({ time: t, children }: { time: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.3 } }}
      className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-bg-raised px-3.5 py-2.5 text-[16px] leading-snug text-ink"
    >
      {children}
      <span className="ml-2 align-bottom text-[15px] text-ink-muted">{t}</span>
    </motion.div>
  )
}

export function ProofPlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col bg-[#0B0C0F] px-5"
      initial={{ y: '100%' }}
      animate={{ y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      exit={{ y: '100%', transition: { duration: 0.3 } }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pt-safe flex flex-1 flex-col justify-center">
        <p className="font-mono text-[15px] uppercase tracking-telemetry text-ink-muted">{C.proofLabel}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight text-ink">
          {CASE_REF.name} · {CASE_REF.niche} · {CASE_REF.city}
        </h2>
        <p className="mt-4 text-[15px] leading-snug text-ink-muted">{C.proofPlaceholder}</p>
      </div>
      <div className="pb-safe pb-4">
        <button type="button" onClick={onBack} className="h-[52px] w-full rounded-2xl border border-line text-[15px] font-medium text-ink">
          {C.proofBack}
        </button>
      </div>
    </motion.div>
  )
}

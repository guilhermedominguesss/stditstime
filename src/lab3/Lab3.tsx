import { AnimatePresence, LayoutGroup, MotionConfig, motion, type Variants } from 'framer-motion'
import {
  ArrowUp, Briefcase, CheckCheck, ChevronLeft, CircleEllipsis, GraduationCap, Smile, Sparkles,
  Stethoscope, Store, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CASE_REF, INBOX_BANK, type InboxNiche, type InboxPerson, type SegmentId } from '../funil/config'
import { INBOX as C } from '../funil/copy'
import { fmt } from '../funil/math'
import { AVATAR_TONES, EASE_OUT_EXPO } from '../funil/tokens'
import { Rolling } from '../funil/ui/Rolling'

/**
 * /lab3 — Caixa de Entrada Viva, v2.
 *  0. Nicho primeiro (banco de mensagens por segmento em config.ts).
 *  1. A dor, ensinada com 1: a pessoa responde o preço e é deixada no vácuo.
 *     Depois, mais 5 somem do mesmo jeito.
 *  2. O mesmo anúncio com filtro: as MESMAS 8 pessoas chegam como cards de triagem,
 *     ordenadas por prioridade. O STD não barra ninguém: quem ainda pesquisa também
 *     chega, só que você já sabe disso antes de responder.
 * Toque na tela pula a animação em curso (nunca prende ninguém).
 */

type Phase = 'niche' | 'arriving' | 'prompt' | 'chat' | 'ghosting' | 'question' | 'rewind' | 'cards' | 'phrase' | 'done'
type ChatStep = 'compose' | 'sent' | 'seen' | 'typing' | 'silence'

const T = {
  firstArrive: 300,
  arriveEvery: 450,
  promptDelay: 600,
  seenAfter: 700,
  silence1: 2500,
  typing: 1000,
  silence2: 1400,
  firstGhostHold: 900,
  ghostEvery: 300,
  questionDelay: 700,
  ctaDelay: 1100,
  rewindStagger: 55,
  cardEvery: 380,
  phraseDelay: 700,
  phraseHold: 2000,
} as const

const SEGMENT_ICONS: Record<SegmentId, LucideIcon> = {
  clinica: Stethoscope,
  estetica: Sparkles,
  odonto: Smile,
  educacao: GraduationCap,
  servicos: Briefcase,
  varejo: Store,
  alimentacao: UtensilsCrossed,
  outro: CircleEllipsis,
}
const SEGMENT_ORDER: SegmentId[] = ['clinica', 'estetica', 'odonto', 'educacao', 'servicos', 'varejo', 'alimentacao', 'outro']

const TOTAL = 8
const TOP = TOTAL - 1
const time = (i: number) => `09:${String(12 + i * 4).padStart(2, '0')}`
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const firstName = (name: string) => name.split(' ')[0]

const rowVariants: Variants = {
  initial: { opacity: 0, y: -28, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
  // rebobinar: sai para cima, em sequência rápida (de cima para baixo)
  exit: (i: number) => ({ opacity: 0, y: -70, transition: { duration: 0.24, delay: i * (T.rewindStagger / 1000), ease: [0.4, 0, 1, 1] } }),
}

function vibrate(ms: number) {
  try { navigator.vibrate?.(ms) } catch { /* iOS: silencioso */ }
}

export default function Lab3() {
  const [segment, setSegment] = useState<SegmentId | null>(null)
  const [phase, setPhase] = useState<Phase>('niche')
  const [n, setN] = useState(0)
  const [ghosted, setGhosted] = useState<number[]>([])
  const [chatStep, setChatStep] = useState<ChatStep>('compose')
  const [showCta, setShowCta] = useState(false)
  const [k, setK] = useState(0)
  const [openCard, setOpenCard] = useState<number | null>(null)
  const [proof, setProof] = useState(false)
  const timers = useRef<number[]>([])
  const chatTimers = useRef<number[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  const later = useCallback((fn: () => void, ms: number, bucket = timers) => {
    bucket.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    chatTimers.current.forEach(clearTimeout)
  }, [])

  const niche: InboxNiche | null = segment ? INBOX_BANK[segment] : null
  const people = niche?.people ?? []

  /** ordem em que somem: primeiro a respondida (topo), depois as outras de cima para baixo */
  const ghostOrder = useMemo(() => {
    const rest: number[] = []
    for (let i = TOP - 1; i >= 0; i--) if (!people[i]?.readyBefore) rest.push(i)
    return [TOP, ...rest]
  }, [people])

  /** depois: prontas primeiro, quem ainda pesquisa embaixo */
  const cardOrder = useMemo(() => {
    const idx = people.map((_, i) => i)
    return [...idx.filter((i) => people[i].ready), ...idx.filter((i) => !people[i].ready)]
  }, [people])

  const readyBefore = people.filter((p) => p.readyBefore).length
  const readyAfter = people.filter((p) => p.ready).length

  /* ---------------- fluxo ---------------- */

  const start = (s: SegmentId) => {
    vibrate(8)
    setSegment(s)
    setN(0)
    setGhosted([])
    setK(0)
    setOpenCard(null)
    setShowCta(false)
    setPhase('arriving')
  }

  // as conversas chegam, uma a uma
  useEffect(() => {
    if (phase !== 'arriving') return
    if (n >= TOTAL) {
      later(() => setPhase('prompt'), T.promptDelay)
      return
    }
    const id = window.setTimeout(() => setN((x) => x + 1), n === 0 ? T.firstArrive : T.arriveEvery)
    return () => clearTimeout(id)
  }, [phase, n, later])

  const openChat = () => {
    if (phase !== 'prompt') return
    vibrate(8)
    setChatStep('compose')
    setPhase('chat')
  }

  const closeChat = useCallback(() => {
    chatTimers.current.forEach(clearTimeout)
    chatTimers.current = []
    setPhase('ghosting')
    setGhosted([TOP])
  }, [])

  const send = () => {
    vibrate(12)
    setChatStep('sent')
    let t = T.seenAfter
    later(() => setChatStep('seen'), t, chatTimers)
    t += T.silence1
    later(() => setChatStep('typing'), t, chatTimers)
    t += T.typing
    later(() => setChatStep('silence'), t, chatTimers)
    t += T.silence2
    later(closeChat, t, chatTimers)
  }

  // as outras 5 somem do mesmo jeito
  useEffect(() => {
    if (phase !== 'ghosting') return
    if (ghosted.length >= ghostOrder.length) {
      later(() => setPhase('question'), T.questionDelay)
      return
    }
    const id = window.setTimeout(() => {
      setGhosted((g) => [...g, ghostOrder[g.length]])
      vibrate(6)
    }, ghosted.length === 1 ? T.firstGhostHold : T.ghostEvery)
    return () => clearTimeout(id)
  }, [phase, ghosted, ghostOrder, later])

  useEffect(() => {
    if (phase === 'question') later(() => setShowCta(true), T.ctaDelay)
  }, [phase, later])

  const turnOn = () => {
    vibrate(24)
    setShowCta(false)
    setPhase('rewind')
    later(() => { setK(0); setPhase('cards') }, TOTAL * T.rewindStagger + 450)
  }

  // as mesmas pessoas chegam como cards de triagem
  useEffect(() => {
    if (phase !== 'cards') return
    if (k >= TOTAL) {
      later(() => setPhase('phrase'), T.phraseDelay)
      return
    }
    const id = window.setTimeout(() => setK((x) => x + 1), k === 0 ? 150 : T.cardEvery)
    return () => clearTimeout(id)
  }, [phase, k, later])

  useEffect(() => {
    if (phase === 'phrase') later(() => setPhase('done'), T.phraseHold)
  }, [phase, later])

  // acompanha o card que chega; no fim volta ao topo (placar)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (phase === 'cards' && k > 2) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    if (phase === 'done') el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
  }, [phase, k])

  // toque na tela: pula para o fim do momento em curso
  const skip = () => {
    if (phase === 'arriving') setN(TOTAL)
    else if (phase === 'ghosting') setGhosted(ghostOrder)
    else if (phase === 'cards') setK(TOTAL)
  }

  /* ---------------- render ---------------- */

  const beforePhases: Phase[] = ['arriving', 'prompt', 'chat', 'ghosting', 'question']
  const isBefore = beforePhases.includes(phase)
  const isAfter = phase === 'cards' || phase === 'phrase' || phase === 'done'
  const rows = isBefore ? Array.from({ length: n }, (_, i) => n - 1 - i) : []
  const showList = isBefore || phase === 'rewind'
  const cards = isAfter ? cardOrder.slice(0, k) : []

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex h-dvh-safe w-full items-center justify-center bg-bg md:p-6">
        <div
          className="relative flex h-full w-full flex-col overflow-hidden bg-[#0B0C0F] md:h-[min(844px,calc(100dvh-48px))] md:w-[390px] md:rounded-[44px] md:border-[10px] md:border-[#1C1F24]"
          onClick={skip}
        >
          {phase === 'niche' ? (
            <NichePicker onPick={start} />
          ) : (
            <>
              <header className="flex items-center justify-between px-5 pb-3" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
                <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">{C.title}</h1>
                <AnimatePresence>
                  {(phase === 'arriving' || phase === 'prompt') && n > 0 && (
                    <motion.span
                      key="badge"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      className="flex h-8 min-w-8 items-center justify-center rounded-full bg-ink px-2.5 text-[15px] font-semibold text-bg"
                      aria-label={`${n} não lidas`}
                    >
                      <Rolling value={n} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </header>

              {/* contador da dor */}
              <AnimatePresence>
                {(phase === 'ghosting' || phase === 'question') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto', transition: { duration: 0.4, ease: EASE_OUT_EXPO } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                    className="mx-4 mb-2 overflow-hidden rounded-2xl border border-leak/30 bg-leak/10"
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2 px-4 py-3 text-[15px] font-semibold text-leak" aria-live="polite">
                      <span className="font-mono text-[20px] tabular"><Rolling value={ghosted.length} /> DE {TOTAL}</span>
                      <span>{C.ghostCounter(ghosted.length, TOTAL)[1]}</span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {/* placar do depois */}
                <AnimatePresence>
                  {phase === 'done' && niche && (
                    <Score readyBefore={readyBefore} readyAfter={readyAfter} total={TOTAL} />
                  )}
                </AnimatePresence>

                {showList && (
                  <ul aria-live="polite">
                    <AnimatePresence initial={false}>
                      {rows.map((i, pos) => (
                        <ConversationRow
                          key={`b-${i}`}
                          p={people[i]}
                          idx={i}
                          index={pos}
                          pulsing={phase === 'prompt' && i === TOP}
                          ghost={ghosted.includes(i)}
                          onTap={i === TOP ? openChat : undefined}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                {isAfter && niche && (
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    <AnimatePresence initial={false}>
                      {cards.map((i) => (
                        <TriageCard
                          key={`c-${i}`}
                          p={people[i]}
                          idx={i}
                          extraLabel={niche.extraLabel}
                          onOpen={phase === 'done' && people[i].ready ? () => setOpenCard(i) : undefined}
                        />
                      ))}
                    </AnimatePresence>
                    {phase === 'done' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.4 } }} className="space-y-2 pt-1">
                        <p className="text-[15px] leading-snug text-ink">{C.footer}</p>
                        <p className="text-[15px] leading-snug text-ink-muted">{C.openHint}</p>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* "Isso te parece familiar?" */}
                <AnimatePresence>
                  {phase === 'question' && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#0B0C0F]/55 via-[#0B0C0F]/95 to-[#0B0C0F]/95 px-8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.6 } }}
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    >
                      <motion.p
                        initial={{ y: 14, opacity: 0 }}
                        animate={{ y: 0, opacity: 1, transition: { duration: 0.8, delay: 0.15, ease: EASE_OUT_EXPO } }}
                        className="text-center font-serif text-[44px] italic leading-[1.05] text-ink"
                      >
                        {C.question}
                      </motion.p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* rodapé de ação */}
              <div className="pb-safe px-4 pb-4 pt-2">
                <AnimatePresence mode="wait">
                  {phase === 'prompt' && (
                    <motion.p
                      key="reply"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_EXPO } }}
                      exit={{ opacity: 0 }}
                      className="flex h-14 items-center justify-center gap-2 text-[20px] font-semibold text-ink"
                    >
                      <ArrowUp className="h-5 w-5" aria-hidden="true" />
                      {C.replyOne}
                    </motion.p>
                  )}
                  {showCta && phase === 'question' && (
                    <motion.button
                      key="cta"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); turnOn() }}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT_EXPO } }}
                      exit={{ opacity: 0, y: 16, transition: { duration: 0.18 } }}
                      whileTap={{ scale: 0.97 }}
                      className="relative w-full rounded-2xl bg-signal px-5 py-3.5 text-left text-bg"
                    >
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-2xl ring-2 ring-signal"
                        animate={{ opacity: [0.35, 0], scale: [1, 1.05] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                      />
                      <span className="block text-[17px] font-semibold leading-tight">{C.cta}</span>
                      <span className="mt-0.5 block text-[15px] leading-snug text-bg/75">{C.ctaSub}</span>
                    </motion.button>
                  )}
                  {phase === 'done' && (
                    <motion.button
                      key="proof"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setProof(true) }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.8, duration: 0.42, ease: EASE_OUT_EXPO } }}
                      whileTap={{ scale: 0.97 }}
                      className="h-14 w-full rounded-2xl bg-signal text-[17px] font-semibold text-bg"
                    >
                      {C.proofCta}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* "Mesmo anúncio. Outra conversa." — sozinha na tela */}
              <AnimatePresence>
                {phase === 'phrase' && (
                  <motion.div
                    className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0C0F]/95 px-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.5 } }}
                    exit={{ opacity: 0, transition: { duration: 0.35 } }}
                  >
                    <motion.p
                      initial={{ y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1, transition: { duration: 0.8, delay: 0.1, ease: EASE_OUT_EXPO } }}
                      className="text-center font-serif text-[44px] italic leading-[1.05] text-ink"
                    >
                      {C.phrase}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* chat da dor */}
              <AnimatePresence>
                {phase === 'chat' && niche && (
                  <ChatPain
                    p={people[TOP]}
                    idx={TOP}
                    price={fmt(niche.priceExample)}
                    step={chatStep}
                    onSend={send}
                    onFastForward={chatStep !== 'compose' && chatStep !== 'sent' ? closeChat : undefined}
                  />
                )}
              </AnimatePresence>

              {/* card aberto: a mensagem que chega */}
              <AnimatePresence>
                {openCard !== null && niche && (
                  <ChatTriage p={people[openCard]} idx={openCard} extraLabel={niche.extraLabel} onBack={() => setOpenCard(null)} />
                )}
              </AnimatePresence>

              {/* placeholder da prova */}
              <AnimatePresence>
                {proof && <ProofPlaceholder onBack={() => setProof(false)} />}
              </AnimatePresence>
            </>
          )}
        </div>
      </main>
    </MotionConfig>
  )
}

/* ------------------------------------------------------------------ */

function NichePicker({ onPick }: { onPick: (s: SegmentId) => void }) {
  return (
    <motion.section
      className="pt-safe flex flex-1 flex-col justify-center px-5 pb-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5 } }}
    >
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

function Avatar({ name, idx, size, dim = false }: { name: string; idx: number; size: number; dim?: boolean }) {
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

function ConversationRow({ p, idx, index, pulsing, ghost, onTap }: {
  p: InboxPerson; idx: number; index: number; pulsing: boolean; ghost: boolean; onTap?: () => void
}) {
  return (
    <motion.li layout="position" custom={index} variants={rowVariants} initial="initial" animate="enter" exit="exit" className="relative">
      <motion.div
        role={onTap ? 'button' : undefined}
        tabIndex={onTap ? 0 : undefined}
        onClick={onTap ? (e) => { e.stopPropagation(); onTap() } : undefined}
        onKeyDown={onTap ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap() } } : undefined}
        className="relative flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left"
        animate={ghost ? { backgroundColor: 'rgba(14,16,19,0.6)' } : { backgroundColor: 'rgba(14,16,19,0)' }}
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

function TriageCard({ p, idx, extraLabel, onOpen }: { p: InboxPerson; idx: number; extraLabel: string; onOpen?: () => void }) {
  return (
    <motion.button
      type="button"
      layout="position"
      disabled={!onOpen}
      onClick={(e) => { e.stopPropagation(); onOpen?.() }}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      whileTap={onOpen ? { scale: 0.985 } : undefined}
      className={`w-full rounded-2xl border bg-bg-raised p-4 text-left ${p.ready ? 'border-line' : 'border-line/60'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.name} idx={idx} size={40} />
          <span className="text-[16px] font-semibold leading-tight text-ink">{p.name}</span>
        </div>
        <span
          className={`ml-auto inline-flex h-7 items-center whitespace-nowrap rounded-full px-2.5 text-[15px] font-semibold ${
            p.ready ? 'bg-signal/15 text-signal' : 'border border-line text-ink-muted'
          }`}
        >
          {p.ready ? C.readyTag : C.researchingTag}
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-[15px] leading-snug">
        <Field label={C.fieldQuer} value={p.quer} />
        <Field label={C.fieldQuando} value={p.quando} />
        <Field label={extraLabel} value={p.extra} />
      </dl>
    </motion.button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      <dt className="text-ink-muted">{label}:</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}

function Score({ readyBefore, readyAfter, total }: { readyBefore: number; readyAfter: number; total: number }) {
  const pct = Math.round(CASE_REF.qualifiedReplyRate * 100)
  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-line bg-bg-raised"
    >
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.scoreReady}</span>
          <ScoreNums from={readyBefore} to={readyAfter} delay={500} />
        </div>
        <p className="mt-1 text-[15px] leading-snug text-ink-muted">{C.scoreReadySub(pct)}</p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line px-4 py-3">
        <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.scoreIdentified}</span>
        <ScoreNums from={0} to={total} delay={900} />
      </div>
    </motion.section>
  )
}

/** "antes → depois": o depois conta como odômetro a partir do antes. */
function ScoreNums({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [v, setV] = useState(from)
  useEffect(() => {
    let cur = from
    let id = window.setTimeout(function step() {
      cur += 1
      setV(cur)
      if (cur < to) id = window.setTimeout(step, 140)
    }, delay)
    return () => clearTimeout(id)
  }, [from, to, delay])
  return (
    <span className="ml-auto flex items-baseline gap-2 font-mono text-[22px] font-medium tabular">
      <span className="text-ink-muted">{from}</span>
      <span className="text-ink-muted">→</span>
      <span className="text-signal"><Rolling value={v} /></span>
    </span>
  )
}

/* ---------------- chats ---------------- */

function ChatShell({ children, header, onClick }: { children: React.ReactNode; header: React.ReactNode; onClick?: () => void }) {
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

function ChatPain({ p, idx, price, step, onSend, onFastForward }: {
  p: InboxPerson; idx: number; price: string; step: ChatStep; onSend: () => void; onFastForward?: () => void
}) {
  const sent = step !== 'compose'
  const seen = step === 'seen' || step === 'typing' || step === 'silence'
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
              {step === 'typing' ? (
                <motion.p key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[15px] text-ink-muted">{C.typing}</motion.p>
              ) : (
                <motion.p key="o" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[15px] text-ink-muted">online</motion.p>
              )}
            </AnimatePresence>
          </div>
        </>
      }
    >
      <LayoutGroup>
        <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 py-5">
          <Bubble side="in" time={time(idx)}>{p.msg}</Bubble>
          {sent && (
            <motion.div layoutId="reply" transition={{ duration: 0.5, ease: EASE_OUT_EXPO }} className="self-end max-w-[80%]">
              <div className="rounded-2xl rounded-br-md bg-[#2A2F37] px-3.5 py-2.5 text-[16px] leading-snug text-ink">{C.reply(price)}</div>
            </motion.div>
          )}
          <AnimatePresence>
            {seen && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.4 } }}
                className="flex items-center gap-1.5 self-end text-[15px] text-ink-muted"
              >
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
                  <motion.span
                    key={d}
                    className="h-2 w-2 rounded-full bg-ink-muted"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="pb-safe border-t border-line px-3 pb-4 pt-3">
          {!sent ? (
            <div className="flex items-end gap-2">
              <motion.div layoutId="reply" transition={{ duration: 0.5, ease: EASE_OUT_EXPO }} className="min-w-0 flex-1 rounded-2xl border border-line bg-bg-raised px-3.5 py-2.5">
                <div className="text-[16px] leading-snug text-ink">{C.reply(price)}</div>
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

function ChatTriage({ p, idx, extraLabel, onBack }: { p: InboxPerson; idx: number; extraLabel: string; onBack: () => void }) {
  return (
    <ChatShell
      header={
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onBack() }} className="flex h-11 items-center gap-0.5 pr-1 text-[15px] text-ink" aria-label={C.back}>
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <Avatar name={p.name} idx={idx} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-ink">{p.name}</p>
          </div>
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

function Bubble({ side, time: t, children }: { side: 'in' | 'out'; time: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.3 } }}
      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[16px] leading-snug text-ink ${side === 'in' ? 'self-start rounded-bl-md bg-bg-raised' : 'self-end rounded-br-md bg-[#2A2F37]'}`}
    >
      {children}
      <span className="ml-2 align-bottom text-[15px] text-ink-muted">{t}</span>
    </motion.div>
  )
}

function ProofPlaceholder({ onBack }: { onBack: () => void }) {
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

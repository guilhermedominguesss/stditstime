import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { ArrowUp, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INBOX_BANK, LEADS_SHORTCUTS, TICKET_MIDPOINTS, type InboxNiche, type SegmentId, type TicketId } from '../funil/config'
import { INBOX as C } from '../funil/copy'
import { diagnose, fmt, type Diagnosis } from '../funil/math'
import { EASE_OUT_EXPO } from '../funil/tokens'
import { Rolling } from '../funil/ui/Rolling'
import {
  ChatPain, ChatTriage, ConversationRow, CountUp, NichePicker, ProofPlaceholder, TOP, TOTAL,
  TriageCardV2, rowVariants, seenFor, vibrate, type PainStep,
} from '../inbox/parts'

/**
 * /lab5 — Caixa de Entrada Viva v4.
 * Separa SIMULAÇÃO (8 pessoas ilustrativas, mini placar "{n} DE 8 PRONTAS PRA AGENDAR")
 * de REALIDADE (bloco "Na sua caixa real, por mês:", com os números do math.ts e o ticket
 * que a pessoa escolheu). A pergunta "de cada 10" usa conversas anônimas.
 * O STD não barra ninguém: as 8 chegam, identificadas. Toque na tela pula a animação.
 */

type Phase =
  | 'niche' | 'arriving' | 'prompt' | 'chat' | 'ghosting' | 'dim' | 'question'
  | 'askVanish' | 'askQuick' | 'rewind' | 'phrase' | 'cards' | 'done'

const T = {
  firstArrive: 300,
  arriveEvery: 450,
  promptDelay: 600,
  seen: 700,
  typingAt: 1900,
  typingEnd: 2900,
  /** "visto por último" 2,5s depois de "Visualizada" */
  goneAt: 700 + 2500,
  closeAt: 4900,
  firstGhostHold: 900,
  ghostEvery: 300,
  dimDelay: 700,
  dim: 300,
  questionHold: 1900,
  rewindStagger: 55,
  phraseHold: 1900,
  firstCard: 250,
  cardEvery: 480,
  /** depois do último card: o mini placar encolhe e entra o bloco da caixa real */
  doneDelay: 700,
} as const

const VARIANTS = rowVariants(T.rewindStagger)

export default function Lab5() {
  const [segment, setSegment] = useState<SegmentId | null>(null)
  const [phase, setPhase] = useState<Phase>('niche')
  const [n, setN] = useState(0)
  const [ghosted, setGhosted] = useState<number[]>([])
  const [step, setStep] = useState<PainStep>('compose')
  const [vanish, setVanish] = useState<number[]>([])
  const [a10, setA10] = useState<number | null>(null)
  const [leads, setLeads] = useState<number | null>(null)
  const [ticket, setTicket] = useState<TicketId | null>(null)
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

  const ghostOrder = useMemo(() => {
    const rest: number[] = []
    for (let i = TOP - 1; i >= 0; i--) if (!people[i]?.readyBefore) rest.push(i)
    return [TOP, ...rest]
  }, [people])

  const cardOrder = useMemo(() => {
    const idx = people.map((_, i) => i)
    return [...idx.filter((i) => people[i].ready), ...idx.filter((i) => !people[i].ready)]
  }, [people])

  /** números da caixa REAL: A da pergunta "de cada 10", leads e o ticket ESCOLHIDO */
  const diag: Diagnosis | null = useMemo(
    () => (leads != null && a10 != null && ticket ? diagnose(leads, a10, TICKET_MIDPOINTS[ticket]) : null),
    [leads, a10, ticket],
  )

  /* ---------------- fluxo ---------------- */

  const start = (s: SegmentId) => {
    vibrate(8)
    setSegment(s)
    setN(0)
    setGhosted([])
    setVanish([])
    setA10(null)
    setLeads(null)
    setTicket(null)
    setK(0)
    setOpenCard(null)
    setPhase('arriving')
  }

  useEffect(() => {
    if (phase !== 'arriving') return
    if (n >= TOTAL) { later(() => setPhase('prompt'), T.promptDelay); return }
    const id = window.setTimeout(() => setN((x) => x + 1), n === 0 ? T.firstArrive : T.arriveEvery)
    return () => clearTimeout(id)
  }, [phase, n, later])

  const openChat = () => {
    if (phase !== 'prompt') return
    vibrate(8)
    setStep('compose')
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
    setStep('sent')
    later(() => setStep('seen'), T.seen, chatTimers)
    later(() => setStep('typing'), T.typingAt, chatTimers)
    later(() => setStep('idle'), T.typingEnd, chatTimers)
    later(() => setStep('gone'), T.goneAt, chatTimers)
    later(closeChat, T.closeAt, chatTimers)
  }

  useEffect(() => {
    if (phase !== 'ghosting') return
    if (ghosted.length >= ghostOrder.length) { later(() => setPhase('dim'), T.dimDelay); return }
    const id = window.setTimeout(() => {
      setGhosted((g) => [...g, ghostOrder[g.length]])
      vibrate(6)
    }, ghosted.length === 1 ? T.firstGhostHold : T.ghostEvery)
    return () => clearTimeout(id)
  }, [phase, ghosted, ghostOrder, later])

  useEffect(() => {
    if (phase === 'dim') later(() => setPhase('question'), T.dim)
    if (phase === 'question') later(() => setPhase('askVanish'), T.questionHold)
    if (phase === 'phrase') later(() => { setK(0); setPhase('cards') }, T.phraseHold)
  }, [phase, later])

  const confirmVanish = () => {
    vibrate(8)
    setA10(10 - vanish.length)
    setPhase('askQuick')
  }

  const turnOn = () => {
    vibrate(24)
    setPhase('rewind')
    later(() => setPhase('phrase'), TOTAL * T.rewindStagger + 450)
  }

  useEffect(() => {
    if (phase !== 'cards') return
    if (k >= TOTAL) { later(() => setPhase('done'), T.doneDelay); return }
    const id = window.setTimeout(() => setK((x) => x + 1), k === 0 ? T.firstCard : T.cardEvery)
    return () => clearTimeout(id)
  }, [phase, k, later])

  // acompanha o card que chega; no fim, as "ainda pesquisando" ficam visíveis
  useEffect(() => {
    const el = listRef.current
    if (!el || (phase !== 'cards' && phase !== 'done')) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const id = window.setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }), phase === 'done' ? 450 : 0)
    return () => clearTimeout(id)
  }, [phase, k])

  const skip = () => {
    if (phase === 'arriving') setN(TOTAL)
    else if (phase === 'ghosting') setGhosted(ghostOrder)
    else if (phase === 'cards') setK(TOTAL)
  }

  /* ---------------- render ---------------- */

  const isBefore = ['arriving', 'prompt', 'chat', 'ghosting', 'dim', 'question', 'askVanish', 'askQuick'].includes(phase)
  const showList = isBefore || phase === 'rewind'
  const isAfter = phase === 'cards' || phase === 'done'
  const rows = isBefore ? Array.from({ length: n }, (_, i) => n - 1 - i) : []
  const cards = isAfter ? cardOrder.slice(0, k) : []
  const readyArrived = cards.filter((i) => people[i].ready).length
  const showBanner = ['ghosting', 'dim', 'question'].includes(phase)
  const dimmed = phase === 'dim' || phase === 'question'

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex h-dvh-safe w-full items-center justify-center bg-bg md:p-6">
        <div
          className="relative flex h-full w-full flex-col overflow-hidden bg-[#0B0C0F] md:h-[min(844px,calc(100dvh-48px))] md:w-[390px] md:rounded-[44px] md:border-[10px] md:border-[#1C1F24]"
          onClick={skip}
        >
          {phase === 'niche' || !niche ? (
            <NichePicker onPick={start} />
          ) : (
            <>
              {!isAfter && (
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
              )}

              {/* a dor, em número e em dinheiro (ticket médio do nicho: é simulação) */}
              <AnimatePresence>
                {showBanner && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto', transition: { duration: 0.4, ease: EASE_OUT_EXPO } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                    className="relative z-10 mx-4 mb-2 overflow-hidden rounded-2xl border border-leak/30 bg-leak/10"
                  >
                    <div className="px-4 py-3 text-leak" aria-live="polite">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold">
                        <span className="font-mono text-[20px] tabular"><Rolling value={ghosted.length} /> DE {TOTAL}</span>
                        <span>{C.ghostCounter}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[15px]">
                        {C.ghostMoney[0]} <CountUp value={ghosted.length * niche.ticketMedio} /> {C.ghostMoney[1]}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* mini placar da simulação: conta a cada card; depois encolhe para 40px */}
              {isAfter && <MiniScore ready={readyArrived} compact={phase === 'done'} />}

              <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {showList && (
                  <ul aria-live="polite">
                    <AnimatePresence initial={false}>
                      {rows.map((i, pos) => (
                        <ConversationRow
                          key={`b-${i}`}
                          p={people[i]}
                          idx={i}
                          index={pos}
                          variants={VARIANTS}
                          pulsing={phase === 'prompt' && i === TOP}
                          ghost={ghosted.includes(i)}
                          onTap={i === TOP ? openChat : undefined}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}

                {isAfter && (
                  <div className="flex flex-col gap-2 px-4 pb-3 pt-2">
                    <AnimatePresence initial={false}>
                      {cards.map((i) => (
                        <TriageCardV2
                          key={`c-${i}`}
                          p={people[i]}
                          idx={i}
                          extraLabel={niche.extraLabel}
                          seenBefore={seenFor(niche.seenBefore, i)}
                          onOpen={phase === 'done' && people[i].ready ? () => setOpenCard(i) : undefined}
                        />
                      ))}
                    </AnimatePresence>
                    {phase === 'done' && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }} className="pt-1 text-[15px] leading-snug text-ink">
                        {C.footer}
                      </motion.p>
                    )}
                  </div>
                )}

                <AnimatePresence>
                  {dimmed && (
                    <motion.div
                      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0B0C0F]/90 px-8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: T.dim / 1000 } }}
                      exit={{ opacity: 0, transition: { duration: 0.25 } }}
                    >
                      {phase === 'question' && (
                        <motion.p
                          initial={{ y: 14, opacity: 0 }}
                          animate={{ y: 0, opacity: 1, transition: { duration: 0.8, ease: EASE_OUT_EXPO } }}
                          className="text-center font-serif text-[44px] italic leading-[1.05] text-ink"
                        >
                          {C.question}
                        </motion.p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* a caixa REAL: bloco separado, só depois do último card */}
              <AnimatePresence>
                {phase === 'done' && diag && <RealBox diag={diag} />}
              </AnimatePresence>

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
                  {phase === 'done' && (
                    <motion.button
                      key="proof"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setProof(true) }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 1.1, duration: 0.42, ease: EASE_OUT_EXPO } }}
                      whileTap={{ scale: 0.97 }}
                      className="h-14 w-full rounded-2xl bg-signal text-[17px] font-semibold text-bg"
                    >
                      {C.proofCta}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {phase === 'askVanish' && (
                  <AskVanish
                    selected={vanish}
                    onToggle={(i) => { vibrate(6); setVanish((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i])) }}
                    onContinue={confirmVanish}
                  />
                )}
                {phase === 'askQuick' && (
                  <AskQuick leads={leads} ticket={ticket} onLeads={setLeads} onTicket={setTicket} onGo={turnOn} />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {phase === 'phrase' && (
                  <motion.div
                    className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0C0F] px-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.4 } }}
                    exit={{ opacity: 0, transition: { duration: 0.35 } }}
                    onClick={(e) => { e.stopPropagation(); setK(0); setPhase('cards') }}
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

              <AnimatePresence>
                {phase === 'chat' && (
                  <ChatPain
                    p={people[TOP]}
                    idx={TOP}
                    reply={niche.reply}
                    step={step}
                    onSend={send}
                    onFastForward={step === 'gone' || step === 'idle' ? closeChat : undefined}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {openCard !== null && (
                  <ChatTriage
                    p={people[openCard]}
                    idx={openCard}
                    extraLabel={niche.extraLabel}
                    seenBefore={seenFor(niche.seenBefore, openCard)}
                    onBack={() => setOpenCard(null)}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>{proof && <ProofPlaceholder onBack={() => setProof(false)} />}</AnimatePresence>
            </>
          )}
        </div>
      </main>
    </MotionConfig>
  )
}

/* ------------------------------------------------------------------ */

/** "{n} DE 8 PRONTAS PRA AGENDAR": grande enquanto conta; depois, barra fina de 40px. */
function MiniScore({ ready, compact }: { ready: number; compact: boolean }) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
      className={`relative z-10 flex items-center gap-2 overflow-hidden text-signal ${
        compact ? 'h-10 border-b border-line bg-bg-raised px-4' : 'mx-4 mb-1 rounded-2xl border border-line bg-bg-raised px-4 py-3'
      }`}
      style={{ marginTop: compact ? 0 : 'max(12px, env(safe-area-inset-top))', paddingTop: compact ? 'env(safe-area-inset-top)' : undefined }}
      aria-live="polite"
    >
      <motion.span layout="position" className={`font-mono tabular font-medium ${compact ? 'text-[17px]' : 'text-[30px]'}`}>
        <Rolling value={ready} /> <span className="text-ink-muted">DE {TOTAL}</span>
      </motion.span>
      <motion.span layout="position" className="text-[15px] font-semibold tracking-[0.02em]">{C.miniReady}</motion.span>
    </motion.div>
  )
}

/** A caixa REAL da pessoa: math.ts com A, leads e o ticket escolhido. */
function RealBox({ diag }: { diag: Diagnosis }) {
  const hoje = Math.round(diag.conversasHoje)
  const proj = Math.round(diag.conversasProj)
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.35, ease: EASE_OUT_EXPO } }}
      className="mx-4 mt-1 rounded-2xl border border-signal/30 bg-bg-raised px-4 py-3"
      aria-live="polite"
    >
      <h2 className="text-[16px] font-semibold text-ink">{C.realTitle}</h2>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.realConv}</span>
        <span className="ml-auto flex items-baseline gap-2 font-mono text-[20px] font-medium">
          <span className="tabular text-ink-muted">{fmt(hoje)}</span>
          <span className="text-ink-muted">→</span>
          <span className="text-signal"><CountUp value={proj} ms={900} /></span>
          <span className="text-[15px] text-ink-muted">{C.perMonth}</span>
        </span>
      </div>
      {diag.honest ? (
        <>
          <p className="mt-1.5 text-[15px] font-semibold tracking-[0.02em] text-signal">{C.realHonest}</p>
          <p className="mt-1 text-[15px] leading-snug text-ink-muted">{C.realHonestSub}</p>
        </>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.realRevenue}</span>
            <span className="ml-auto font-mono text-[20px] font-medium text-signal">
              + R$ <CountUp value={diag.receitaExtra} ms={1100} />
              <span className="text-[15px] text-ink-muted">{C.perMonth}</span>
            </span>
          </div>
          <p className="mt-1 text-[15px] leading-snug text-ink-muted">{C.realSub}</p>
        </>
      )}
    </motion.section>
  )
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col px-4"
      style={{ background: 'rgba(11,12,15,0.97)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: 'max(24px, env(safe-area-inset-top))' }}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/** "De cada 10, quantas somem assim?" — 10 conversas ANÔNIMAS (a caixa real, não a simulação). */
function AskVanish({ selected, onToggle, onContinue }: { selected: number[]; onToggle: (i: number) => void; onContinue: () => void }) {
  const [gone, stay] = C.askVanishCount(selected.length)
  return (
    <Sheet>
      <h2 className="text-[22px] font-semibold leading-tight text-ink">{C.askVanish}</h2>
      <p className="mt-1.5 text-[15px] text-ink-muted">{C.askVanishHint}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {Array.from({ length: 10 }, (_, i) => {
          const on = selected.includes(i)
          return (
            <motion.button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(i)}
              whileTap={{ scale: 0.96 }}
              className={`flex h-14 items-center gap-2.5 rounded-2xl border px-3 text-left transition-colors ${on ? 'border-leak/40 bg-leak/10' : 'border-line bg-bg-raised'}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1C1F24] ${on ? 'opacity-50' : ''}`} aria-hidden="true">
                <User className="h-4 w-4 text-ink-muted" strokeWidth={2} />
              </span>
              <span className={`min-w-0 flex-1 truncate text-[15px] font-medium ${on ? 'text-ink-muted line-through' : 'text-ink'}`}>{C.anonConversation(i + 1)}</span>
              {on && <span className="shrink-0 text-[15px] font-semibold text-leak">{C.askVanishTag}</span>}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-4 text-[15px] font-semibold" aria-live="polite">
        <span className="text-leak">{gone}</span>
        <span className="text-ink-muted"> · </span>
        <span className="text-ink">{stay}</span>
      </p>
      <div className="pb-safe mt-auto pb-4 pt-3">
        <motion.button type="button" onClick={onContinue} whileTap={{ scale: 0.97 }} className="h-14 w-full rounded-2xl bg-ink text-[17px] font-semibold text-bg">
          {C.askContinue}
        </motion.button>
      </div>
    </Sheet>
  )
}

function AskQuick({ leads, ticket, onLeads, onTicket, onGo }: {
  leads: number | null; ticket: TicketId | null; onLeads: (n: number) => void; onTicket: (t: TicketId) => void; onGo: () => void
}) {
  const ready = leads != null && ticket != null
  return (
    <Sheet>
      <h2 className="text-[22px] font-semibold leading-tight text-ink">{C.askLeads}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {LEADS_SHORTCUTS.map((v) => (
          <Chip key={v} on={leads === v} onClick={() => { vibrate(6); onLeads(v) }}>{C.leadsChip(v)}</Chip>
        ))}
      </div>
      <h2 className="mt-7 text-[22px] font-semibold leading-tight text-ink">{C.askTicket}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(TICKET_MIDPOINTS) as TicketId[]).map((t) => (
          <Chip key={t} on={ticket === t} onClick={() => { vibrate(6); onTicket(t) }}>{C.ticketChip[t]}</Chip>
        ))}
      </div>
      <div className="pb-safe mt-auto pb-4 pt-3">
        <AnimatePresence>
          {ready && (
            <motion.button
              type="button"
              onClick={onGo}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT_EXPO } }}
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
        </AnimatePresence>
      </div>
    </Sheet>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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

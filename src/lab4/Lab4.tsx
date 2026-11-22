import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CASE_REF, INBOX_BANK, INBOX_EXTRA_NAMES, LEADS_SHORTCUTS, TICKET_MIDPOINTS,
  type InboxNiche, type SegmentId, type TicketId,
} from '../funil/config'
import { INBOX as C } from '../funil/copy'
import { diagnose, fmt, type Diagnosis } from '../funil/math'
import { EASE_OUT_EXPO } from '../funil/tokens'
import { Rolling } from '../funil/ui/Rolling'
import {
  Avatar, ChatPain, ChatTriage, ConversationRow, CountUp, NichePicker, ProofPlaceholder, TOP, TOTAL,
  TriageCard, firstName, rowVariants, seenFor, vibrate, type PainStep,
} from '../inbox/parts'

/**
 * /lab4 — Caixa de Entrada Viva v3 (base do app).
 *  nicho → a caixa enche → a dor ensinada com 1 (visualizou e sumiu) → mais 5 somem
 *  (com o dinheiro perdido) → "Isso te parece familiar?" → perguntas DENTRO da metáfora
 *  (de cada 10, quantas somem · leads/mês · ticket) → o mesmo anúncio com filtro:
 *  rebobina → "Mesmo anúncio. Outra conversa." → cards chegam e o placar (math.ts) sobe junto.
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
  doneDelay: 600,
} as const

const VARIANTS = rowVariants(T.rewindStagger)

export default function Lab4() {
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

  /** as 10 da pergunta "de cada 10": as 8 do nicho + 2 nomes extras */
  const ten = useMemo(() => [...people.map((p) => p.name), ...INBOX_EXTRA_NAMES], [people])

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
    if (ghosted.length >= ghostOrder.length) {
      later(() => setPhase('dim'), T.dimDelay)
      return
    }
    const id = window.setTimeout(() => {
      setGhosted((g) => [...g, ghostOrder[g.length]])
      vibrate(6)
    }, ghosted.length === 1 ? T.firstGhostHold : T.ghostEvery)
    return () => clearTimeout(id)
  }, [phase, ghosted, ghostOrder, later])

  // a lista escurece e SÓ DEPOIS entra a pergunta
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
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }))
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
              {/* no depois, o placar vira o cabeçalho (mais cards por tela) */}
              <header
                className={`flex items-center justify-between px-5 pb-3 ${isAfter ? 'hidden' : ''}`}
                style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}
              >
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

              {/* a dor, em número e em dinheiro */}
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

              {/* placar do depois: sobe junto com cada card que chega */}
              <AnimatePresence>
                {isAfter && diag && segment && <Score diag={diag} leads={leads ?? 0} arrived={k} segment={segment} />}
              </AnimatePresence>

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
                  <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
                    <AnimatePresence initial={false}>
                      {cards.map((i) => (
                        <TriageCard
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
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }} className="space-y-1 pt-1 text-[15px] leading-snug">
                        <p className="text-ink">{C.footer}</p>
                        <p className="text-ink-muted">{C.scorePerMonth}</p>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* escurece (300ms) e só depois entra a frase */}
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
                  {phase === 'done' && (
                    <motion.button
                      key="proof"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setProof(true) }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.42, ease: EASE_OUT_EXPO } }}
                      whileTap={{ scale: 0.97 }}
                      className="h-14 w-full rounded-2xl bg-signal text-[17px] font-semibold text-bg"
                    >
                      {C.proofCta}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* perguntas dentro da metáfora */}
              <AnimatePresence>
                {phase === 'askVanish' && (
                  <AskVanish
                    names={ten}
                    selected={vanish}
                    onToggle={(i) => { vibrate(6); setVanish((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i])) }}
                    onContinue={confirmVanish}
                  />
                )}
                {phase === 'askQuick' && (
                  <AskQuick leads={leads} ticket={ticket} onLeads={setLeads} onTicket={setTicket} onGo={turnOn} />
                )}
              </AnimatePresence>

              {/* "Mesmo anúncio. Outra conversa." — sozinha na tela */}
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

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col px-4"
      style={{ background: "rgba(11,12,15,0.97)" }}
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

function AskVanish({ names, selected, onToggle, onContinue }: {
  names: readonly string[]; selected: number[]; onToggle: (i: number) => void; onContinue: () => void
}) {
  const [gone, stay] = C.askVanishCount(selected.length)
  return (
    <Sheet>
      <h2 className="text-[22px] font-semibold leading-tight text-ink">{C.askVanish}</h2>
      <p className="mt-1.5 text-[15px] text-ink-muted">{C.askVanishHint}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {names.map((name, i) => {
          const on = selected.includes(i)
          return (
            <motion.button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(i)}
              whileTap={{ scale: 0.96 }}
              className={`flex h-14 items-center gap-2.5 rounded-2xl border px-3 text-left transition-colors ${on ? 'border-leak/40 bg-leak/10' : 'border-line bg-bg-raised'}`}
            >
              <Avatar name={name} idx={i} size={32} dim={on} />
              <span className={`min-w-0 flex-1 truncate text-[15px] font-medium ${on ? 'text-ink-muted line-through' : 'text-ink'}`}>{firstName(name)}</span>
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
      <div className="mt-auto pb-safe pb-4 pt-3">
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
      <div className="mt-auto pb-safe pb-4 pt-3">
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

/** Placar: projeção conservadora do math.ts; sobe proporcionalmente aos cards que chegam. */
function Score({ diag, leads, arrived, segment }: { diag: Diagnosis; leads: number; arrived: number; segment: SegmentId }) {
  const k = arrived / TOTAL
  const hoje = Math.round(diag.conversasHoje)
  const proj = Math.round(diag.conversasProj)
  const prontas = hoje + (proj - hoje) * k
  const ident = leads * k
  const pct = Math.round(CASE_REF.qualifiedReplyRate * 100)
  const nicheNote = segment === 'estetica' ? null : CASE_REF.niche.toLowerCase()
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
      className="mx-4 mb-2 rounded-2xl border border-line bg-bg-raised px-4 py-2.5"
      style={{ marginTop: 'max(12px, env(safe-area-inset-top))' }}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.scoreReady}</span>
        <Nums from={hoje} value={prontas} />
      </div>
      <p className="text-[15px] leading-snug text-ink-muted">{diag.honest ? C.scoreHonest : C.scoreReadySub(pct, nicheNote)}</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-2">
        <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.scoreIdentified}</span>
        <Nums from={0} value={ident} />
      </div>
    </motion.section>
  )
}

function Nums({ from, value }: { from: number; value: number }) {
  return (
    <span className="ml-auto flex items-baseline gap-2 font-mono text-[20px] font-medium">
      <span className="tabular text-ink-muted">{fmt(from)}</span>
      <span className="text-ink-muted">→</span>
      <span className="text-signal"><CountUp value={value} ms={420} /></span>
    </span>
  )
}

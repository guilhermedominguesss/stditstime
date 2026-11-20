import { AnimatePresence, LayoutGroup, MotionConfig, motion, type Variants } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EASE_OUT_EXPO } from '../funil/tokens'
import { INBOX_COPY as C, INBOX_TIMING as TM, PEOPLE, READY_BEFORE, initials, type Person } from './inbox'

/**
 * /lab2 — protótipo "Caixa de Entrada Viva".
 * Momento 1: a caixa de entrada de hoje (curiosos perguntando preço).
 * Momento 2: liga o STD → as mesmas pessoas chegam de novo, já triadas.
 * Toque na tela pula a animação em curso (nunca prende ninguém).
 */

type Phase = 'off' | 'arriving' | 'question' | 'rewind' | 'rearriving' | 'done'

const NURTURE = PEOPLE.filter((p) => p.after === null).map((p) => p.id)

const rowVariants: Variants = {
  initial: { opacity: 0, y: -28, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT_EXPO } },
  // rebobinar: sai para cima, em sequência rápida (de cima para baixo)
  exit: (i: number) => ({ opacity: 0, y: -70, transition: { duration: 0.24, delay: i * (TM.rewindStagger / 1000), ease: [0.4, 0, 1, 1] } }),
  toFolder: { opacity: 0, transition: { duration: 0.2 } },
}

function vibrate(ms: number) {
  try { navigator.vibrate?.(ms) } catch { /* iOS: silencioso */ }
}

export default function Lab2() {
  const [run, setRun] = useState(0)
  const [phase, setPhase] = useState<Phase>('off')
  const [nBefore, setNBefore] = useState(0)
  const [kAfter, setKAfter] = useState(0)
  const [inFolder, setInFolder] = useState<string[]>([])
  const [showCta, setShowCta] = useState(false)
  const timers = useRef<number[]>([])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  // (re)começo
  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('off')
    setNBefore(0)
    setKAfter(0)
    setInFolder([])
    setShowCta(false)
    later(() => setPhase('arriving'), TM.powerOn)
    return () => timers.current.forEach(clearTimeout)
  }, [run, later])

  // momento 1: as conversas chegam uma a uma
  useEffect(() => {
    if (phase !== 'arriving') return
    if (nBefore >= PEOPLE.length) {
      later(() => setPhase('question'), TM.questionDelay)
      return
    }
    const id = window.setTimeout(() => setNBefore((n) => n + 1), nBefore === 0 ? 200 : TM.arriveEvery)
    return () => clearTimeout(id)
  }, [phase, nBefore, later])

  useEffect(() => {
    if (phase === 'question') later(() => setShowCta(true), TM.ctaDelay)
  }, [phase, later])

  // momento 2: as mesmas pessoas chegam de novo, triadas
  useEffect(() => {
    if (phase !== 'rearriving') return
    if (kAfter >= PEOPLE.length) {
      later(() => setPhase('done'), TM.toFolderAfter + 700)
      return
    }
    const id = window.setTimeout(() => {
      const p = PEOPLE[kAfter]
      setKAfter((k) => k + 1)
      if (p.after === null) later(() => setInFolder((f) => (f.includes(p.id) ? f : [...f, p.id])), TM.toFolderAfter)
    }, kAfter === 0 ? 150 : TM.rearriveEvery)
    return () => clearTimeout(id)
  }, [phase, kAfter, later])

  const turnOn = () => {
    vibrate(24)
    setShowCta(false)
    setPhase('rewind')
    later(() => setPhase('rearriving'), PEOPLE.length * TM.rewindStagger + 420)
  }

  // toque na tela: pula para o fim do momento em curso
  const skip = () => {
    if (phase === 'arriving') setNBefore(PEOPLE.length)
    else if (phase === 'rearriving') {
      setKAfter(PEOPLE.length)
      setInFolder(NURTURE)
    }
  }

  const before = phase === 'off' || phase === 'arriving' || phase === 'question'
  const after = phase === 'rearriving' || phase === 'done'
  const stdOn = phase === 'rewind' || after

  const rows: { p: Person; mode: 'before' | 'after' }[] = useMemo(() => {
    if (before) return PEOPLE.slice(0, nBefore).reverse().map((p) => ({ p, mode: 'before' as const }))
    if (after) {
      return PEOPLE.slice(0, kAfter)
        .filter((p) => p.after !== null || !inFolder.includes(p.id))
        .reverse()
        .map((p) => ({ p, mode: 'after' as const }))
    }
    return []
  }, [before, after, nBefore, kAfter, inFolder])

  const readyNow = PEOPLE.slice(0, kAfter).filter((p) => p.after !== null).length
  const unread = before ? nBefore : rows.filter((r) => r.p.after !== null).length
  const folder = PEOPLE.filter((p) => inFolder.includes(p.id))

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex h-dvh-safe w-full items-center justify-center bg-bg sm:p-6">
        <motion.div
          className="relative flex h-full w-full flex-col overflow-hidden bg-[#0B0C0F] sm:h-[min(844px,calc(100dvh-48px))] sm:w-[390px] sm:rounded-[44px] sm:border-[10px] sm:border-[#1C1F24]"
          onClick={skip}
          key={run}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: TM.powerOn / 1000, ease: EASE_OUT_EXPO } }}
        >
          <StatusBar />

          {/* cabeçalho */}
          <header className="flex items-center justify-between px-5 pb-3 pt-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink">{C.title}</h1>
            <AnimatePresence>
              {unread > 0 && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[15px] font-semibold ${after ? 'bg-signal text-bg' : 'bg-ink text-bg'}`}
                  aria-label={`${unread} não lidas`}
                >
                  <Rolling value={unread} />
                </motion.span>
              )}
            </AnimatePresence>
          </header>

          {/* placar antes → depois */}
          <AnimatePresence>
            {stdOn && (
              <motion.section
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', transition: { duration: 0.45, ease: EASE_OUT_EXPO } }}
                className="mx-4 mb-2 overflow-hidden rounded-2xl border border-line bg-bg-raised"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[15px] font-semibold tracking-[0.02em] text-ink-muted">{C.scoreLabel}</span>
                  <span className="flex items-baseline gap-2 font-mono tabular text-[22px] font-medium">
                    <span className="text-ink-muted" aria-label={`${C.scoreBefore}: ${READY_BEFORE}`}>{READY_BEFORE}</span>
                    <span className="text-ink-muted">→</span>
                    <span className="text-signal" aria-label={`${C.scoreAfter}: ${readyNow}`}><Rolling value={readyNow} /></span>
                  </span>
                </div>
                <AnimatePresence>
                  {phase === 'done' && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
                      className="border-t border-line px-4 py-3 text-[15px] leading-snug text-ink"
                    >
                      {C.closing}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>

          <LayoutGroup>
            {/* lista de conversas */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <ul aria-live="polite">
                <AnimatePresence initial={false}>
                  {rows.map(({ p, mode }, i) => (
                    <Row key={`${mode}-${p.id}`} p={p} mode={mode} index={i} />
                  ))}
                </AnimatePresence>
              </ul>

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

            {/* pasta: ainda não estão prontos */}
            <AnimatePresence>
              {after && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_EXPO } }}
                  className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-line bg-bg-raised px-4 py-3"
                >
                  <div className="flex h-10 w-[68px] shrink-0 items-center">
                    {folder.map((p, i) => (
                      <motion.div
                        key={p.id}
                        layoutId={`av-${p.id}`}
                        transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
                        className={i > 0 ? '-ml-1.5' : ''}
                      >
                        <Avatar p={p} size={36} muted />
                      </motion.div>
                    ))}
                    {folder.length === 0 && <div className="h-9 w-9 rounded-full border border-dashed border-line" />}
                  </div>
                  <p className="text-[15px] leading-snug text-ink-muted">{C.folder}</p>
                </motion.section>
              )}
            </AnimatePresence>
          </LayoutGroup>

          {/* CTA */}
          <div className="pb-safe px-4 pb-4">
            <AnimatePresence mode="wait">
              {showCta && (
                <motion.button
                  key="cta"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); turnOn() }}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT_EXPO } }}
                  exit={{ opacity: 0, y: 16, transition: { duration: 0.18 } }}
                  whileTap={{ scale: 0.96 }}
                  className="relative h-14 w-full rounded-2xl bg-signal text-[17px] font-semibold text-bg"
                >
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl ring-2 ring-signal"
                    animate={{ opacity: [0.35, 0], scale: [1, 1.08] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                  {C.cta}
                </motion.button>
              )}
              {phase === 'done' && (
                <motion.button
                  key="replay"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRun((r) => r + 1) }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.6 } }}
                  className="h-[52px] w-full rounded-2xl border border-line text-[15px] font-medium text-ink"
                >
                  {C.replay}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>
    </MotionConfig>
  )
}

function Row({ p, mode, index }: { p: Person; mode: 'before' | 'after'; index: number }) {
  const ready = mode === 'after' && p.after !== null
  const notReady = mode === 'after' && p.after === null
  return (
    <motion.li
      layout="position"
      custom={index}
      variants={rowVariants}
      initial="initial"
      animate="enter"
      exit={notReady ? 'toFolder' : 'exit'}
      className="flex gap-3 border-b border-line/70 px-4 py-3"
    >
      {notReady ? (
        <motion.div layoutId={`av-${p.id}`} transition={{ duration: 0.75, ease: EASE_OUT_EXPO }} className="shrink-0">
          <Avatar p={p} size={44} muted />
        </motion.div>
      ) : (
        <div className="shrink-0"><Avatar p={p} size={44} /></div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[16px] font-semibold text-ink">{p.name}</span>
          {ready ? (
            <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-signal/15 px-2.5 text-[15px] font-semibold text-signal">
              {C.readyTag}
            </span>
          ) : (
            <span className="shrink-0 text-[15px] text-ink-muted">{p.time}</span>
          )}
        </div>
        {mode === 'before' && (
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="truncate text-[15px] text-ink">{p.before}</p>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" aria-label="não lida" />
          </div>
        )}
        {ready && <p className="mt-0.5 text-[15px] leading-snug text-ink">{p.after}</p>}
        {notReady && (
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate text-[15px] text-ink-muted">{C.notReadyPreview}</p>
            <span className="shrink-0 rounded-full border border-line px-2 text-[15px] text-ink-muted">{C.notReadyTag}</span>
          </div>
        )}
      </div>
    </motion.li>
  )
}

function Avatar({ p, size, muted = false }: { p: Person; size: number; muted?: boolean }) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold ring-2 ring-[#0B0C0F]"
      style={{ width: size, height: size, background: p.tone, fontSize: size * 0.36, color: muted ? '#8A8F98' : '#F2F1EC', opacity: muted ? 0.75 : 1 }}
      aria-hidden="true"
    >
      {initials(p.name)}
    </div>
  )
}

/** Número que rola como odômetro ao mudar. */
function Rolling({ value }: { value: number }) {
  return (
    <span className="relative inline-flex overflow-hidden tabular" style={{ height: '1.2em' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '100%' }}
          animate={{ y: '0%', transition: { duration: 0.35, ease: EASE_OUT_EXPO } }}
          exit={{ y: '-100%', transition: { duration: 0.2 } }}
          className="leading-[1.2em]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function StatusBar() {
  return (
    <div className="pt-safe flex h-11 shrink-0 items-center justify-between px-6 text-[15px] font-semibold text-ink" aria-hidden="true">
      <span className="tabular">9:41</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => <span key={h} className="w-[3px] rounded-sm bg-ink" style={{ height: h }} />)}
        </span>
        <span className="ml-1 flex h-[11px] w-[22px] items-center rounded-[3px] border border-ink/60 p-[1.5px]">
          <span className="h-full w-[70%] rounded-[1.5px] bg-ink" />
        </span>
      </span>
    </div>
  )
}

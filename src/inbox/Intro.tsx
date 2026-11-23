import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { INTRO as C } from '../funil/copy'
import { EASE_OUT_EXPO, SPRING_TOUCH } from '../funil/tokens'
import { Avatar } from './parts'

/**
 * Cena "intro": a continuação do anúncio. Um só objetivo: o toque em
 * "Quero ver quanto eu perco →". Tudo pronto e tocável no PRIMEIRO frame; só a caixa
 * de entrada se mexe. A perda ACUMULA (não é loop da mesma conversa).
 * Ao tocar: textos saem em fade (150ms) e a caixa cresce até ocupar a tela (500ms).
 */

type Status = 'new' | 'sent' | 'seen' | 'typing' | 'gone' | 'answered'
interface Convo { id: number; name: string; tone: number; msg: string; status: Status }

/** passos do ciclo (ms desde a chegada da conversa) */
const STEP = { sent: 450, seen: 950, typing: 1300, end: 1800, cycle: 2400 } as const
/** a cada N ciclos, uma conversa NÃO some (fica "respondeu") */
const ANSWER_EVERY = 4
/** azul do "lido" (só neste detalhe de ilustração) */
const READ_BLUE = '#4FB6EC'

const nameOf = (i: number) => C.names[i % C.names.length]
const msgOf = (i: number) => C.incoming[i % C.incoming.length]

/** primeiro frame já preenchido: 3 conversas, uma carimbada; RESPONDIDAS 3 · SUMIRAM 1 */
const INITIAL: Convo[] = [
  { id: 2, name: nameOf(2), tone: 2, msg: msgOf(2), status: 'seen' },
  { id: 1, name: nameOf(1), tone: 1, msg: msgOf(1), status: 'seen' },
  { id: 0, name: nameOf(0), tone: 0, msg: msgOf(0), status: 'gone' },
]

function useRowsVisible() {
  const read = () => {
    const h = typeof window === 'undefined' ? 800 : window.visualViewport?.height ?? window.innerHeight
    return h < 620 ? 3 : 4
  }
  const [n, setN] = useState(read)
  useEffect(() => {
    const on = () => setN(read())
    window.visualViewport?.addEventListener('resize', on)
    window.addEventListener('resize', on)
    return () => {
      window.visualViewport?.removeEventListener('resize', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return n
}

export function Intro({ onCta, onPainted, leaving }: {
  /** toque no botão; cyclesSeen = quantos ciclos completos a pessoa viu */
  onCta: (cyclesSeen: number) => void
  /** a intro está pintada na tela (primeiro frame) */
  onPainted: () => void
  /** transição de saída em andamento */
  leaving: boolean
}) {
  const [convos, setConvos] = useState<Convo[]>(INITIAL)
  const [respondidas, setRespondidas] = useState(3)
  const [sumiram, setSumiram] = useState(1)
  const cycles = useRef(0)
  const nextId = useRef(3)
  const rows = useRowsVisible()

  useEffect(() => {
    const raf = requestAnimationFrame(() => onPainted())
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // o ciclo: chega → resposta enviada → visualizada → digitando… → SUMIU (ou respondeu)
  useEffect(() => {
    if (leaving) return
    const timers: number[] = []
    const set = (id: number, status: Status) => setConvos((list) => list.map((c) => (c.id === id ? { ...c, status } : c)))
    const runCycle = () => {
      const id = nextId.current++
      const answered = (cycles.current + 1) % ANSWER_EVERY === 0
      const fresh: Convo = { id, name: nameOf(id), tone: id % 6, msg: msgOf(id), status: 'new' }
      setConvos((list) => [fresh, ...list].slice(0, 6))
      timers.push(window.setTimeout(() => set(id, 'sent'), STEP.sent))
      timers.push(window.setTimeout(() => set(id, 'seen'), STEP.seen))
      timers.push(window.setTimeout(() => set(id, answered ? 'seen' : 'typing'), STEP.typing))
      timers.push(window.setTimeout(() => {
        set(id, answered ? 'answered' : 'gone')
        setRespondidas((n) => n + 1)
        if (!answered) setSumiram((n) => n + 1)
        cycles.current++
      }, STEP.end))
    }
    const first = window.setTimeout(function loop() {
      runCycle()
      timers.push(window.setTimeout(loop, STEP.cycle))
    }, 900)
    timers.push(first)
    return () => timers.forEach(clearTimeout)
  }, [leaving])

  const fade = { opacity: leaving ? 0 : 1, transition: { duration: 0.15 } }

  return (
    <div
      className="absolute inset-0 flex flex-col px-5"
      style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      {/* a) contador */}
      <motion.p animate={fade} className="font-mono text-[13px] font-medium tabular tracking-[0.04em] text-ink-muted" aria-live="off">
        <Num value={respondidas} prefix="RESPONDIDAS " /> · <span className="text-leak"><Num value={sumiram} prefix="SUMIRAM " /></span>
      </motion.p>

      {/* b) headline */}
      <motion.h1
        animate={fade}
        className="mt-2.5 font-bold leading-[1.05] tracking-[-0.02em] text-ink"
        style={{ fontSize: 'clamp(34px, min(10vw, 6.4vh), 40px)' }}
      >
        {C.headline[0]}
        <span className="text-signal underline decoration-signal/60 decoration-[3px] underline-offset-[6px]">{C.headline[1]}</span>
        {C.headline[2]}
      </motion.h1>

      {/* c) apoio */}
      <motion.p animate={fade} className="mt-2 text-[16px] leading-snug text-ink/80">{C.support}</motion.p>

      {/* d) caixa de entrada animada (protagonista) */}
      {/* ao sair, o "relative" some: a caixa passa a ocupar a tela inteira da intro */}
      <div className={`mt-3.5 min-h-[220px] flex-1 ${leaving ? '' : 'relative'}`}>
        <motion.div
          layout
          transition={{ layout: { duration: 0.5, ease: EASE_OUT_EXPO } }}
          className={`absolute inset-0 overflow-hidden border border-line bg-bg-raised ${leaving ? 'z-20 rounded-none border-0' : 'rounded-[20px]'}`}
          aria-hidden="true"
        >
          <ul className="flex flex-col">
            <AnimatePresence initial={false} mode="popLayout">
              {convos.slice(0, rows).map((c) => <Row key={c.id} c={c} />)}
            </AnimatePresence>
          </ul>
        </motion.div>
      </div>

      {/* e) botão */}
      <motion.button
        type="button"
        onClick={() => onCta(cycles.current)}
        animate={fade}
        whileTap={{ scale: 0.97 }}
        className="mt-3.5 flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-signal text-[17px] font-semibold text-bg"
      >
        {C.cta}
        <motion.span
          aria-hidden="true"
          animate={{ x: [0, 4, 0] }}
          transition={{ duration: 0.45, repeat: Infinity, repeatDelay: 1.15, ease: 'easeInOut' }}
          className="inline-flex"
        >
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </motion.span>
      </motion.button>
    </div>
  )
}

/** contador em mono: troca de dígito sem animar o layout */
function Num({ value, prefix }: { value: number; prefix: string }) {
  return (
    <span className="tabular">
      {prefix}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: 0.3, ease: EASE_OUT_EXPO } }}
          exit={{ y: '60%', opacity: 0, transition: { duration: 0.15 } }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function Row({ c }: { c: Convo }) {
  const gone = c.status === 'gone'
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING_TOUCH }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      className="relative flex items-center gap-3 border-b border-line/70 px-3.5 py-2.5"
    >
      <Avatar name={c.name} idx={c.tone} size={36} dim={gone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-[15px] font-semibold ${gone ? 'text-ink-muted' : 'text-ink'}`}>{c.name}</span>
          {c.status === 'new' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" />}
        </div>
        <p className={`truncate text-[15px] ${gone ? 'text-ink-muted/60' : 'font-medium text-ink'}`}>{c.msg}</p>
        <StatusLine status={c.status} />
      </div>
      <AnimatePresence>
        {gone && (
          <motion.span
            initial={{ scale: 1.8, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: -8, x: [0, -4, 4, -3, 3, 0], transition: { scale: { duration: 0.22, ease: [0.2, 0, 0, 1] }, opacity: { duration: 0.12 }, x: { duration: 0.32, delay: 0.18 } } }}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border-2 border-leak px-2 py-0.5 font-mono text-[13px] font-bold tracking-[0.08em] text-leak"
          >
            {C.stamp}
          </motion.span>
        )}
      </AnimatePresence>
      {c.status === 'answered' && (
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full border border-line px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
          {C.answered}
        </span>
      )}
    </motion.li>
  )
}

function StatusLine({ status }: { status: Status }) {
  if (status === 'new') return <p className="h-[18px]" />
  if (status === 'typing') {
    return <p className="h-[18px] text-[13px] italic leading-[18px] text-ink-muted">{C.typing}</p>
  }
  const read = status !== 'sent'
  return (
    <p className={`flex h-[18px] items-center gap-1 truncate text-[13px] leading-[18px] ${status === 'gone' ? 'text-ink-muted/60' : 'text-ink-muted'}`}>
      <span className="truncate">{C.you} {C.reply}</span>
      <CheckCheck className="h-3.5 w-3.5 shrink-0" style={{ color: read ? READ_BLUE : undefined }} strokeWidth={2.5} />
      {read && status !== 'answered' && <span className="shrink-0">· {C.seen}</span>}
    </p>
  )
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SegmentId } from '../funil/config'
import { INBOX, INTRO as C } from '../funil/copy'
import { AVATAR_TONES } from '../funil/tokens'
import { SEGMENT_ICONS, SEGMENT_ORDER } from './parts'

/**
 * Cena "intro": o celular acende no escuro.
 *
 * Uma notificação só (a Mariana, "oi, quanto custa?") é a protagonista. Atrás dela, em
 * profundidade, "valor?" e "?". Depois, silêncio: só o push-in da cena e a Mariana
 * flutuando. Texto e botão prontos no PRIMEIRO frame.
 *
 * Depois do toque a Mariana NÃO some: sobe, fixa no topo e a pergunta de nicho aparece
 * embaixo dela, na mesma cena. Escolhido o nicho, a mensagem dela vira a do nicho e ela
 * pousa como a primeira conversa da caixa de entrada (layoutId "mariana").
 *
 * Desempenho: só transform/opacity animam em loop. O blur das camadas de profundidade é
 * fixo (rasterizado uma vez); o grão é uma textura estática deslocada por transform.
 */

export type IntroStage = 'intro' | 'leaving' | 'niche' | 'landing'

/** tom quente do avatar da Mariana (terracota) */
export const MARIANA_TONE = AVATAR_TONES[5]
export const MARIANA_LAYOUT_ID = 'mariana'

/** abaixo disso: some a profundidade e a notificação encolhe (a Mariana e o botão nunca saem) */
const COMPACT_BELOW = 620

function useCompact() {
  const read = () => {
    if (typeof window === 'undefined') return false
    return (window.visualViewport?.height ?? window.innerHeight) < COMPACT_BELOW
  }
  const [compact, setCompact] = useState(read)
  useEffect(() => {
    const on = () => setCompact(read())
    window.visualViewport?.addEventListener('resize', on)
    window.addEventListener('resize', on)
    return () => {
      window.visualViewport?.removeEventListener('resize', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return compact
}

/** grão de filme: ruído estático (SVG feTurbulence), gerado uma vez */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`

/** material da notificação: cinza translúcido, fio de luz no topo, sombra funda e macia */
const MATERIAL = {
  background: 'linear-gradient(180deg, rgba(70,70,76,0.80) 0%, rgba(44,44,49,0.82) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 32px 64px -20px rgba(0,0,0,0.9), 0 12px 28px -10px rgba(0,0,0,0.65)',
} as const

const PUSH = { duration: 8, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' } as const

export function Intro({ stage, landingMsg, onCta, onPick, onPainted }: {
  stage: IntroStage
  /** mensagem do nicho escolhido (a da Mariana no banco), para o morph */
  landingMsg: string | null
  /** toque no botão; watchedMs = quanto tempo a intro ficou na tela antes do toque */
  onCta: (watchedMs: number) => void
  onPick: (s: SegmentId) => void
  /** a intro está pintada na tela (primeiro frame) */
  onPainted: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const compact = useCompact()
  const mountedAt = useRef(0)
  const isIntro = stage === 'intro' || stage === 'leaving'
  const alive = stage === 'intro' // push-in, flutuação e profundidade só antes do toque

  useEffect(() => {
    mountedAt.current = performance.now()
    const raf = requestAnimationFrame(() => onPainted())
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#07080A' }}>
      {/* vinheta + grão (fixos na tela) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 85% at 50% 38%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.72) 100%)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: 0.035 }}>
        <div className={`absolute ${reduced ? '' : 'fv-grain'}`} style={{ inset: '-120px', backgroundImage: GRAIN, backgroundSize: '180px 180px' }} />
      </div>

      <div
        className="relative z-10 flex h-full flex-col px-5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {/* palco: no começo ocupa o espaço livre e centraliza a Mariana; depois do toque, ela sobe */}
        <div className={isIntro ? 'relative flex min-h-0 flex-1 items-center' : 'relative pt-2'}>
          <div className="relative w-full">
            {/* luz quente atrás da notificação (pulsa na chegada) */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: '150%', height: 340, x: '-50%', y: '-50%',
                background: 'radial-gradient(closest-side, rgba(255,170,115,0.22), rgba(255,140,95,0.08) 55%, rgba(255,140,95,0) 100%)',
              }}
              initial={reduced ? false : { opacity: 0.5, scale: 1 }}
              animate={
                stage === 'landing' ? { opacity: 0, transition: { duration: 0.4 } }
                  : reduced || !alive ? { opacity: 0.8, scale: 1 }
                    : { opacity: [0.5, 1, 0.8], scale: [1, 1.03], transition: { opacity: { duration: 1, times: [0, 0.45, 1], delay: 0.2 }, scale: PUSH } }
              }
            />

            {/* profundidade: não é lista, são camadas atrás (menores e desfocadas) */}
            {!compact && (
              <>
                <DepthLayer text={C.depth[1]} tone={1} depth={2} at={2.6} show={alive} reduced={reduced} />
                <DepthLayer text={C.depth[0]} tone={2} depth={1} at={1.6} show={alive} reduced={reduced} />
              </>
            )}

            {/* a protagonista: layout aqui fora; chegada, push-in e flutuação nos filhos */}
            <motion.div layoutId={MARIANA_LAYOUT_ID} layout="position" transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }} className="relative">
              <motion.div
                initial={reduced ? false : { y: -110, opacity: 0, scaleY: 1.14, filter: 'blur(12px)' }}
                animate={{ y: 0, opacity: 1, scaleY: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <motion.div
                  animate={reduced || !alive ? { y: 0, scale: 1 } : { y: [0, -3, 0, 3, 0], scale: [1, 1.03] }}
                  transition={reduced || !alive ? { duration: 0.3 } : { y: { duration: 5, ease: 'easeInOut', repeat: Infinity, delay: 0.7 }, scale: PUSH }}
                  style={{ willChange: 'transform' }}
                >
                  <Notification msg={stage === 'landing' && landingMsg ? landingMsg : C.msg} compact={compact} reduced={reduced} />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* texto + botão (prontos no primeiro frame) / pergunta de nicho, na mesma cena */}
        <AnimatePresence mode="popLayout" initial={false}>
          {isIntro ? (
            <motion.div
              key="pitch"
              className="shrink-0"
              animate={{ opacity: stage === 'leaving' ? 0 : 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h1 className="text-ink">
                <span className="block font-semibold leading-[1.06] tracking-[-0.02em]" style={{ fontSize: 'clamp(32px, min(9.6vw, 5.8vh), 38px)' }}>
                  {C.headline[0]}<br />{C.headline[1]}
                </span>
                <span className="block font-serif italic leading-[1.02]" style={{ fontSize: 'clamp(38px, min(11.4vw, 6.9vh), 46px)' }}>
                  {C.headline[2]}
                </span>
              </h1>
              <p className="mt-2.5 text-[15px] leading-snug" style={{ color: 'rgba(242,241,236,0.7)' }}>{C.support}</p>
              <motion.button
                type="button"
                disabled={stage !== 'intro'}
                onClick={(e) => { e.stopPropagation(); onCta(Math.round(performance.now() - mountedAt.current)) }}
                whileTap={{ scale: 0.97 }}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-signal text-[17px] font-semibold text-bg"
              >
                {C.cta}
                <ArrowRight className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.section
              key="niche"
              className="mt-6 flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: stage === 'landing' ? 0 : 1, transition: { duration: stage === 'landing' ? 0.2 : 0.3, delay: stage === 'landing' ? 0 : 0.3 } }}
            >
              <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{C.nicheTitle}</h2>
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                {SEGMENT_ORDER.map((s, i) => {
                  const Icon = SEGMENT_ICONS[s]
                  return (
                    <motion.button
                      key={s}
                      type="button"
                      disabled={stage !== 'niche'}
                      onClick={(e) => { e.stopPropagation(); onPick(s) }}
                      initial={reduced ? false : { y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.35 + i * 0.035, ease: [0.16, 1, 0.3, 1] } }}
                      whileTap={{ scale: 0.97 }}
                      className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-bg-raised px-3 py-2.5 text-left text-[15px] font-medium leading-tight text-ink"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden="true" />
                      {INBOX.segmentChip[s]}
                    </motion.button>
                  )
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** a notificação da Mariana (também usada como "pouso" na caixa de entrada) */
function Notification({ msg, compact, reduced }: { msg: string; compact: boolean; reduced: boolean }) {
  const av = compact ? 36 : 42
  return (
    <div className={`flex items-center gap-3 rounded-[22px] ${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'}`} style={MATERIAL}>
      <div
        className="flex shrink-0 items-center justify-center rounded-full font-semibold"
        style={{ width: av, height: av, background: MARIANA_TONE.bg, color: MARIANA_TONE.fg, fontSize: av * 0.42 }}
        aria-hidden="true"
      >
        M
      </div>
      <div className="min-w-0 flex-1">
        <p className={compact ? 'text-[14px] leading-tight' : 'text-[15px] leading-tight'}>
          <span className="font-semibold text-ink">{C.name}</span>
          <span style={{ color: 'rgba(242,241,236,0.5)' }}> · {C.when}</span>
        </p>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={msg}
            className={`mt-0.5 ${compact ? 'text-[15px]' : 'text-[16px]'} leading-snug`}
            style={{ color: 'rgba(242,241,236,0.92)' }}
            initial={reduced ? false : { opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.35 } }}
            exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.2 } }}
          >
            {msg}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** camada de profundidade: menor, mais alta, desfocada (blur fixo; anima só opacity/transform) */
function DepthLayer({ text, tone, depth, at, show, reduced }: {
  text: string; tone: number; depth: 1 | 2; at: number; show: boolean; reduced: boolean
}) {
  const conf = depth === 1
    ? { scale: 0.88, y: -40, x: 14, blur: 1.6, opacity: 0.55 }
    : { scale: 0.76, y: -74, x: -16, blur: 3.6, opacity: 0.3 }
  const t = AVATAR_TONES[tone]
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0"
      initial={reduced ? false : { opacity: 0, scale: conf.scale * 0.94, y: conf.y + 10, x: conf.x }}
      animate={
        show
          ? { opacity: conf.opacity, scale: conf.scale, y: conf.y, x: conf.x, transition: { delay: reduced ? 0 : at, duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] } }
          : { opacity: 0, scale: conf.scale * 0.96, y: conf.y, x: conf.x, transition: { duration: 0.3 } }
      }
    >
      <div className="flex items-center gap-3 rounded-[22px] px-3.5 py-3" style={{ ...MATERIAL, filter: `blur(${conf.blur}px)` }}>
        <div className="h-[42px] w-[42px] shrink-0 rounded-full" style={{ background: t.bg }} />
        <p className="min-w-0 flex-1 text-[17px] font-medium leading-snug" style={{ color: 'rgba(242,241,236,0.92)' }}>{text}</p>
      </div>
    </motion.div>
  )
}

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SegmentId } from '../funil/config'
import { INBOX, INTRO as C } from '../funil/copy'
import { AVATAR_TONES } from '../funil/tokens'
import { SEGMENT_ORDER } from './parts'

/**
 * Cena "intro": o celular acende no escuro.
 *
 * A Mariana Costa ("oi, quanto custa?") é a única protagonista, no terço superior, com a
 * headline logo abaixo formando um bloco só. Silêncio: só o push-in e a flutuação dela.
 * Texto e botão prontos no PRIMEIRO frame (fontes com preload no build).
 *
 * Toque: headline/apoio/botão saem (200ms) AO MESMO TEMPO em que ela sobe e a pergunta de
 * nicho entra (sem frame só com a notificação).
 * Nicho: a mensagem dela NÃO muda ("oi, quanto custa?"); em 'handoff' o card some daqui no mesmo
 * commit em que a linha dela nasce na caixa (layoutId "mariana"): o mesmo card se move e
 * encolhe até a linha (450ms, expo out) enquanto o resto da intro some em fade por baixo.
 *
 * Desempenho: em loop só transform/opacity; o grão é textura estática deslocada por transform.
 */

export type IntroStage = 'intro' | 'niche' | 'landing' | 'handoff'

/** tom quente do avatar da Mariana (terracota): o mesmo na caixa de entrada */
export const MARIANA_TONE = AVATAR_TONES[5]
export const MARIANA_LAYOUT_ID = 'mariana'
/** shared element intro → linha da caixa */
export const MARIANA_MORPH = { duration: 0.45, ease: [0.16, 1, 0.3, 1] } as const

/** grão de filme: ruído estático (SVG feTurbulence), gerado uma vez */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`

/** material da notificação: cinza translúcido, fio de luz no topo, sombra funda e macia */
const MATERIAL = {
  background: 'linear-gradient(180deg, rgba(70,70,76,0.80) 0%, rgba(44,44,49,0.82) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 32px 64px -20px rgba(0,0,0,0.9), 0 12px 28px -10px rgba(0,0,0,0.65)',
  borderRadius: 22,
} as const

const PUSH = { duration: 8, ease: 'easeInOut', repeat: Infinity, repeatType: 'mirror' } as const

/** o que estava visível no primeiro paint (vai no fv_first_paint) */
export interface PaintCheck { pitch_visible: boolean; fonts_ready: boolean }

export function Intro({ stage, landingMsg, onCta, onPick, onPainted }: {
  stage: IntroStage
  /** mensagem do nicho escolhido (a da Mariana no banco), para o morph */
  landingMsg: string | null
  /** toque no botão; watchedMs = quanto tempo a intro ficou na tela antes do toque */
  onCta: (watchedMs: number) => void
  onPick: (s: SegmentId) => void
  /** a intro está pintada na tela (primeiro frame) */
  onPainted: (check: PaintCheck) => void
}) {
  const reduced = useReducedMotion() ?? false
  const mountedAt = useRef(0)
  const pitchRef = useRef<HTMLDivElement>(null)
  const isIntro = stage === 'intro'
  const msg = (stage === 'landing' || stage === 'handoff') && landingMsg ? landingMsg : C.msg

  useEffect(() => {
    mountedAt.current = performance.now()
    const raf = requestAnimationFrame(() => {
      const el = pitchRef.current
      const r = el?.getBoundingClientRect()
      const visible = !!el && !!r && r.height > 0 && r.bottom <= window.innerHeight + 1 && getComputedStyle(el).opacity !== '0'
      let fonts = false
      try {
        fonts = document.fonts.check('600 16px "Inter Tight"') && document.fonts.check('italic 400 16px "Instrument Serif"')
      } catch { /* sem FontFaceSet */ }
      onPainted({ pitch_visible: visible, fonts_ready: fonts })
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#07080A', pointerEvents: stage === 'handoff' ? 'none' : undefined }}
      animate={{ opacity: stage === 'handoff' ? 0 : 1 }}
      transition={{ duration: 0.3 }}
    >
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
        {/* o espaço livre vai para o topo: centro do card ≈ 38% da altura útil */}
        <motion.div layout aria-hidden="true" style={{ flexGrow: isIntro ? 1.65 : 0, flexShrink: 1, minHeight: isIntro ? 8 : 0 }} transition={{ layout: MARIANA_MORPH }} />

        {/* a protagonista: layout aqui fora; chegada, push-in e flutuação nos filhos */}
        <div className="relative shrink-0">
          {/* luz fria e neutra, pequena, logo atrás do card */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: '112%', height: 190, x: '-50%', y: '-50%',
              background: 'radial-gradient(closest-side, rgba(221,230,240,0.13), rgba(221,230,240,0.04) 60%, rgba(221,230,240,0) 100%)',
            }}
            initial={reduced ? false : { opacity: 0.4 }}
            animate={
              !isIntro ? { opacity: 0, transition: { duration: 0.3 } }
                : reduced ? { opacity: 1 }
                  : { opacity: [0.4, 1, 0.85], scale: [1, 1.03], transition: { opacity: { duration: 1, times: [0, 0.45, 1], delay: 0.2 }, scale: PUSH } }
            }
          />
          {stage !== 'handoff' && (
            <motion.div layoutId={MARIANA_LAYOUT_ID} layout transition={{ layout: MARIANA_MORPH }} className="relative">
              <motion.div
                initial={reduced ? false : { y: -110, opacity: 0, scaleY: 1.14, filter: 'blur(12px)' }}
                animate={{ y: 0, opacity: 1, scaleY: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.2, duration: 0.5, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <motion.div
                  animate={reduced || !isIntro ? { y: 0, scale: 1 } : { y: [0, -3, 0, 3, 0], scale: [1, 1.03] }}
                  transition={reduced || !isIntro ? { duration: 0.25 } : { y: { duration: 5, ease: 'easeInOut', repeat: Infinity, delay: 0.7 }, scale: PUSH }}
                  style={{ willChange: 'transform' }}
                >
                  <Notification msg={msg} reduced={reduced} />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* headline 40–56px abaixo da notificação; apoio e botão logo depois. Ou: a pergunta de nicho.
            popLayout: os dois coexistem na troca (sem frame só com a notificação) */}
        <AnimatePresence mode="popLayout" initial={false}>
          {isIntro ? (
            <motion.div
              key="pitch"
              ref={pitchRef}
              className="shrink-0 pt-12"
              // desce 12px e some em 120ms (ease-out: já quase invisível quando o nicho começa, aos 80ms)
              exit={{ opacity: 0, y: 12, transition: { duration: 0.12, ease: [0, 0, 0.2, 1] } }}
            >
              <h1 className="text-ink">
                <span className="block font-semibold leading-[1.06] tracking-[-0.02em]" style={{ fontSize: 'clamp(32px, min(9.6vw, 5.8vh), 38px)' }}>
                  {C.headline[0]}<br />{C.headline[1]}
                </span>
                <span className="block font-serif italic leading-[1.02]" style={{ fontSize: 'clamp(38px, min(11.4vw, 6.9vh), 46px)' }}>
                  {C.headline[2]}
                </span>
              </h1>
              <p className="mt-2.5 text-[15px] leading-snug" style={{ color: 'rgba(242,241,236,0.7)', textWrap: 'pretty' } as React.CSSProperties}>
                {C.support}
              </p>
              <motion.button
                type="button"
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
              className="shrink-0 pt-7"
              initial={{ opacity: 1 }}
              animate={{ opacity: stage === 'niche' ? 1 : 0 }}
              transition={{ duration: 0.25 }}
            >
              <motion.h2
                className="text-ink"
                initial={reduced ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: 0.08, ease: [0.16, 1, 0.3, 1] } }}
              >
                <span className="block text-[24px] font-semibold leading-[1.1] tracking-[-0.01em]">{C.nicheTitle[0]}</span>
                <span className="block font-serif text-[32px] italic leading-[1.08]">{C.nicheTitle[1]}</span>
              </motion.h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {SEGMENT_ORDER.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    disabled={stage !== 'niche'}
                    onClick={(e) => { e.stopPropagation(); onPick(s) }}
                    initial={reduced ? false : { y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1, transition: { duration: 0.32, delay: 0.1 + i * 0.025, ease: [0.16, 1, 0.3, 1] } }}
                    whileTap={{ scale: 0.97 }}
                    className="flex h-[52px] items-center rounded-2xl border border-line bg-bg-raised px-3.5 text-left text-[16px] font-medium leading-tight text-ink"
                  >
                    {INBOX.segmentChip[s]}
                  </motion.button>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* espaço de baixo (menor que o de cima) */}
        <motion.div layout aria-hidden="true" style={{ flexGrow: 1, flexShrink: 1 }} transition={{ layout: MARIANA_MORPH }} />
      </div>
    </motion.div>
  )
}

/** a notificação da Mariana Costa (vira a 1ª linha da caixa de entrada) */
function Notification({ msg, reduced }: { msg: string; reduced: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3" style={MATERIAL}>
      <div
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[16px] font-semibold"
        style={{ background: MARIANA_TONE.bg, color: MARIANA_TONE.fg }}
        aria-hidden="true"
      >
        {C.initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight">
          <span className="font-semibold text-ink">{C.name}</span>
          <span style={{ color: 'rgba(242,241,236,0.5)' }}> · {C.when}</span>
        </p>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={msg}
            className="mt-0.5 text-[16px] leading-snug"
            style={{ color: 'rgba(242,241,236,0.92)' }}
            initial={reduced ? false : { opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.3 } }}
            exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.18 } }}
          >
            {msg}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LEADS_MAX, LEADS_MIN, ROUTES, TICKET_MIDPOINTS, type RouteId, type SegmentId, type TicketId } from '../funil/config'
import { CAPTIONS, SEGMENTS, type CaptionKey } from '../funil/copy'
import { FunnelEngine, type EngineStats } from '../funil/engine/FunnelEngine'
import { SCENES, type EngineScene } from '../funil/engine/scenes'
import { EASE_OUT_EXPO } from '../funil/tokens'

/**
 * /lab — bancada do motor. Sliders de debug para L, rota, A, ticket, segmento, timeScale,
 * STD e câmera. FPS sempre visível. A legenda de filme e os balões são DOM (como no app).
 */

const ROUTE_LABEL: Record<RouteId, string> = {
  whatsapp: 'WhatsApp',
  formulario: 'Formulário',
  direct: 'Direct',
  nao_anuncia: 'Não anuncia',
}
const TICKET_LABEL: Record<TicketId, string> = { ate_300: '≤300', '300_1k': '300–1k', '1k_3k': '1k–3k', '3k_mais': '3k+' }

/** altura do HUD (44px) + faixa da legenda */
const STAGE_TOP = 104

const toLeads = (pos: number) => Math.round(LEADS_MIN * Math.pow(LEADS_MAX / LEADS_MIN, pos / 1000))
const toPos = (leads: number) => Math.round((Math.log(leads / LEADS_MIN) / Math.log(LEADS_MAX / LEADS_MIN)) * 1000)

interface Balloon { id: number; x: number; y: number; text: string }

export default function Lab() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FunnelEngine | null>(null)
  const [stats, setStats] = useState<EngineStats>({ fps: 60, active: 0, degraded: false, timeScale: 1 })
  const [scene, setScene] = useState<EngineScene>('rota')
  const [leads, setLeads] = useState(120)
  const [route, setRoute] = useState<RouteId | null>('whatsapp')
  const [a10, setA10] = useState(3)
  const [ticket, setTicket] = useState<TicketId | null>('300_1k')
  const [segment, setSegment] = useState<SegmentId | null>('estetica')
  const [ts, setTs] = useState(1)
  const [std, setStd] = useState(false)
  const [panelSim, setPanelSim] = useState(false)
  const [open, setOpen] = useState(true)
  const [phase, setPhase] = useState('—')
  const [caption, setCaption] = useState<CaptionKey | null>(null)
  const [balloons, setBalloons] = useState<Balloon[]>([])
  const coldTimer = useRef<number>(0)

  // monta o motor uma vez
  useEffect(() => {
    const engine = new FunnelEngine()
    engineRef.current = engine
    engine.mount(canvasRef.current!)
    if (import.meta.env.DEV) (window as unknown as { __engine: FunnelEngine }).__engine = engine
    let bid = 0
    const offs = [
      engine.on('std:phase', (p) => setPhase(p.phase)),
      engine.on('caption', (c) => setCaption(c.key)),
      engine.on('single:done', () => { setScene('cold_funnel') }),
      engine.on('hero:arrive', (b) => {
        const id = ++bid
        setBalloons((list) => [...list.slice(-2), { id, ...b }])
        window.setTimeout(() => setBalloons((list) => list.filter((x) => x.id !== id)), 2600)
      }),
    ]
    const id = window.setInterval(() => setStats(engine.getStats()), 250)
    return () => {
      window.clearInterval(id)
      offs.forEach((off) => off())
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => { engineRef.current?.setScene(scene) }, [scene])
  useEffect(() => { engineRef.current?.setInputs({ leads }) }, [leads])
  useEffect(() => { engineRef.current?.setInputs({ route }) }, [route])
  useEffect(() => { engineRef.current?.setInputs({ a10 }) }, [a10])
  useEffect(() => { engineRef.current?.setInputs({ ticket: ticket ? TICKET_MIDPOINTS[ticket] : null }) }, [ticket])
  useEffect(() => { engineRef.current?.setInputs({ segment }) }, [segment])

  // viewport: palco entre a legenda e (opcionalmente) o painel de 46%
  useEffect(() => {
    const apply = () => {
      const h = window.innerHeight
      engineRef.current?.setViewport(STAGE_TOP, panelSim ? h * 0.54 : h - 8)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [panelSim])

  const toggleStd = () => {
    const e = engineRef.current
    if (!e) return
    const next = !std
    setStd(next)
    if (next) {
      setScene('std_on')
      e.setScene('std_on')
      e.setStd(true)
    } else e.setStd(false)
  }

  const replayStd = () => {
    const e = engineRef.current
    if (!e) return
    e.setStd(false)
    setStd(true)
    setScene('std_on')
    e.setScene('std_on')
    requestAnimationFrame(() => e.setStd(true))
  }

  const coldOpen = () => {
    const e = engineRef.current
    if (!e) return
    window.clearTimeout(coldTimer.current)
    e.setStd(false)
    setStd(false)
    e.reset()
    setScene('void')
    coldTimer.current = window.setTimeout(() => setScene('cold_single'), 700)
  }

  const fpsColor = stats.fps >= 55 ? 'text-signal' : stats.fps >= 45 ? 'text-ink' : 'text-leak'

  return (
    <div className="relative h-dvh-safe w-full overflow-hidden bg-bg">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        onClick={() => engineRef.current?.skipStd()}
      />

      {/* HUD do lab: FPS sempre visível */}
      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-4 font-mono text-[10px] uppercase tracking-telemetry">
        <span className="text-ink-muted">/LAB · {scene} · STD {phase}</span>
        <span className={`tabular ${fpsColor}`}>
          {stats.fps.toFixed(0)} FPS · {stats.active}P{stats.degraded ? ' · DEGRADADO' : ''}
        </span>
      </div>

      {/* legenda de filme */}
      <div className="pointer-events-none absolute inset-x-0 top-11 z-20 flex h-[60px] items-center justify-center px-4" aria-live="polite">
        <AnimatePresence mode="wait">
          {caption && (
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              className="max-w-[340px] text-center text-base font-medium leading-snug text-ink"
            >
              {CAPTIONS[caption]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* balões de mensagem (DOM), sobre o nó do WhatsApp */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {balloons.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 0, scale: 0.8 }}
              animate={{ opacity: 1, y: -46, scale: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } }}
              exit={{ opacity: 0, y: -76, transition: { duration: 0.6 } }}
              style={{ left: b.x, top: b.y }}
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-2xl rounded-br-sm bg-signal px-3 py-1.5 text-[13px] font-semibold text-bg"
            >
              {b.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {panelSim && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[46%] border-t border-line bg-bg-raised/[0.94]" />
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="absolute bottom-3 right-3 z-30 h-11 rounded-full border border-line bg-bg-raised px-4 font-mono text-[11px] uppercase tracking-telemetry text-ink"
      >
        {open ? 'Esconder' : 'Controles'}
      </button>

      {open && (
        <div className="pb-safe absolute inset-x-0 bottom-0 z-20 max-h-[52%] overflow-y-auto border-t border-line bg-bg-raised/95 px-4 pb-16 pt-3 font-mono text-[11px] uppercase tracking-telemetry text-ink-muted">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={false} onClick={coldOpen}>Cold open</Chip>
            <Chip on={std} onClick={toggleStd}>{std ? 'Desligar STD' : 'Ligar STD'}</Chip>
            <Chip on={false} onClick={replayStd}>Repetir clímax</Chip>
            <Chip on={false} onClick={() => engineRef.current?.resetDeposit()}>Esvaziar depósito</Chip>
            <Chip on={panelSim} onClick={() => setPanelSim((p) => !p)}>Painel 46%</Chip>
            <Chip on={stats.degraded} onClick={() => engineRef.current?.setDegraded(!stats.degraded)}>Degradar</Chip>
          </div>

          <Row label="Cena">
            <select value={scene} onChange={(e) => setScene(e.target.value as EngineScene)} className="h-9 w-full rounded border border-line bg-bg px-2 text-ink">
              {(Object.keys(SCENES) as EngineScene[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Row>

          <Row label={`Leads/mês · ${leads >= LEADS_MAX ? '1.000+' : leads}`}>
            <input type="range" min={0} max={1000} value={toPos(leads)} onChange={(e) => setLeads(toLeads(+e.target.value))} className="w-full accent-[#C6FF3D]" />
          </Row>

          <Row label="Rota">
            <div className="flex flex-wrap gap-1.5">
              {ROUTES.map((r) => <Chip key={r} on={route === r} onClick={() => setRoute(r)}>{ROUTE_LABEL[r]}</Chip>)}
              <Chip on={route === null} onClick={() => setRoute(null)}>Padrão</Chip>
            </div>
          </Row>

          <Row label={`Conversão · ${a10}/10`}>
            <input type="range" min={0} max={10} value={a10} onChange={(e) => setA10(+e.target.value)} className="w-full accent-[#C6FF3D]" />
          </Row>

          <Row label="Ticket">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TICKET_MIDPOINTS) as TicketId[]).map((t) => <Chip key={t} on={ticket === t} onClick={() => setTicket(t)}>{TICKET_LABEL[t]}</Chip>)}
              <Chip on={ticket === null} onClick={() => setTicket(null)}>Sem</Chip>
            </div>
          </Row>

          <Row label="Segmento">
            <select value={segment ?? ''} onChange={(e) => setSegment((e.target.value || null) as SegmentId | null)} className="h-9 w-full rounded border border-line bg-bg px-2 text-ink">
              <option value="">(nenhum)</option>
              {(Object.keys(SEGMENTS) as SegmentId[]).map((s) => <option key={s} value={s}>{SEGMENTS[s].label}</option>)}
            </select>
          </Row>

          <Row label={`timeScale · ${ts.toFixed(2)}`}>
            <input
              type="range" min={5} max={200} value={Math.round(ts * 100)}
              onChange={(e) => { const v = +e.target.value / 100; setTs(v); engineRef.current?.setTimeScale(v, 200) }}
              className="w-full accent-[#C6FF3D]"
            />
          </Row>
          <p className="mt-3 normal-case tracking-normal">Durante o clímax, um toque no funil pula para o final.</p>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`h-9 rounded border px-3 ${on ? 'border-signal text-signal' : 'border-line text-ink'}`}>
      {children}
    </button>
  )
}

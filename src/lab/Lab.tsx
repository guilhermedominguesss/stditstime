import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LEADS_MAX, LEADS_MIN, ROUTES, type RouteId } from '../funil/config'
import { FunnelEngine, type EngineStats } from '../funil/engine/FunnelEngine'
import { SCENES, type EngineScene } from '../funil/engine/scenes'

/**
 * /lab — bancada do motor. Sliders de debug para L, rota, A, timeScale, STD e câmera.
 * O contador de FPS fica sempre visível no canto.
 */

const SEGMENTS = ['', 'CLÍNICA / SAÚDE', 'ESTÉTICA / BELEZA', 'ODONTOLOGIA', 'EDUCAÇÃO / CURSOS', 'COMÉRCIO / VAREJO']
const ROUTE_LABEL: Record<RouteId, string> = {
  whatsapp: 'WhatsApp',
  formulario: 'Formulário',
  direct: 'Direct',
  nao_anuncia: 'Não anuncia',
}

// slider logarítmico: posição 0..1000 ↔ 10..1000 leads
const toLeads = (pos: number) => Math.round(LEADS_MIN * Math.pow(LEADS_MAX / LEADS_MIN, pos / 1000))
const toPos = (leads: number) => Math.round((Math.log(leads / LEADS_MIN) / Math.log(LEADS_MAX / LEADS_MIN)) * 1000)

export default function Lab() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<FunnelEngine | null>(null)
  const [stats, setStats] = useState<EngineStats>({ fps: 60, active: 0, degraded: false, timeScale: 1 })
  const [scene, setScene] = useState<EngineScene>('rota')
  const [leads, setLeads] = useState(120)
  const [route, setRoute] = useState<RouteId | null>('whatsapp')
  const [a10, setA10] = useState(3)
  const [segment, setSegment] = useState('ESTÉTICA / BELEZA')
  const [ts, setTs] = useState(1)
  const [std, setStd] = useState(false)
  const [panelSim, setPanelSim] = useState(false)
  const [open, setOpen] = useState(true)
  const [phase, setPhase] = useState('—')
  const [arrivals, setArrivals] = useState({ total: 0, qualified: 0, leaks: 0 })

  // monta o motor uma vez
  useEffect(() => {
    const engine = new FunnelEngine()
    engineRef.current = engine
    engine.mount(canvasRef.current!)
    if (import.meta.env.DEV) (window as unknown as { __engine: FunnelEngine }).__engine = engine
    const counts = { total: 0, qualified: 0, leaks: 0 }
    const offs = [
      engine.on('std:phase', (p) => setPhase(p.phase)),
      engine.on('arrive', (p) => { counts.total++; if (p.qualified) counts.qualified++ }),
      engine.on('leak', () => { counts.leaks++ }),
    ]
    const id = window.setInterval(() => {
      setStats(engine.getStats())
      setArrivals({ ...counts })
    }, 250)
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
  useEffect(() => { engineRef.current?.setInputs({ segmentLabel: segment || null }) }, [segment])

  // viewport: com o painel simulado, o palco vai do HUD (44px) até 54% da altura
  useEffect(() => {
    const apply = () => {
      const h = window.innerHeight
      engineRef.current?.setViewport(44, panelSim ? h * 0.54 : h)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [panelSim])

  const toggleStd = () => {
    const next = !std
    setStd(next)
    engineRef.current?.setStd(next)
  }

  const replayStd = () => {
    engineRef.current?.setStd(false)
    setStd(true)
    requestAnimationFrame(() => engineRef.current?.setStd(true))
  }

  const coldOpen = () => {
    const e = engineRef.current
    if (!e) return
    e.setStd(false)
    setStd(false)
    setScene('void')
    e.setScene('void')
    const steps: [number, EngineScene][] = [[600, 'cold_single'], [3600, 'cold_chaos'], [6400, 'cold_funnel']]
    steps.forEach(([ms, s]) => window.setTimeout(() => { setScene(s); e.setScene(s) }, ms))
  }

  const fpsColor = stats.fps >= 55 ? 'text-signal' : stats.fps >= 45 ? 'text-ink' : 'text-leak'

  return (
    <div className="relative h-dvh-safe w-full overflow-hidden bg-bg">
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />

      {/* HUD do lab: FPS sempre visível */}
      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-4 font-mono text-[10px] uppercase tracking-telemetry">
        <span className="text-ink-muted">/LAB · {scene} · STD {phase}</span>
        <span className={`tabular ${fpsColor}`}>
          {stats.fps.toFixed(0)} FPS · {stats.active}P{stats.degraded ? ' · DEGRADADO' : ''}
        </span>
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
          <Row label="Cena">
            <select
              value={scene}
              onChange={(e) => setScene(e.target.value as EngineScene)}
              className="h-9 w-full rounded border border-line bg-bg px-2 text-ink"
            >
              {(Object.keys(SCENES) as EngineScene[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Row>

          <Row label={`Leads/mês · ${leads >= LEADS_MAX ? '1.000+' : leads}`}>
            <input type="range" min={0} max={1000} value={toPos(leads)} onChange={(e) => setLeads(toLeads(+e.target.value))} className="w-full accent-[#C6FF3D]" />
          </Row>

          <Row label="Rota">
            <div className="flex flex-wrap gap-1.5">
              {ROUTES.map((r) => (
                <Chip key={r} on={route === r} onClick={() => setRoute(r)}>{ROUTE_LABEL[r]}</Chip>
              ))}
              <Chip on={route === null} onClick={() => setRoute(null)}>Padrão</Chip>
            </div>
          </Row>

          <Row label={`Conversão · ${a10}/10`}>
            <input type="range" min={0} max={10} value={a10} onChange={(e) => setA10(+e.target.value)} className="w-full accent-[#C6FF3D]" />
          </Row>

          <Row label="Segmento">
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className="h-9 w-full rounded border border-line bg-bg px-2 text-ink">
              {SEGMENTS.map((s) => <option key={s} value={s}>{s || '(nenhum)'}</option>)}
            </select>
          </Row>

          <Row label={`timeScale · ${ts.toFixed(2)}`}>
            <input
              type="range" min={5} max={200} value={Math.round(ts * 100)}
              onChange={(e) => { const v = +e.target.value / 100; setTs(v); engineRef.current?.setTimeScale(v, 200) }}
              className="w-full accent-[#C6FF3D]"
            />
          </Row>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip on={std} onClick={toggleStd}>{std ? 'Desligar STD' : 'Ligar STD'}</Chip>
            <Chip on={false} onClick={replayStd}>Repetir clímax</Chip>
            <Chip on={false} onClick={coldOpen}>Cold open</Chip>
            <Chip on={panelSim} onClick={() => setPanelSim((p) => !p)}>Painel 46%</Chip>
            <Chip on={stats.degraded} onClick={() => engineRef.current?.setDegraded(!stats.degraded)}>Degradar</Chip>
          </div>

          <p className="mt-3 tabular normal-case tracking-normal">
            Chegadas {arrivals.total} · qualificadas (signal) {arrivals.qualified} · vazamentos {arrivals.leaks}
            {arrivals.total + arrivals.leaks > 0 && ` · conv. observada ${Math.round((arrivals.total / (arrivals.total + arrivals.leaks)) * 100)}%`}
          </p>
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
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded border px-3 ${on ? 'border-signal text-signal' : 'border-line text-ink'}`}
    >
      {children}
    </button>
  )
}

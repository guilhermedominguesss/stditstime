import {
  LEAK_SPLIT_VISUAL, ROUTE_FLOW_MULT, STD_LEAK_EFFECT, VISUAL_DEFAULT_A10,
  type LeakId, type RouteId,
} from '../config'
import { convProjected, convToday, spawnRate } from '../math'
import { COLORS, FONTS } from '../tokens'
import { Emitter } from './emitter'
import { clamp01, easeInCubic, easeInOutCubic, easeOutExpo, Tween } from './easing'
import {
  EXIT_SIDE, FunnelLut, LEAK_IDS, MOUTH_Y, NODE_Y, SHAPES, WORLD_H, WORLD_W,
  cloneShape, lerpShape, type Shape,
} from './geometry'
import { SCENES, type EngineScene, type SceneDef } from './scenes'

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export interface EngineInputs {
  leads: number
  route: RouteId | null
  a10: number | null
  /** liga o rastro de "R$" (cena do ticket em diante) */
  ticket: number | null
  segmentLabel: string | null
}

export interface EngineEvents extends Record<string, unknown> {
  /** partícula chegou ao WhatsApp. x/y em px CSS (posição do nó na tela) */
  arrive: { x: number; y: number; qualified: boolean }
  leak: { exit: LeakId }
  'std:phase': { phase: 'slow' | 'dark' | 'sweep' | 'membrane' | 'exits' | 'running' | 'done' }
  'single:done': undefined
  degrade: { fps: number }
}

export interface EngineStats {
  fps: number
  active: number
  degraded: boolean
  timeScale: number
}

/* ------------------------------------------------------------------ */
/* Constantes de render/física (visuais, não negócio)                  */
/* ------------------------------------------------------------------ */

const POOL = 600
const DEGRADED_POOL = 300
/**
 * Cauda das partículas: desenhada a partir do deslocamento do último frame (× TAIL_FRAMES),
 * em dois trechos de alpha decrescente. O canvas é limpo todo frame: sem fantasmas de
 * "rastro por alpha" (que nunca converge em 8 bits) e a cauda encolhe sozinha no slow-motion.
 */
const TAIL_FRAMES = 12
const TAIL_MAX = 52
const DPR_MAX = 2
/** altura lógica que o enquadramento base precisa mostrar inteira (boca → contador do nó) */
const ROI_H = 520
const BASE_V = 72
const GRAVITY_FREE = 340
const LEAK_STEER_WINDOW = 120
/** velocidade lateral máxima (unidades lógicas/s) ao mirar uma saída: sem "arcos" */
const MAX_STEER_V = 55
const EXIT_GAP = 9
const CHAOS_RATE = 22
const NODE_R = 13
const FPS_FLOOR = 45
const FPS_FLOOR_MS = 2000

// estados de partícula
const DEAD = 0, FALL = 1, FUNNEL = 2, LEAK = 3, NURT = 4, SINGLE = 5
// destinos (fate)
const F_Q = 0, F_PRECO = 1, F_CUR = 2, F_CTX = 3, F_NURT = 4
const FATE_EXIT: (LeakId | null)[] = [null, 'preco', 'curioso', 'contexto', null]
/** lado para onde cada destino puxa a partícula (0 = qualquer) */
const FATE_SIDE = [0, EXIT_SIDE.preco, EXIT_SIDE.curioso, EXIT_SIDE.contexto, 1]

// baldes de cor (desenho em lote)
const C_LEAD = 0, C_LEAK = 1, C_SIGNAL = 2, C_NURT = 3, C_FLASH = 4
const BUCKET_COLORS = [COLORS.neutralLead, COLORS.leak, COLORS.signal, COLORS.nurture, COLORS.ink]

const LABELS: Record<LeakId, [string, string]> = {
  preco: ['SÓ PERGUNTOU', 'O PREÇO'],
  curioso: ['CURIOSO,', 'SEM PERFIL'],
  contexto: ['CHEGOU SEM', 'CONTEXTO'],
}

/** mistura de cor hex por t (só usada fora do loop de partículas) */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t))
  const g = Math.round(((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t))
  const bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * t))
  return `rgb(${r},${g},${bl})`
}

const seg = (el: number, a: number, b: number) => clamp01((el - a) / (b - a))

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

export class FunnelEngine {
  private events = new Emitter<EngineEvents>()
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private ro: ResizeObserver | null = null
  private raf = 0
  private running = false
  private paused = false
  private lastT = 0
  private cssW = 1
  private cssH = 1
  private dpr = 1

  // partículas (SoA, zero alocação no loop)
  private px = new Float32Array(POOL)
  private py = new Float32Array(POOL)
  private vx = new Float32Array(POOL)
  private vy = new Float32Array(POOL)
  private pu = new Float32Array(POOL)
  private vu = new Float32Array(POOL)
  private pr = new Float32Array(POOL)
  private age = new Float32Array(POOL)
  private phase = new Float32Array(POOL)
  private flash = new Float32Array(POOL)
  private qx = new Float32Array(POOL) // posição no frame anterior (cauda)
  private qy = new Float32Array(POOL)
  private bucket = new Uint8Array(POOL)
  private sx = new Float32Array(POOL) // início da raia (nutrição)
  private sy = new Float32Array(POOL)
  private st = new Uint8Array(POOL)
  private fate = new Uint8Array(POOL)
  private crossed = new Uint8Array(POOL)
  private swept = new Uint8Array(POOL)
  private cursor = 0
  private active = 0
  private maxActive = POOL
  private spawnAcc = 0
  private singleSpawned = false

  // destinos determinísticos (déficit): a proporção na tela bate com a conta
  private probs = new Float32Array(5)
  private counts = new Float32Array(5)
  private fateTotal = 0

  // geometria
  private lut = new FunnelLut()
  private shape: Shape = cloneShape(SHAPES.default)
  private shapeFrom: Shape = cloneShape(SHAPES.default)
  private shapeTo: Shape = cloneShape(SHAPES.default)
  private morph = new Tween(1)

  // câmera e viewport
  private camX = new Tween(195)
  private camY = new Tween(270)
  private camZ = new Tween(1)
  private vpTop = new Tween(0)
  private vpBottom = new Tween(0)
  private vpSet = false

  // cena
  private sceneName: EngineScene = 'void'
  private scene: SceneDef = SCENES.void
  private wallsP = new Tween(0)
  private exitsP = new Tween(0)
  private labelP = new Tween(0)
  private timeScale = new Tween(1)

  // entradas
  private inputs: EngineInputs = { leads: 100, route: null, a10: null, ticket: null, segmentLabel: null }
  private counterShown = new Tween(0)

  // STD
  private stdStart = -1
  private stdApplied = false
  private stdDoneEmitted = false
  private lastPhase = ''
  private v = { dark: 0, sweepY: -1, memP: 0, precoScale: 1, ctxOpen: 1, seal: 0, curOpen: 1, laneP: 0, wallBright: 0 }

  // efeitos
  private exitAct: Record<LeakId, number> = { preco: 0, curioso: 0, contexto: 0 }
  private ripX = new Float32Array(8)
  private ripAge = new Float32Array(8).fill(9)
  private ripI = 0
  private pulseAge = new Float32Array(6).fill(9)
  private pulseI = 0
  private moneyX = new Float32Array(24)
  private moneyY = new Float32Array(24)
  private moneyAge = new Float32Array(24).fill(9)
  private moneyI = 0

  // performance
  private trail = true
  private degraded = false
  private fps = 60
  private fpsFrames = 0
  private fpsAcc = 0
  private lowSince = -1
  private startedAt = 0
  private fontReady = false

  private arrivePayload = { x: 0, y: 0, qualified: false }
  private leakPayload: { exit: LeakId } = { exit: 'preco' }

  /* ----------------------------- API ------------------------------ */

  on<K extends keyof EngineEvents>(name: K, cb: (p: EngineEvents[K]) => void) {
    return this.events.on(name, cb)
  }

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.lut.build(this.shape)
    this.recomputeProbs()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    document.addEventListener('visibilitychange', this.onVisibility)
    document.fonts?.ready.then(() => { this.fontReady = true }).catch(() => {})
    this.running = true
    this.startedAt = performance.now()
    this.lastT = this.startedAt
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.ro?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.events.clear()
    this.canvas = null
    this.ctx = null
  }

  pause() { this.paused = true }
  resume() {
    if (!this.paused) return
    this.paused = false
    this.lastT = performance.now()
    this.lowSince = -1
  }

  /** Área visível do palco, em px CSS a partir do topo do canvas (entre HUD e painel). */
  setViewport(top: number, bottom: number, ms = 420) {
    const now = performance.now()
    if (!this.vpSet) {
      this.vpSet = true
      ms = 0
    }
    this.vpTop.set(top, ms, now)
    this.vpBottom.set(bottom, ms, now)
  }

  setScene(name: EngineScene) {
    const now = performance.now()
    const def = SCENES[name]
    this.sceneName = name
    this.scene = def
    const ms = def.camMs ?? 900
    this.camX.set(def.cam.cx, ms, now)
    this.camY.set(def.cam.cy, ms, now)
    this.camZ.set(def.cam.zoom, ms, now)
    if (def.walls && this.wallsP.target < 1) this.wallsP.set(1, 900, now, easeInOutCubic)
    if (!def.walls && this.wallsP.target > 0) this.wallsP.set(0, 300, now)
    this.exitsP.set(def.exits ? 1 : 0, def.exits ? 700 : 300, now)
    if (name === 'cold_single') this.singleSpawned = false
    this.recomputeProbs()
  }

  setInputs(p: Partial<EngineInputs>) {
    const now = performance.now()
    const prevRoute = this.inputs.route
    this.inputs = { ...this.inputs, ...p }
    if (p.route !== undefined && p.route !== prevRoute) {
      // morph a partir do formato atual (mesmo no meio de outro morph)
      lerpShape(this.shapeFrom, this.shape, this.shape, 0)
      const to = SHAPES[p.route ?? 'default']
      lerpShape(this.shapeTo, to, to, 0)
      this.morph.value = 0
      this.morph.set(1, 700, now, easeOutExpo)
    }
    if (p.segmentLabel !== undefined) {
      this.labelP.value = 0
      this.labelP.set(p.segmentLabel ? 1 : 0, 700, now, (t) => t)
    }
    this.recomputeProbs()
  }

  /** Liga/desliga o STD. Ligar dispara a timeline do clímax (2,4s). */
  setStd(on: boolean) {
    if (on) {
      this.stdStart = performance.now()
      this.stdApplied = false
      this.stdDoneEmitted = false
      this.lastPhase = ''
      this.setTimeScale(0.12, 280)
    } else {
      this.stdStart = -1
      this.stdApplied = false
      this.timeScale.set(1, 0, 0)
      Object.assign(this.v, { dark: 0, sweepY: -1, memP: 0, precoScale: 1, ctxOpen: 1, seal: 0, curOpen: 1, laneP: 0, wallBright: 0 })
      for (let i = 0; i < POOL; i++) { this.crossed[i] = 0; this.swept[i] = 0 }
      this.recomputeProbs()
      this.reassignFates()
    }
  }

  get stdOn() { return this.stdApplied }

  setTimeScale(v: number, ms = 0) {
    this.timeScale.set(v, ms, performance.now(), v < this.timeScale.value ? easeOutExpo : easeInCubic)
  }

  /** Para o /lab: força (ou desfaz) a degradação. */
  setDegraded(on: boolean) {
    this.degraded = on
    this.maxActive = on ? DEGRADED_POOL : POOL
    this.trail = !on
    this.lowSince = -1
  }

  getStats(): EngineStats {
    return { fps: this.fps, active: this.active, degraded: this.degraded, timeScale: this.timeScale.value }
  }

  /** Posição do nó do WhatsApp na tela (px CSS), para os balões do DOM. */
  nodeScreen(out = { x: 0, y: 0 }) {
    return this.toScreen(this.lut.cxAt(NODE_Y), NODE_Y + NODE_R, out)
  }

  toScreen(lx: number, ly: number, out = { x: 0, y: 0 }) {
    const s = this.cssScale()
    const top = this.vpTop.value, bottom = this.vpBottom.value || this.cssH
    out.x = this.cssW / 2 + (lx - this.camX.value) * s
    out.y = (top + bottom) / 2 + (ly - this.camY.value) * s
    return out
  }

  /* --------------------------- internos --------------------------- */

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.pause()
    else this.resume()
  }

  private resize() {
    const c = this.canvas
    if (!c) return
    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX)
    this.cssW = Math.max(1, c.clientWidth)
    this.cssH = Math.max(1, c.clientHeight)
    c.width = Math.round(this.cssW * this.dpr)
    c.height = Math.round(this.cssH * this.dpr)
    if (!this.vpSet) {
      this.vpTop.value = 0
      this.vpBottom.value = this.cssH
    }
    if (this.ctx) {
      this.ctx.fillStyle = COLORS.bg
      this.ctx.fillRect(0, 0, c.width, c.height)
    }
  }

  /** escala base (px CSS por unidade lógica) × zoom */
  private cssScale() {
    const vpH = Math.max(80, (this.vpBottom.value || this.cssH) - this.vpTop.value)
    return Math.min(this.cssW / WORLD_W, vpH / ROI_H) * this.camZ.value
  }

  private recomputeProbs() {
    const p = this.probs
    p.fill(0)
    if (!this.scene.exits && !this.stdApplied) {
      p[F_Q] = 1
    } else {
      const a10 = this.inputs.a10 ?? VISUAL_DEFAULT_A10
      const split = LEAK_SPLIT_VISUAL[this.inputs.route ?? 'default']
      if (!this.stdApplied) {
        const q = convToday(a10)
        p[F_Q] = q
        p[F_PRECO] = (1 - q) * split.preco
        p[F_CUR] = (1 - q) * split.curioso
        p[F_CTX] = (1 - q) * split.contexto
      } else {
        const q = convProjected(a10)
        const rest = 1 - q
        p[F_Q] = q
        p[F_PRECO] = rest * split.preco * STD_LEAK_EFFECT.precoScale
        p[F_CTX] = rest * split.contexto * STD_LEAK_EFFECT.contextoScale
        p[F_NURT] = Math.max(0, rest - p[F_PRECO] - p[F_CTX])
      }
    }
    this.counts.fill(0)
    this.fateTotal = 0
  }

  /**
   * Escolhe o destino com maior déficit (esperado − realizado). Determinístico: a
   * proporção na tela bate com a conta. Com `u` (posição lateral atual), dá preferência
   * a destinos do mesmo lado, para ninguém atravessar o funil inteiro.
   */
  private pickFate(u = 0): number {
    const n = this.fateTotal + 1
    let best = 0, bestD = -Infinity
    for (let k = 0; k < 5; k++) {
      if (this.probs[k] <= 0) continue
      let d = this.probs[k] * n - this.counts[k]
      if (u !== 0) {
        const side = FATE_SIDE[k]
        if (side !== 0) d += side * u > 0 ? 0.6 : -0.6
      }
      if (d > bestD) { bestD = d; best = k }
    }
    this.counts[best]++
    this.fateTotal = n
    return best
  }

  /** Redistribui destinos de quem ainda não passou da membrana (STD ligando). */
  private reassignFates() {
    for (let i = 0; i < POOL; i++) {
      if (this.st[i] === FUNNEL && this.py[i] < this.shape.membraneY - 10) this.fate[i] = this.pickFate(this.pu[i])
    }
  }

  private alloc(): number {
    if (this.active >= this.maxActive) return -1
    for (let n = 0; n < POOL; n++) {
      const i = (this.cursor + n) % POOL
      if (this.st[i] === DEAD) {
        this.cursor = (i + 1) % POOL
        this.active++
        this.age[i] = 0
        this.flash[i] = 0
        this.crossed[i] = 0
        this.swept[i] = 0
        this.phase[i] = Math.random() * 6.283
        this.pr[i] = 1.2 + Math.random() * 1.4
        return i
      }
    }
    return -1
  }

  private kill(i: number) {
    this.st[i] = DEAD
    this.active--
  }

  private spawnFunnel() {
    const i = this.alloc()
    if (i < 0) return
    this.st[i] = FUNNEL
    const f = this.pickFate()
    this.fate[i] = f
    // nasce do lado do destino: vazamento à esquerda nasce à esquerda etc.
    const side = FATE_SIDE[f]
    this.pu[i] = side === 0 ? (Math.random() * 2 - 1) * 0.85 : side * (f === F_NURT ? 0.3 + Math.random() * 0.6 : 0.55 + Math.random() * 0.4)
    this.vu[i] = 0
    this.py[i] = -12 + Math.random() * 56
    this.vy[i] = BASE_V * (0.8 + Math.random() * 0.4)
  }

  private spawnChaos() {
    const i = this.alloc()
    if (i < 0) return
    this.st[i] = FALL
    this.px[i] = 10 + Math.random() * (WORLD_W - 20)
    this.py[i] = -20 - Math.random() * 20
    this.vx[i] = (Math.random() * 2 - 1) * 10
    this.vy[i] = 50 + Math.random() * 70
  }

  private spawnSingle() {
    const i = this.alloc()
    if (i < 0) return
    this.st[i] = SINGLE
    this.px[i] = WORLD_W / 2
    this.py[i] = -40
    this.vx[i] = 0
    this.vy[i] = 58
    this.pr[i] = 2.4
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    if (this.paused) return
    const realMs = Math.min(now - this.lastT, 33)
    const rawMs = now - this.lastT
    this.lastT = now
    this.measure(rawMs, now)
    this.updateTimeline(now)
    const ts = this.timeScale.update(now)
    this.update((realMs / 1000) * ts, realMs / 1000, now)
    this.render(now)
  }

  private measure(rawMs: number, now: number) {
    // travada isolada (>250ms) não é lentidão de render: num aparelho lento os frames
    // ficam em 30–40ms. Ignora para não degradar por engano.
    if (rawMs > 250) return
    this.fpsFrames++
    this.fpsAcc += rawMs
    if (this.fpsAcc >= 500) {
      this.fps = (this.fpsFrames * 1000) / this.fpsAcc
      this.fpsFrames = 0
      this.fpsAcc = 0
      if (this.degraded || now - this.startedAt < 2500) return
      if (this.fps < FPS_FLOOR) {
        if (this.lowSince < 0) this.lowSince = now
        else if (now - this.lowSince >= FPS_FLOOR_MS) {
          this.setDegraded(true)
          this.events.emit('degrade', { fps: this.fps })
        }
      } else this.lowSince = -1
    }
  }

  /* ------------------------ timeline do STD ------------------------ */

  private phaseEmit(p: EngineEvents['std:phase']['phase']) {
    if (this.lastPhase === p) return
    this.lastPhase = p
    this.events.emit('std:phase', { phase: p })
  }

  private updateTimeline(now: number) {
    if (this.stdStart < 0) return
    const el = now - this.stdStart
    const v = this.v
    v.dark = el < 1900 ? 0.6 * easeOutExpo(seg(el, 280, 500)) : 0.6 * (1 - easeInOutCubic(seg(el, 1900, 2400)))
    v.sweepY = el >= 500 && el < 1150 ? (MOUTH_Y - 40) + (this.shape.membraneY - MOUTH_Y + 40) * easeInOutCubic(seg(el, 500, 1100)) : -1
    v.memP = easeOutExpo(seg(el, 1100, 1500))
    v.precoScale = 1 - 0.5 * easeOutExpo(seg(el, 1500, 1900))
    v.ctxOpen = 1 - easeOutExpo(seg(el, 1500, 1750))
    v.seal = seg(el, 1580, 1900)
    v.curOpen = 1 - easeOutExpo(seg(el, 1500, 1750))
    v.laneP = easeInOutCubic(seg(el, 1550, 1900))
    v.wallBright = easeInOutCubic(seg(el, 1900, 2400))

    if (el < 280) this.phaseEmit('slow')
    else if (el < 500) this.phaseEmit('dark')
    else if (el < 1100) this.phaseEmit('sweep')
    else if (el < 1500) this.phaseEmit('membrane')
    else if (el < 1900) this.phaseEmit('exits')
    if (el >= 1900 && !this.stdApplied) {
      this.stdApplied = true
      this.recomputeProbs()
      this.reassignFates()
      this.setTimeScale(1, 500)
      this.phaseEmit('running')
    }
    if (el >= 2400 && !this.stdDoneEmitted) {
      this.stdDoneEmitted = true
      this.phaseEmit('done')
    }
  }

  /* ---------------------------- física ---------------------------- */

  private update(dt: number, realDt: number, now: number) {
    // geometria (morph de rota)
    if (this.morph.active) {
      this.morph.update(now)
      lerpShape(this.shape, this.shapeFrom, this.shapeTo, this.morph.value)
      this.lut.build(this.shape)
    }
    this.camX.update(now); this.camY.update(now); this.camZ.update(now)
    this.vpTop.update(now); this.vpBottom.update(now)
    this.wallsP.update(now); this.exitsP.update(now); this.labelP.update(now)

    const a10 = this.inputs.a10 ?? VISUAL_DEFAULT_A10
    const conv = this.stdApplied ? convProjected(a10) : this.scene.exits ? convToday(a10) : 1
    const target = Math.round(this.inputs.leads * conv)
    if (target !== this.counterShown.target) this.counterShown.set(target, 900, now)
    this.counterShown.update(now)

    // decaimentos em tempo real (efeitos não congelam com o slow-motion, só desaceleram)
    const decay = Math.exp(-realDt * 3)
    for (const k of LEAK_IDS) this.exitAct[k] *= decay
    for (let r = 0; r < 8; r++) this.ripAge[r] += realDt
    for (let r = 0; r < 6; r++) this.pulseAge[r] += realDt
    for (let r = 0; r < 24; r++) this.moneyAge[r] += realDt

    // nascimento
    const mode = this.scene.mode
    if (mode === 'funnel') {
      this.spawnAcc += spawnRate(this.inputs.leads) * ROUTE_FLOW_MULT[this.inputs.route ?? 'default'] * dt
    } else if (mode === 'chaos') {
      this.spawnAcc += CHAOS_RATE * dt
    } else if (mode === 'single' && !this.singleSpawned) {
      this.singleSpawned = true
      this.spawnSingle()
    }
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1
      if (mode === 'funnel') this.spawnFunnel()
      else if (mode === 'chaos') this.spawnChaos()
    }
    if (mode !== 'funnel' && mode !== 'chaos') this.spawnAcc = 0

    const lut = this.lut
    const shape = this.shape
    const hwMouth = lut.hw[MOUTH_Y]
    const sweepY = this.v.sweepY
    const flashDecay = Math.exp(-realDt * 5)
    const dampU = Math.exp(-dt * 1.5)
    const ctxClosed = this.stdApplied

    for (let i = 0; i < POOL; i++) {
      const s = this.st[i]
      if (s === DEAD) continue
      this.qx[i] = this.px[i]
      this.qy[i] = this.py[i]
      this.age[i] += dt
      this.flash[i] *= flashDecay
      const t = this.age[i]
      const ph = this.phase[i]

      if (s === FUNNEL) {
        const y = this.py[i]
        const hw = lut.hwAt(y)
        let vt = BASE_V * Math.min(3.2, Math.sqrt(hwMouth / hw))
        if (shape.gate > 0.01) {
          const d = Math.abs(y - shape.gateY)
          if (d < 22) vt *= 1 - shape.gate * 0.9 * (1 - d / 22)
        }
        this.vy[i] += (vt - this.vy[i]) * Math.min(1, dt * 3)
        const ny = y + this.vy[i] * dt

        // lateral (espaço normalizado u ∈ [-1, 1] da meia-largura)
        let noise = Math.sin(t * 1.6 + ph) * 0.55 + Math.sin(t * 0.7 + ph * 2.1 + y * 0.015) * 0.35
        if (shape.turb > 0.01) {
          const dT = Math.abs(y - shape.turbY)
          if (dT < 75) noise += shape.turb * (1 - dT / 75) * Math.sin(t * 5 + ph * 3) * 2.4
        }
        let u = this.pu[i]
        this.vu[i] += (noise * 0.9 - u * 0.6) * dt
        this.vu[i] *= dampU

        const f = this.fate[i]
        const exit = FATE_EXIT[f]
        let steerY = -1, side = 0
        if (exit) { steerY = shape.exitY[exit]; side = EXIT_SIDE[exit] }
        else if (f === F_NURT) { steerY = this.shape.membraneY; side = 1 }
        let limit = 0.94
        if (side !== 0 && ny > steerY - LEAK_STEER_WINDOW && ny < steerY + 4) {
          let du = (side * 1.0 - u) * Math.min(1, dt * 3.5)
          const maxDu = (MAX_STEER_V * dt) / hw
          if (du > maxDu) du = maxDu
          else if (du < -maxDu) du = -maxDu
          u += du
          limit = 1.02
        }
        u += this.vu[i] * dt
        if (u > limit) { u = limit; this.vu[i] *= -0.4 }
        else if (u < -limit) { u = -limit; this.vu[i] *= -0.4 }
        this.pu[i] = u
        this.py[i] = ny

        // varredura do STD: cada partícula pisca uma vez
        if (sweepY >= 0 && !this.swept[i] && Math.abs(ny - sweepY) < 7) {
          this.swept[i] = 1
          this.flash[i] = 1
        }

        // vazamento
        if (exit && ny >= steerY - 3) {
          const open = this.exitOpen(exit)
          if (open < 0.05 || (exit === 'contexto' && ctxClosed) || (exit === 'curioso' && ctxClosed)) {
            this.fate[i] = ctxClosed ? (ny < this.shape.membraneY ? F_NURT : F_Q) : F_Q
          } else {
            this.toLeak(i, exit)
            continue
          }
        }

        // membrana
        if (y < this.shape.membraneY && ny >= this.shape.membraneY) {
          this.crossed[i] = 1
          if (this.v.memP > 0.5) this.ripple(lut.cxAt(ny) + u * lut.hwAt(ny))
          if (this.fate[i] === F_NURT && this.v.laneP > 0.5) {
            this.st[i] = NURT
            this.sx[i] = lut.cxAt(ny) + u * lut.hwAt(ny)
            this.sy[i] = ny
            this.pu[i] = 0
            continue
          }
        }

        // chegada no WhatsApp
        if (ny >= NODE_Y) {
          this.arrive(i)
          continue
        }
        this.px[i] = lut.cxAt(ny) + u * lut.hwAt(ny)
      } else if (s === LEAK) {
        this.vy[i] += GRAVITY_FREE * dt
        this.vx[i] *= Math.exp(-dt * 0.6)
        this.px[i] += this.vx[i] * dt
        this.py[i] += this.vy[i] * dt
        if (this.py[i] > WORLD_H + 40 || this.px[i] < -60 || this.px[i] > WORLD_W + 60) this.kill(i)
      } else if (s === NURT) {
        let k = this.pu[i] + dt * 0.55
        if (k >= 1) { this.kill(i); continue }
        this.pu[i] = k
        const my = this.shape.membraneY
        const c1x = lut.wallX(my, 1) + 46, c1y = my + 6
        const ex = WORLD_W + 40, ey = my + 190
        const a = 1 - k
        this.px[i] = a * a * this.sx[i] + 2 * a * k * c1x + k * k * ex + Math.sin(t * 3 + ph) * 2
        this.py[i] = a * a * this.sy[i] + 2 * a * k * c1y + k * k * ey
      } else if (s === FALL) {
        this.vx[i] += Math.sin(t * 1.3 + ph) * 6 * dt
        this.px[i] += this.vx[i] * dt
        this.py[i] += this.vy[i] * dt
        if (this.py[i] > WORLD_H + 20) this.kill(i)
      } else if (s === SINGLE) {
        this.py[i] += this.vy[i] * dt
        if (this.py[i] > WORLD_H + 20) {
          this.kill(i)
          this.events.emit('single:done', undefined)
        }
      }
    }
  }

  private exitOpen(k: LeakId) {
    const base = k === 'preco' ? this.v.precoScale : k === 'contexto' ? this.v.ctxOpen : this.v.curOpen
    return this.exitsP.value * base
  }

  private toLeak(i: number, exit: LeakId) {
    const side = EXIT_SIDE[exit]
    const y = this.py[i]
    this.px[i] = this.lut.cxAt(y) + this.pu[i] * this.lut.hwAt(y)
    this.vx[i] = side * (55 + Math.random() * 55)
    this.vy[i] = this.vy[i] * 0.35
    this.st[i] = LEAK
    this.exitAct[exit] = Math.min(1.6, this.exitAct[exit] + 0.35)
    if (this.scene.money && Math.random() < 0.55) {
      const m = this.moneyI++ % 24
      this.moneyX[m] = this.px[i] + side * 10
      this.moneyY[m] = y
      this.moneyAge[m] = 0
    }
    this.leakPayload.exit = exit
    this.events.emit('leak', this.leakPayload)
  }

  private arrive(i: number) {
    const qualified = this.stdApplied && this.crossed[i] === 1 && this.fate[i] === F_Q
    this.kill(i)
    this.pulseAge[this.pulseI++ % 6] = 0
    this.nodeScreen(this.arrivePayload)
    this.arrivePayload.qualified = qualified
    this.events.emit('arrive', this.arrivePayload)
  }

  private ripple(x: number) {
    const r = this.ripI++ % 8
    this.ripX[r] = x
    this.ripAge[r] = 0
  }

  /* ---------------------------- render ---------------------------- */

  private render(now: number) {
    const ctx = this.ctx
    const c = this.canvas
    if (!ctx || !c) return
    const dpr = this.dpr
    const W = c.width, H = c.height

    // 1) rastro: pinta o fundo com alpha em vez de limpar
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, W, H)

    // 2) câmera
    const sCss = this.cssScale()
    const S = sCss * dpr
    const top = this.vpTop.value, bottom = this.vpBottom.value || this.cssH
    const ox = (this.cssW / 2) * dpr - this.camX.value * S
    const oy = ((top + bottom) / 2) * dpr - this.camY.value * S
    ctx.setTransform(S, 0, 0, S, ox, oy)
    const px1 = dpr / S // 1 px CSS em unidades lógicas... × dpr = 1 px de tela
    const cssPx = 1 / sCss // 1 px CSS em unidades lógicas

    // 3) partículas, em lote por cor (cauda em 2 trechos + cabeça)
    const minR = 0.7 * px1
    const stdOn = this.stdApplied
    const bk = this.bucket
    for (let i = 0; i < POOL; i++) {
      const s = this.st[i]
      if (s === DEAD) continue
      if (this.flash[i] > 0.35) bk[i] = C_FLASH
      else if (s === LEAK) bk[i] = C_LEAK
      else if (s === NURT) bk[i] = C_NURT
      else if (stdOn && this.crossed[i] && this.fate[i] === F_Q) bk[i] = C_SIGNAL
      else bk[i] = C_LEAD
    }
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(px1, 2.2)
    for (let b = 0; b < 5; b++) {
      ctx.strokeStyle = BUCKET_COLORS[b]
      ctx.fillStyle = BUCKET_COLORS[b]
      if (this.trail) {
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath()
          let any = false
          const a0 = pass === 0 ? 0.5 : 0, a1 = pass === 0 ? 1 : 0.5
          for (let i = 0; i < POOL; i++) {
            if (this.st[i] === DEAD || bk[i] !== b || this.age[i] < 0.05) continue
            let dx = (this.qx[i] - this.px[i]) * TAIL_FRAMES
            let dy = (this.qy[i] - this.py[i]) * TAIL_FRAMES
            const len = Math.sqrt(dx * dx + dy * dy)
            if (len < 0.6) continue
            if (len > TAIL_MAX) { const k = TAIL_MAX / len; dx *= k; dy *= k }
            ctx.moveTo(this.px[i] + dx * a0, this.py[i] + dy * a0)
            ctx.lineTo(this.px[i] + dx * a1, this.py[i] + dy * a1)
            any = true
          }
          if (any) {
            ctx.globalAlpha = pass === 0 ? 0.42 : 0.16
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      let any = false
      for (let i = 0; i < POOL; i++) {
        if (this.st[i] === DEAD || bk[i] !== b) continue
        const r = Math.max(minR, this.pr[i] * (b === C_FLASH ? 1.5 : 1))
        ctx.moveTo(this.px[i] + r, this.py[i])
        ctx.arc(this.px[i], this.py[i], r, 0, 6.2832)
        any = true
      }
      if (any) ctx.fill()
    }

    // 4) escurecimento fora do funil (clímax)
    if (this.v.dark > 0.005) this.drawOutsideDark(this.v.dark)

    const wallsP = this.wallsP.value
    if (wallsP > 0.001) this.drawWalls(wallsP, px1)
    if (this.shape.gate > 0.02 && wallsP > 0.5) this.drawGate(px1)
    if (this.exitsP.value > 0.01) this.drawExitLabels(cssPx)
    if (this.v.laneP > 0.01) this.drawLane(cssPx, px1)
    if (this.v.memP > 0.01) this.drawMembrane(cssPx, px1)
    if (this.v.sweepY >= 0) this.drawSweep(px1)
    if (wallsP > 0.6) this.drawNode(cssPx, px1, wallsP)
    if (this.labelP.value > 0.01 && this.inputs.segmentLabel) this.drawSegmentLabel(cssPx)
    this.drawMoney(cssPx)
    void now
  }

  private font(sizeCss: number, cssPx: number, weight = 400, family: string = FONTS.mono) {
    const ctx = this.ctx!
    ctx.font = `${weight} ${sizeCss * cssPx}px ${family}`
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = family === FONTS.mono ? `${0.08 * sizeCss * cssPx}px` : '0px'
  }

  private funnelPath(ctx: CanvasRenderingContext2D) {
    const lut = this.lut
    const y0 = MOUTH_Y, y1 = NODE_Y
    ctx.moveTo(lut.wallX(y0, -1), y0)
    for (let y = y0; y <= y1; y += 6) ctx.lineTo(lut.wallX(y, -1), y)
    ctx.lineTo(lut.wallX(y1, -1), y1)
    for (let y = y1; y >= y0; y -= 6) ctx.lineTo(lut.wallX(y, 1), y)
    ctx.closePath()
  }

  private drawOutsideDark(a: number) {
    const ctx = this.ctx!
    ctx.globalAlpha = a
    ctx.fillStyle = COLORS.bg
    ctx.beginPath()
    ctx.rect(-2000, -2000, 4390, 4844)
    this.funnelPath(ctx)
    ctx.fill('evenodd')
    ctx.globalAlpha = 1
  }

  private gapAt(y: number, side: number): boolean {
    const ex = this.exitsP.value
    if (ex > 0.01) {
      for (const k of LEAK_IDS) {
        if (EXIT_SIDE[k] !== side) continue
        const open = this.exitOpen(k)
        if (open < 0.02) continue
        const g = EXIT_GAP * open * (1 + 0.15 * Math.min(1, this.exitAct[k]))
        if (Math.abs(y - this.shape.exitY[k]) < g) return true
      }
    }
    if (side === 1 && this.v.laneP > 0.01 && Math.abs(y - this.shape.membraneY) < 10 * this.v.laneP) return true
    return false
  }

  private drawWalls(p: number, px1: number) {
    const ctx = this.ctx!
    const lut = this.lut
    const yEnd = MOUTH_Y + (NODE_Y - MOUTH_Y) * p
    ctx.lineWidth = 1.25 * px1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = mix(COLORS.line, COLORS.inkMuted, 0.32 + 0.3 * this.v.wallBright)
    ctx.beginPath()
    for (let side = -1; side <= 1; side += 2) {
      let pen = false
      for (let y = MOUTH_Y; y <= yEnd; y += 3) {
        if (this.gapAt(y, side)) { pen = false; continue }
        const x = lut.wallX(y, side)
        if (!pen) { ctx.moveTo(x, y); pen = true } else ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  private drawGate(px1: number) {
    const ctx = this.ctx!
    const y = this.shape.gateY
    const l = this.lut.wallX(y, -1), r = this.lut.wallX(y, 1)
    ctx.globalAlpha = this.shape.gate * 0.8
    ctx.strokeStyle = COLORS.inkMuted
    ctx.lineWidth = 1 * px1
    ctx.setLineDash([3 * px1 * 2, 4 * px1 * 2])
    ctx.beginPath()
    ctx.moveTo(l + 3, y)
    ctx.lineTo(r - 3, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawExitLabels(cssPx: number) {
    const ctx = this.ctx!
    const lut = this.lut
    this.font(8.5, cssPx, 500)
    ctx.textBaseline = 'middle'
    const lh = 11 * cssPx
    for (const k of LEAK_IDS) {
      const side = EXIT_SIDE[k]
      const y = this.shape.exitY[k]
      const act = Math.min(1, this.exitAct[k])
      let alpha = this.exitsP.value * (0.5 + 0.5 * act)
      let color: string = COLORS.leak
      const transformed = (k === 'contexto' || k === 'curioso') ? 1 - (k === 'contexto' ? this.v.ctxOpen : this.v.curOpen) : 0
      if (k === 'preco') alpha *= 0.65 + 0.35 * this.v.precoScale
      if (transformed > 0) {
        color = mix(COLORS.leak, COLORS.inkMuted, transformed)
        alpha = Math.max(alpha * (1 - transformed), this.exitsP.value * 0.45 * transformed)
        if (k === 'curioso') alpha *= 1 - this.v.laneP * 0.75
      }
      // acima da saída, longe do jato de vazamento
      const ly = y - 9 * cssPx - lh
      const wx = lut.wallX(y, side)
      const [l1, l2] = LABELS[k]
      const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width)
      let x = wx + side * 9 * cssPx
      if (side < 0) x = Math.max(x, w + 4 * cssPx + this.visibleLeft())
      else x = Math.min(x, this.visibleRight() - w - 4 * cssPx)
      this.tag(l1, l2, x, ly, side < 0 ? 'right' : 'left', color, alpha, cssPx)
      if (k === 'contexto' && transformed > 0.05) {
        // risco + selo: "sem contexto" deixou de existir
        const sx0 = side < 0 ? x - w : x
        ctx.globalAlpha = transformed * 0.9
        ctx.fillStyle = COLORS.inkMuted
        ctx.fillRect(sx0, ly + lh * 0.5 - 0.5 * cssPx, w * transformed, 1 * cssPx)
        this.drawSeal(lut.wallX(y, side), y, cssPx)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawSeal(x: number, y: number, cssPx: number) {
    const ctx = this.ctx!
    const t = this.v.seal
    if (t <= 0) return
    const sc = 1 + 0.6 * (1 - easeOutExpo(t))
    const s = 7 * cssPx * sc
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.14)
    ctx.globalAlpha = Math.min(1, t * 2)
    ctx.strokeStyle = COLORS.signal
    ctx.lineWidth = 1.2 * cssPx
    ctx.strokeRect(-s, -s, s * 2, s * 2)
    ctx.beginPath()
    ctx.moveTo(-s * 0.5, 0)
    ctx.lineTo(-s * 0.1, s * 0.4)
    ctx.lineTo(s * 0.55, -s * 0.45)
    ctx.stroke()
    ctx.restore()
  }

  /** Etiqueta de telemetria: fundo bg recortado atrás do texto (partículas passam por trás). */
  private tag(l1: string, l2: string | null, x: number, y: number, align: 'left' | 'right', color: string, alpha: number, cssPx: number) {
    const ctx = this.ctx!
    const lh = 11 * cssPx
    const w = Math.max(ctx.measureText(l1).width, l2 ? ctx.measureText(l2).width : 0)
    const x0 = align === 'right' ? x - w : x
    const pad = 3 * cssPx
    ctx.globalAlpha = alpha * 0.82
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(x0 - pad, y - lh / 2 - pad * 0.6, w + pad * 2, (l2 ? lh * 2 : lh) + pad * 1.2)
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(l1, x, y)
    if (l2) ctx.fillText(l2, x, y + lh)
    return w
  }

  private visibleLeft() {
    return this.camX.value - this.cssW / 2 / this.cssScale()
  }

  private visibleRight() {
    return this.camX.value + this.cssW / 2 / this.cssScale()
  }

  private drawLane(cssPx: number, px1: number) {
    const ctx = this.ctx!
    const my = this.shape.membraneY
    const x0 = this.lut.wallX(my, 1)
    const c1x = x0 + 46, c1y = my + 6
    const ex = WORLD_W + 40, ey = my + 190
    const p = this.v.laneP
    ctx.strokeStyle = COLORS.nurture
    ctx.lineWidth = 1.25 * px1
    ctx.setLineDash([4 * px1 * 2, 4 * px1 * 2])
    ctx.beginPath()
    for (let i = 0; i <= 24; i++) {
      const k = (i / 24) * p
      const a = 1 - k
      const x = a * a * x0 + 2 * a * k * c1x + k * k * ex
      const y = a * a * my + 2 * a * k * c1y + k * k * ey
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    // rótulo
    this.font(8.5, cssPx, 500)
    const lx = Math.min(x0 + 14 * cssPx, this.visibleRight() - ctx.measureText('NUTRIÇÃO →').width - 4 * cssPx)
    this.tag('NUTRIÇÃO →', 'CONTEÚDO', lx, my - 18 * cssPx, 'left', COLORS.inkMuted, easeOutExpo(clamp01((p - 0.5) * 2)), cssPx)
    ctx.globalAlpha = 1
  }

  private drawMembrane(cssPx: number, px1: number) {
    const ctx = this.ctx!
    const y = this.shape.membraneY
    const l = this.lut.wallX(y, -1), r = this.lut.wallX(y, 1)
    const half = (r - l) / 2
    const p = this.v.memP
    ctx.strokeStyle = COLORS.signal
    ctx.lineWidth = 1.5 * px1
    ctx.beginPath()
    // de fora para dentro
    const reach = half * p
    for (let side = -1; side <= 1; side += 2) {
      const xs = side < 0 ? l : r
      const steps = 16
      for (let s = 0; s <= steps; s++) {
        const x = xs - side * (reach * s) / steps
        let dy = 0
        for (let k = 0; k < 8; k++) {
          const ag = this.ripAge[k]
          if (ag > 1.2) continue
          const d = Math.abs(x - this.ripX[k])
          dy += 3 * Math.exp(-ag * 4) * Math.sin(d * 0.25 - ag * 18) * Math.exp(-d * 0.04)
        }
        if (s === 0) ctx.moveTo(x, y + dy)
        else ctx.lineTo(x, y + dy)
      }
    }
    ctx.stroke()
    // rótulo à esquerda da parede
    this.font(8.5, cssPx, 500)
    const t1 = 'STD · TRIAGEM', t2 = 'DINÂMICA'
    const w = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width)
    const x = Math.max(l - 9 * cssPx, w + 4 * cssPx + this.visibleLeft())
    this.tag(t1, t2, x, y - 5 * cssPx, 'right', COLORS.signal, easeOutExpo(clamp01((p - 0.3) / 0.7)), cssPx)
    ctx.globalAlpha = 1
  }

  private drawSweep(px1: number) {
    const ctx = this.ctx!
    const y = this.v.sweepY
    const L = this.visibleLeft(), R = this.visibleRight()
    const trail = 40 * px1 * 1.2
    const g = ctx.createLinearGradient(0, y - trail, 0, y)
    g.addColorStop(0, 'rgba(198,255,61,0)')
    g.addColorStop(1, 'rgba(198,255,61,0.28)')
    ctx.fillStyle = g
    ctx.fillRect(L, y - trail, R - L, trail)
    ctx.fillStyle = COLORS.signal
    ctx.fillRect(L, y - 0.5 * px1, R - L, 1 * px1)
  }

  private drawNode(cssPx: number, px1: number, wallsP: number) {
    const ctx = this.ctx!
    const x = this.lut.cxAt(NODE_Y)
    const y = NODE_Y + NODE_R
    const a = clamp01((wallsP - 0.6) / 0.4)
    const on = this.v.wallBright
    const ring = on > 0 ? mix(COLORS.inkMuted, COLORS.signal, on) : COLORS.inkMuted
    ctx.globalAlpha = a
    // pulsos de chegada
    ctx.lineWidth = 1 * px1
    for (let k = 0; k < 6; k++) {
      const ag = this.pulseAge[k]
      if (ag > 0.7) continue
      ctx.globalAlpha = a * (1 - ag / 0.7) * 0.6
      ctx.strokeStyle = ring
      ctx.beginPath()
      ctx.arc(x, y, NODE_R + ag * 30, 0, 6.2832)
      ctx.stroke()
    }
    ctx.globalAlpha = a
    ctx.fillStyle = COLORS.bgRaised
    ctx.strokeStyle = ring
    ctx.lineWidth = 1.25 * px1
    ctx.beginPath()
    ctx.arc(x, y, NODE_R, 0, 6.2832)
    ctx.fill()
    ctx.stroke()
    // glifo de conversa (balão + rabicho)
    const r = 5.2
    ctx.beginPath()
    ctx.arc(x, y - 0.5, r, 0.35 * Math.PI, 2.3 * Math.PI)
    ctx.lineTo(x - r * 0.95, y + r * 0.95)
    ctx.closePath()
    ctx.stroke()
    // contador
    this.font(10, cssPx, 500)
    ctx.fillStyle = on > 0.5 ? COLORS.signal : COLORS.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const n = Math.round(this.counterShown.value)
    ctx.fillText(`${n.toLocaleString('pt-BR')}/mês`, x, y + NODE_R + 7 * cssPx)
    this.font(8, cssPx, 400)
    ctx.fillStyle = COLORS.inkMuted
    ctx.fillText('WHATSAPP', x, y + NODE_R + 21 * cssPx)
    ctx.globalAlpha = 1
  }

  private drawSegmentLabel(cssPx: number) {
    const ctx = this.ctx!
    const label = this.inputs.segmentLabel!
    const p = this.labelP.value
    const n = Math.ceil(label.length * Math.min(1, p * 1.4))
    this.font(10, cssPx, 500)
    ctx.globalAlpha = Math.min(1, p * 2)
    ctx.fillStyle = COLORS.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(label.slice(0, n), this.lut.cxAt(MOUTH_Y), MOUTH_Y - 10 * cssPx)
    ctx.globalAlpha = 1
  }

  private drawMoney(cssPx: number) {
    const ctx = this.ctx!
    let set = false
    for (let k = 0; k < 24; k++) {
      const ag = this.moneyAge[k]
      if (ag > 0.65) continue
      if (!set) {
        this.font(7.5, cssPx, 500)
        ctx.fillStyle = COLORS.leak
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        set = true
      }
      ctx.globalAlpha = (1 - ag / 0.65) * 0.85
      ctx.fillText('R$', this.moneyX[k], this.moneyY[k] + ag * 14)
    }
    ctx.globalAlpha = 1
  }

  /** nome da cena atual (debug) */
  get currentScene() { return this.sceneName }
  /** fontes carregadas (o canvas só deve desenhar texto depois disso) */
  get fontsReady() { return this.fontReady }
}

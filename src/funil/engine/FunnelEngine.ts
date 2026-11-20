import {
  LEAK_SPLIT_VISUAL, MAX_VISIBLE, ROUTE_FLOW_MULT, VISUAL_DEFAULT_A10,
  type LeakId, type RouteId, type SegmentId,
} from '../config'
import { ENGINE_LABELS as T, SEGMENTS, type CaptionKey } from '../copy'
import { convProjected, convToday, diagnose, fmt, spawnRate, type Diagnosis } from '../math'
import { COLORS, FONTS } from '../tokens'
import { Emitter } from './emitter'
import { clamp01, easeInCubic, easeInOutCubic, easeOutCubic, easeOutExpo, Tween } from './easing'
import {
  DEPOSIT, DEPOSIT_SLOTS, EXIT_SIDE, FunnelLut, LEAK_IDS, MOUTH_Y, NODE_Y, ROI_BOTTOM, ROI_TOP,
  SHAPES, WORLD_W, cloneShape, depositSlot, lerpShape, type Shape,
} from './geometry'
import { SCENES, type EngineScene, type LabelKey, type SceneDef } from './scenes'

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export interface EngineInputs {
  leads: number
  route: RouteId | null
  a10: number | null
  /** valor médio de venda (R$). null = ainda não respondeu (sem R$ no depósito) */
  ticket: number | null
  segment: SegmentId | null
}

export type StdPhase = 'slow' | 'dark' | 'sweep' | 'membrane' | 'exits' | 'hero1' | 'hero2' | 'running' | 'done'

export interface EngineEvents extends Record<string, unknown> {
  /** partícula chegou ao WhatsApp. x/y em px CSS (centro do nó na tela) */
  arrive: { x: number; y: number; qualified: boolean }
  leak: { exit: LeakId }
  'std:phase': { phase: StdPhase }
  /** legenda de filme a exibir (null = nenhuma) */
  caption: { key: CaptionKey | null }
  /** a pessoa do cold open chegou ao WhatsApp */
  'single:done': undefined
  /** a pessoa qualificada do clímax virou mensagem no WhatsApp */
  'hero:arrive': { x: number; y: number; text: string }
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

const POOL = 128
const DEGRADED_MAX = 60
const DPR_MAX = 2
const ROI_H = ROI_BOTTOM - ROI_TOP
/** velocidade base de queda (unidades lógicas/s): 30% mais lenta que a v1 */
const BASE_V = 50
const GRAVITY_FREE = 260
const LEAK_STEER_WINDOW = 110
/** velocidade lateral máxima ao mirar uma saída: sem "arcos" atravessando o funil */
const MAX_STEER_V = 40
const EXIT_GAP = 10
/** raio das partículas em px CSS (teste do leigo: 3 a 5px) */
const R_MIN = 3
const R_MAX = 5
const HERO_R = 6.5
/** nó do WhatsApp: 64px de diâmetro na tela */
const NODE_R_CSS = 32
const FPS_FLOOR = 45
const FPS_FLOOR_MS = 2000
/** quantas partículas no depósito até o contador PERDIDOS chegar ao total do mês */
const DEPOSIT_FULL = DEPOSIT_SLOTS
const TO_DEPOSIT_S = 0.95
const LEAK_FLY_S = 0.28

/**
 * Cauda: desenhada a partir do deslocamento do último frame (× TAIL_FRAMES), em dois
 * trechos de alpha decrescente. Canvas limpo todo frame: sem fantasmas.
 */
const TAIL_FRAMES = 12
const TAIL_MAX = 44

/* Clímax (ms desde o toque em "Ligar o STD") */
const C_DARK = 280
const C_SWEEP = 500
const C_MEMBRANE = 1100
const C_EXITS = 1500
const C_HERO1 = 1900
const HERO1_MS = 3600
const C_HERO2 = C_HERO1 + HERO1_MS
const HERO2_MS = 2500
const C_RELEASE = C_HERO2 + HERO2_MS
const C_DONE = C_RELEASE + 800
const COLD_MS = 4400

// estados de partícula
const DEAD = 0, FUNNEL = 1, LEAK = 2, TO_DEP = 3
// destinos (fate)
/** F_ID: identificada pelo STD, ainda pesquisando: chega no WhatsApp também (cinza) */
const F_Q = 0, F_PRECO = 1, F_CUR = 2, F_CTX = 3, F_ID = 4
const FATE_EXIT: (LeakId | null)[] = [null, 'preco', 'curioso', 'contexto', null]
/** lado para onde cada destino puxa a partícula (0 = qualquer) */
const FATE_SIDE = [0, EXIT_SIDE.preco, EXIT_SIDE.curioso, EXIT_SIDE.contexto, 0]

// baldes de cor (desenho em lote)
const C_LEAD = 0, C_LEAK = 1, C_SIGNAL = 2, C_ID = 3, C_FLASH = 4
const BUCKET_COLORS = [COLORS.neutralLead, COLORS.leak, COLORS.signal, COLORS.researching, COLORS.ink]

type VisKey = LabelKey | 'membrane'
const VIS_KEYS: VisKey[] = ['segment', 'exits', 'deposit', 'money', 'score', 'membrane']

/** mistura de cor hex por t (só fora do loop de partículas) */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => {
    const x = (pa >> s) & 255
    return Math.round(x + (((pb >> s) & 255) - x) * t)
  }
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

const seg = (el: number, a: number, b: number) => clamp01((el - a) / (b - a))

/** Pessoa roteirizada (cold open e clímax): anda em tempo real, independe do slow-motion. */
interface Hero {
  kind: 'cold' | 'qualified' | 'researching'
  active: boolean
  t0: number
  x: number
  y: number
  u: number
  bucket: number
  crossed: boolean
  flash: number
  tags: string[]
  tagAt: number[]
  tagOut: number
}

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
  private qx = new Float32Array(POOL)
  private qy = new Float32Array(POOL)
  private vx = new Float32Array(POOL)
  private vy = new Float32Array(POOL)
  private pu = new Float32Array(POOL)
  private vu = new Float32Array(POOL)
  private pr = new Float32Array(POOL) // raio em px CSS
  private age = new Float32Array(POOL)
  private phase = new Float32Array(POOL)
  private flash = new Float32Array(POOL)
  private sx = new Float32Array(POOL)
  private sy = new Float32Array(POOL)
  private st = new Uint8Array(POOL)
  private fate = new Uint8Array(POOL)
  private slot = new Uint8Array(POOL)
  private crossed = new Uint8Array(POOL)
  private swept = new Uint8Array(POOL)
  private bucket = new Uint8Array(POOL)
  private cursor = 0
  private active = 0
  private maxActive = MAX_VISIBLE
  private spawnAcc = 0

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
  private camY = new Tween((ROI_TOP + ROI_BOTTOM) / 2)
  private camZ = new Tween(1)
  private follow: Hero | null = null
  private vpTop = new Tween(0)
  private vpBottom = new Tween(0)
  private vpSet = false

  // cena
  private scene: SceneDef = SCENES.void
  private sceneName: EngineScene = 'void'
  private wallsP = new Tween(0)
  private exitsP = new Tween(0)
  private vis = Object.fromEntries(VIS_KEYS.map((k) => [k, new Tween(0)])) as Record<VisKey, Tween>
  private timeScale = new Tween(1)

  // entradas e números
  private inputs: EngineInputs = { leads: 100, route: null, a10: null, ticket: null, segment: null }
  private diag: Diagnosis = diagnose(100, VISUAL_DEFAULT_A10, 0)
  private chegaram = new Tween(0)
  private prontas = new Tween(0)
  private prontasOn = new Tween(0)
  private lostN = new Tween(0)
  private lostR = new Tween(0)

  // depósito
  private occupied = new Uint8Array(DEPOSIT_SLOTS)
  private nextSlot = 0
  private landed = 0

  // heróis
  private heroes: Hero[] = [this.newHero(), this.newHero()]

  // STD
  private stdStart = -1
  private stdApplied = false
  private lastPhase = ''
  private v = { dark: 0, sweepY: -1, memP: 0, precoOpen: 1, ctxOpen: 1, seal: 0, curOpen: 1, wallBright: 0 }

  // efeitos
  private exitAct: Record<LeakId, number> = { preco: 0, curioso: 0, contexto: 0 }
  private ripX = new Float32Array(8)
  private ripAge = new Float32Array(8).fill(9)
  private ripI = 0
  private pulseAge = new Float32Array(6).fill(9)
  private pulseI = 0
  private moneyX = new Float32Array(16)
  private moneyY = new Float32Array(16)
  private moneyAge = new Float32Array(16).fill(9)
  private moneyI = 0

  // performance
  private trail = true
  private degraded = false
  private fps = 60
  private fpsFrames = 0
  private fpsAcc = 0
  private lowSince = -1
  private startedAt = 0

  private tmp = { x: 0, y: 0 }
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

  /** Área visível do palco, em px CSS a partir do topo do canvas (entre legenda e painel). */
  setViewport(top: number, bottom: number, ms = 420) {
    const now = performance.now()
    if (!this.vpSet) { this.vpSet = true; ms = 0 }
    this.vpTop.set(top, ms, now)
    this.vpBottom.set(bottom, ms, now)
  }

  setScene(name: EngineScene) {
    const now = performance.now()
    const def = SCENES[name]
    this.sceneName = name
    this.scene = def
    if (!this.follow) this.aimCamera(def.cam, def.camMs ?? 900, now)
    if (def.walls && this.wallsP.target < 1) this.wallsP.set(1, 900, now, easeInOutCubic)
    if (!def.walls && this.wallsP.target > 0) this.wallsP.set(0, 300, now)
    this.exitsP.set(def.exits ? 1 : 0, def.exits ? 700 : 300, now)
    const climaxRunning = this.stdStart >= 0 && !this.stdApplied
    if (!climaxRunning) {
      for (const k of ['segment', 'exits', 'deposit', 'money', 'score'] as LabelKey[]) this.setVis(k, def.labels.includes(k))
      const stdScene = name === 'std_on' || name === 'saida'
      this.setVis('membrane', this.stdApplied && stdScene)
      this.events.emit('caption', { key: name === 'std_on' && this.stdApplied ? 'std_running' : def.caption })
    }
    if (name === 'cold_single') this.startHero(this.heroes[0], 'cold', now)
    this.recomputeProbs()
  }

  setInputs(p: Partial<EngineInputs>) {
    const now = performance.now()
    const prevRoute = this.inputs.route
    this.inputs = { ...this.inputs, ...p }
    if (p.route !== undefined && p.route !== prevRoute) {
      lerpShape(this.shapeFrom, this.shape, this.shape, 0)
      const to = SHAPES[p.route ?? 'default']
      lerpShape(this.shapeTo, to, to, 0)
      this.morph.value = 0
      this.morph.set(1, 700, now, easeOutExpo)
    }
    this.diag = diagnose(this.inputs.leads, this.inputs.a10 ?? VISUAL_DEFAULT_A10, this.inputs.ticket ?? 0)
    this.recomputeProbs()
  }

  /** Liga/desliga o STD. Ligar dispara a timeline do clímax (~8,8s; skipStd() pula). */
  setStd(on: boolean) {
    const now = performance.now()
    if (on) {
      this.stdStart = now
      this.stdApplied = false
      this.lastPhase = ''
      this.setTimeScale(0.05, 280)
      this.setVis('deposit', false)
      this.setVis('money', false)
      this.setVis('exits', false)
      this.setVis('score', true)
      this.events.emit('caption', { key: 'std_intro' })
    } else {
      this.stdStart = -1
      this.stdApplied = false
      this.follow = null
      for (const h of this.heroes) if (h.kind !== 'cold') h.active = false
      this.timeScale.set(1, 0, 0)
      Object.assign(this.v, { dark: 0, sweepY: -1, memP: 0, precoOpen: 1, ctxOpen: 1, seal: 0, curOpen: 1, wallBright: 0 })
      for (let i = 0; i < POOL; i++) { this.crossed[i] = 0; this.swept[i] = 0 }
      this.recomputeProbs()
      this.reassignFates()
      this.setScene(this.sceneName)
    }
  }

  /** Pula o clímax direto para o estado final (toque em qualquer lugar). */
  skipStd() {
    if (this.stdStart < 0 || this.stdApplied) return
    this.stdStart = performance.now() - C_RELEASE
  }

  get stdOn() { return this.stdApplied }

  setTimeScale(v: number, ms = 0) {
    this.timeScale.set(v, ms, performance.now(), v < this.timeScale.value ? easeOutExpo : easeInCubic)
  }

  /** Para o /lab: força (ou desfaz) a degradação. */
  setDegraded(on: boolean) {
    this.degraded = on
    this.maxActive = on ? DEGRADED_MAX : MAX_VISIBLE
    this.trail = !on
    this.lowSince = -1
  }

  /** Esvazia o depósito de perdidos (lab / recomeço). */
  resetDeposit() {
    this.occupied.fill(0)
    this.nextSlot = 0
    this.landed = 0
  }

  /** Recomeço limpo: sem partículas, sem heróis, depósito vazio (cold open). */
  reset() {
    this.st.fill(DEAD)
    this.active = 0
    this.spawnAcc = 0
    for (const h of this.heroes) h.active = false
    this.resetDeposit()
    this.recomputeProbs()
  }

  getStats(): EngineStats {
    return { fps: this.fps, active: this.active, degraded: this.degraded, timeScale: this.timeScale.value }
  }

  /** Centro do nó do WhatsApp na tela (px CSS), para os balões do DOM. */
  nodeScreen(out = { x: 0, y: 0 }) {
    return this.toScreen(this.lut.cxAt(NODE_Y), this.nodeCenterY(), out)
  }

  toScreen(lx: number, ly: number, out = { x: 0, y: 0 }) {
    const s = this.cssScale()
    out.x = this.cssW / 2 + (lx - this.camX.value) * s
    out.y = this.vpCenter() + (ly - this.camY.value) * s
    return out
  }

  get currentScene() { return this.sceneName }

  /* --------------------------- internos --------------------------- */

  private newHero(): Hero {
    return { kind: 'cold', active: false, t0: 0, x: 0, y: 0, u: 0, bucket: C_LEAD, crossed: false, flash: 0, tags: [], tagAt: [], tagOut: -1 }
  }

  private startHero(h: Hero, kind: Hero['kind'], t0: number) {
    h.kind = kind
    h.active = true
    h.t0 = t0
    h.crossed = false
    h.flash = 0
    h.bucket = C_LEAD
    h.tagOut = -1
    if (kind === 'cold') {
      h.u = 0
      h.tags = [T.coldTag]
      h.tagAt = [350]
    } else if (kind === 'qualified') {
      h.u = -0.12
      const proc = SEGMENTS[this.inputs.segment ?? 'outro'].procedimento
      h.tags = [T.heroWant(proc), T.heroWhen, T.heroProfile]
      h.tagAt = [1300, 1700, 2100]
    } else {
      h.u = 0.3
      h.tags = [T.heroResearching]
      h.tagAt = [1250]
    }
    h.y = this.shape.membraneY - 64
    h.x = this.lut.cxAt(h.y) + h.u * this.lut.hwAt(h.y)
  }

  private aimCamera(c: { cx: number; cy: number; zoom: number }, ms: number, now: number) {
    this.camX.set(c.cx, ms, now)
    this.camY.set(c.cy, ms, now)
    this.camZ.set(c.zoom, ms, now)
  }

  private setVis(k: VisKey, on: boolean, ms = 450) {
    const t = this.vis[k]
    const target = on ? 1 : 0
    if (t.target !== target) t.set(target, on ? ms : ms * 0.6, performance.now(), on ? easeOutExpo : easeOutCubic)
  }

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
    if (!this.vpSet) { this.vpTop.value = 0; this.vpBottom.value = this.cssH }
  }

  private vpCenter() {
    return (this.vpTop.value + (this.vpBottom.value || this.cssH)) / 2
  }

  /** escala (px CSS por unidade lógica) já com zoom */
  private cssScale() {
    const vpH = Math.max(80, (this.vpBottom.value || this.cssH) - this.vpTop.value)
    return Math.min(this.cssW / WORLD_W, vpH / ROI_H) * this.camZ.value
  }

  private nodeRw() { return NODE_R_CSS / this.cssScale() }
  private nodeCenterY() { return NODE_Y + this.nodeRw() * 0.8 }

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
        // o STD não barra ninguém: todos chegam; quem ainda pesquisa chega identificado
        const q = convProjected(a10)
        p[F_Q] = q
        p[F_ID] = 1 - q
      }
    }
    this.counts.fill(0)
    this.fateTotal = 0
  }

  /**
   * Destino com maior déficit (esperado − realizado): determinístico, a proporção na tela
   * bate com a conta. Com `u`, prefere destinos do mesmo lado (ninguém cruza o funil).
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

  private reassignFates() {
    const mY = this.shape.membraneY
    for (let i = 0; i < POOL; i++) {
      if (this.st[i] === FUNNEL && this.py[i] < mY - 10) this.fate[i] = this.pickFate(this.pu[i])
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
        this.pr[i] = R_MIN + Math.random() * (R_MAX - R_MIN)
        return i
      }
    }
    return -1
  }

  private kill(i: number) {
    this.st[i] = DEAD
    this.active--
  }

  /** Nasce SEMPRE dentro da boca do funil, do lado do seu destino. */
  private spawnFunnel() {
    const i = this.alloc()
    if (i < 0) return
    const f = this.pickFate()
    this.st[i] = FUNNEL
    this.fate[i] = f
    const side = FATE_SIDE[f]
    this.pu[i] = side === 0 ? (Math.random() * 2 - 1) * 0.75 : side * (0.5 + Math.random() * 0.35)
    this.vu[i] = 0
    this.py[i] = MOUTH_Y + 4 + Math.random() * 22
    this.vy[i] = BASE_V * (0.8 + Math.random() * 0.4)
    this.px[i] = this.lut.cxAt(this.py[i]) + this.pu[i] * this.lut.hwAt(this.py[i])
    this.qx[i] = this.px[i]
    this.qy[i] = this.py[i]
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    if (this.paused) return
    const rawMs = now - this.lastT
    const realMs = Math.min(rawMs, 33)
    this.lastT = now
    this.measure(rawMs, now)
    this.updateTimeline(now)
    const ts = this.timeScale.update(now)
    this.update((realMs / 1000) * ts, realMs / 1000, now)
    this.render()
  }

  private measure(rawMs: number, now: number) {
    // travada isolada (>250ms: troca de aba, captura) não é lentidão de render
    if (rawMs > 250) return
    this.fpsFrames++
    this.fpsAcc += rawMs
    if (this.fpsAcc < 500) return
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

  /* ------------------------ timeline do STD ------------------------ */

  private phaseEmit(p: StdPhase) {
    if (this.lastPhase === p) return
    this.lastPhase = p
    this.events.emit('std:phase', { phase: p })
  }

  private updateTimeline(now: number) {
    if (this.stdStart < 0) return
    const el = now - this.stdStart
    const v = this.v
    v.dark = el < C_RELEASE ? 0.6 * easeOutExpo(seg(el, C_DARK, C_SWEEP)) : 0.6 * (1 - easeInOutCubic(seg(el, C_RELEASE, C_RELEASE + 600)))
    v.sweepY = el >= C_SWEEP && el < C_MEMBRANE + 50
      ? (MOUTH_Y - 30) + (this.shape.membraneY - MOUTH_Y + 30) * easeInOutCubic(seg(el, C_SWEEP, C_MEMBRANE))
      : -1
    v.memP = easeOutExpo(seg(el, C_MEMBRANE, C_EXITS))
    // as saídas se fecham: chegando com contexto, ninguém some antes de virar conversa
    v.precoOpen = 1 - easeOutExpo(seg(el, C_EXITS + 100, C_HERO1))
    v.ctxOpen = 1 - easeOutExpo(seg(el, C_EXITS, C_EXITS + 250))
    v.seal = seg(el, C_EXITS + 80, C_HERO1)
    v.curOpen = 1 - easeOutExpo(seg(el, C_EXITS + 50, C_EXITS + 300))
    v.wallBright = easeInOutCubic(seg(el, C_RELEASE, C_RELEASE + 600))

    if (el < C_DARK) this.phaseEmit('slow')
    else if (el < C_SWEEP) this.phaseEmit('dark')
    else if (el < C_MEMBRANE) this.phaseEmit('sweep')
    else if (el < C_EXITS) {
      if (this.lastPhase !== 'membrane') {
        this.events.emit('caption', { key: 'std_filter' })
        this.setVis('membrane', true)
      }
      this.phaseEmit('membrane')
    } else if (el < C_HERO1) {
      if (this.lastPhase !== 'exits') {
        this.setVis('exits', true) // mostra as saídas se fechando
      }
      this.phaseEmit('exits')
    } else if (el < C_HERO2) {
      if (this.lastPhase !== 'hero1') {
        this.setVis('exits', false)
        this.startHero(this.heroes[0], 'qualified', now - (el - C_HERO1))
        this.follow = this.heroes[0]
        this.camZ.set(1.6, 900, now)
        this.events.emit('caption', { key: 'std_hero1' })
      }
      this.phaseEmit('hero1')
    } else if (el < C_RELEASE) {
      if (this.lastPhase !== 'hero2') {
        this.heroes[0].active = false
        this.startHero(this.heroes[1], 'researching', now - (el - C_HERO2))
        this.follow = this.heroes[1]
        this.events.emit('caption', { key: 'std_hero2' })
      }
      this.phaseEmit('hero2')
    }
    if (el >= C_RELEASE && !this.stdApplied) {
      this.stdApplied = true
      this.follow = null
      for (const h of this.heroes) h.active = false
      this.aimCamera(SCENES.std_on.cam, 900, now)
      this.recomputeProbs()
      this.reassignFates()
      this.setTimeScale(1, 700)
      this.setVis('exits', false)
      this.setVis('membrane', true)
      this.setVis('deposit', true)
      this.setVis('score', true)
      this.prontasOn.set(1, 900, now)
      this.events.emit('caption', { key: 'std_running' })
      this.phaseEmit('running')
    }
    if (el >= C_DONE && this.lastPhase !== 'done') this.phaseEmit('done')
  }

  /* ---------------------------- heróis ---------------------------- */

  private updateHero(h: Hero, now: number) {
    if (!h.active) return
    const e = now - h.t0
    const lut = this.lut
    const mY = this.shape.membraneY
    h.flash *= 0.9
    if (h.kind === 'cold') {
      const k = clamp01(e / COLD_MS)
      h.y = MOUTH_Y + 8 + (NODE_Y - MOUTH_Y - 8) * easeInOutCubic(k)
      h.x = lut.cxAt(h.y)
      if (k >= 1) {
        h.active = false
        this.pulseAge[this.pulseI++ % 6] = 0
        this.events.emit('single:done', undefined)
      }
      return
    }
    if (h.kind === 'qualified') {
      let y: number
      if (e < 1000) y = mY - 64 + 60 * easeOutCubic(e / 1000)
      else if (e < 1300) y = mY - 4 + 14 * ((e - 1000) / 300)
      else if (e < 2400) y = mY + 10
      else y = mY + 10 + (NODE_Y - mY - 10) * easeInCubic(clamp01((e - 2400) / 1100))
      if (!h.crossed && y >= mY) {
        h.crossed = true
        h.flash = 1
        h.bucket = C_SIGNAL
        this.ripple(lut.cxAt(y) + h.u * lut.hwAt(y))
      }
      if (e >= 2400 && h.tagOut < 0) h.tagOut = e
      h.y = y
      h.x = lut.cxAt(y) + h.u * lut.hwAt(y)
      if (e >= HERO1_MS) {
        h.active = false
        this.pulseAge[this.pulseI++ % 6] = 0
        this.nodeScreen(this.tmp)
        const proc = SEGMENTS[this.inputs.segment ?? 'outro'].procedimento
        this.events.emit('hero:arrive', { x: this.tmp.x, y: this.tmp.y, text: `${proc} · este mês` })
      }
      return
    }
    // ainda pesquisando: passa pelo filtro, é identificada e chega no WhatsApp também
    let y: number
    if (e < 1000) y = mY - 64 + 58 * easeOutCubic(e / 1000)
    else if (e < 1600) y = mY - 6 + 16 * clamp01((e - 1000) / 400)
    else y = mY + 10 + (NODE_Y - mY - 10) * easeInCubic(clamp01((e - 1600) / 900))
    if (!h.crossed && y >= mY) {
      h.crossed = true
      h.flash = 1
      h.bucket = C_ID
      this.ripple(lut.cxAt(y) + h.u * lut.hwAt(y))
    }
    h.y = y
    h.x = lut.cxAt(y) + h.u * lut.hwAt(y)
    if (e >= 1900 && h.tagOut < 0) h.tagOut = e
    if (e >= HERO2_MS) {
      h.active = false
      this.pulseAge[this.pulseI++ % 6] = 0
    }
  }

  /* ---------------------------- física ---------------------------- */

  private update(dt: number, realDt: number, now: number) {
    if (this.morph.active) {
      this.morph.update(now)
      lerpShape(this.shape, this.shapeFrom, this.shapeTo, this.morph.value)
      this.lut.build(this.shape)
    }
    this.vpTop.update(now); this.vpBottom.update(now)
    this.wallsP.update(now); this.exitsP.update(now)
    for (const k of VIS_KEYS) this.vis[k].update(now)
    for (const h of this.heroes) this.updateHero(h, now)
    this.updateCamera(realDt, now)
    this.updateNumbers(now)

    const decay = Math.exp(-realDt * 3)
    for (const k of LEAK_IDS) this.exitAct[k] *= decay
    for (let r = 0; r < 8; r++) this.ripAge[r] += realDt
    for (let r = 0; r < 6; r++) this.pulseAge[r] += realDt
    for (let r = 0; r < 16; r++) this.moneyAge[r] += realDt

    // nascimento (densidade responde ao volume, dentro do teto de MAX_VISIBLE)
    if (this.scene.mode === 'funnel') {
      this.spawnAcc += spawnRate(this.inputs.leads) * ROUTE_FLOW_MULT[this.inputs.route ?? 'default'] * dt
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.spawnFunnel() }
    } else this.spawnAcc = 0

    const lut = this.lut
    const shape = this.shape
    const mY = shape.membraneY
    const hwMouth = lut.hw[MOUTH_Y]
    const sweepY = this.v.sweepY
    const flashDecay = Math.exp(-realDt * 5)
    const dampU = Math.exp(-dt * 1.5)
    const stdOn = this.stdApplied

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
        let vt = BASE_V * Math.min(3, Math.sqrt(hwMouth / hw))
        if (shape.gate > 0.01) {
          const d = Math.abs(y - shape.gateY)
          if (d < 22) vt *= 1 - shape.gate * 0.9 * (1 - d / 22)
        }
        this.vy[i] += (vt - this.vy[i]) * Math.min(1, dt * 3)
        const ny = y + this.vy[i] * dt

        let noise = Math.sin(t * 1.4 + ph) * 0.5 + Math.sin(t * 0.6 + ph * 2.1 + y * 0.015) * 0.3
        if (shape.turb > 0.01) {
          const dT = Math.abs(y - shape.turbY)
          if (dT < 70) noise += shape.turb * (1 - dT / 70) * Math.sin(t * 4 + ph * 3) * 2
        }
        let u = this.pu[i]
        this.vu[i] += (noise * 0.8 - u * 0.6) * dt
        this.vu[i] *= dampU

        const f = this.fate[i]
        const exit = FATE_EXIT[f]
        let steerY = -1, side = 0
        if (exit) { steerY = shape.exitY[exit]; side = EXIT_SIDE[exit] }
        let limit = 0.86
        if (side !== 0 && ny > steerY - LEAK_STEER_WINDOW && ny < steerY + 4) {
          let du = (side - u) * Math.min(1, dt * 3.5)
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

        if (sweepY >= 0 && !this.swept[i] && Math.abs(ny - sweepY) < 7) {
          this.swept[i] = 1
          this.flash[i] = 1
        }

        if (exit && ny >= steerY - 3) {
          if (stdOn || this.exitOpen(exit) < 0.05) {
            this.fate[i] = stdOn ? F_ID : F_Q
          } else {
            this.toLeak(i, exit)
            continue
          }
        }

        if (y < mY && ny >= mY) {
          this.crossed[i] = 1
          if (this.v.memP > 0.5) this.ripple(lut.cxAt(ny) + u * lut.hwAt(ny))
        }

        if (ny >= NODE_Y) {
          this.arrive(i)
          continue
        }
        this.px[i] = lut.cxAt(ny) + u * lut.hwAt(ny)
      } else if (s === LEAK) {
        // sai pela abertura da parede...
        this.vy[i] += GRAVITY_FREE * dt
        this.px[i] += this.vx[i] * dt
        this.py[i] += this.vy[i] * dt
        this.pu[i] += dt
        if (this.pu[i] >= LEAK_FLY_S) this.toDeposit(i)
      } else if (s === TO_DEP) {
        // ...e cai no depósito de perdidos
        const k = this.pu[i] + dt / TO_DEPOSIT_S
        if (k >= 1) {
          this.land(i)
          continue
        }
        depositSlot(this.slot[i], this.tmp)
        const tx = this.tmp.x, ty = this.tmp.y
        this.pu[i] = k
        const e = easeInCubic(k)
        const a = 1 - e
        const cx = this.sx[i] - 30, cy = Math.max(this.sy[i], ty - 60)
        this.px[i] = a * a * this.sx[i] + 2 * a * e * cx + e * e * tx
        this.py[i] = a * a * this.sy[i] + 2 * a * e * cy + e * e * ty
      }
    }
  }

  private updateCamera(realDt: number, now: number) {
    const f = this.follow
    if (f && f.active) {
      const k = 1 - Math.exp(-realDt * 3.2)
      this.camX.set(this.camX.value + (Math.min(f.x + 30, 260) - this.camX.value) * k, 0, now)
      this.camY.set(this.camY.value + (f.y - this.camY.value) * k, 0, now)
      this.camZ.update(now)
    } else {
      this.camX.update(now); this.camY.update(now); this.camZ.update(now)
    }
    // âncora: o nó do WhatsApp (e o seu label) sempre visíveis na tela
    const s = this.cssScale()
    const bottom = (this.vpBottom.value || this.cssH) - 10
    const needBelow = this.nodeCenterY() + this.nodeRw() + 24 / s
    const minCamY = needBelow - (bottom - this.vpCenter()) / s
    if (this.camY.value < minCamY) this.camY.value = minCamY
  }

  private updateNumbers(now: number) {
    const d = this.diag
    const std = this.stdApplied
    const cheg = std ? d.conversasProj : d.conversasHoje
    const pront = std ? d.prontasProj : d.prontasHoje
    if (Math.round(cheg) !== Math.round(this.chegaram.target)) this.chegaram.set(cheg, 1200, now, easeOutExpo)
    if (Math.round(pront) !== Math.round(this.prontas.target)) this.prontas.set(pront, 1400, now, easeOutExpo)
    if (!std && this.prontasOn.target !== 0) this.prontasOn.set(0, 0, now)
    this.chegaram.update(now)
    this.prontas.update(now)
    this.prontasOn.update(now)
    // depósito: o contador rola até o total do mês conforme a pilha enche
    const fill = Math.min(1, this.landed / DEPOSIT_FULL)
    const n = d.vazam * fill, r = d.valorEmJogo * fill
    if (Math.abs(n - this.lostN.target) > 0.5) this.lostN.set(n, 350, now, easeOutCubic)
    if (Math.abs(r - this.lostR.target) > 0.5) this.lostR.set(r, 350, now, easeOutCubic)
    this.lostN.update(now)
    this.lostR.update(now)
  }

  private exitOpen(k: LeakId) {
    const base = k === 'preco' ? this.v.precoOpen : k === 'contexto' ? this.v.ctxOpen : this.v.curOpen
    return this.exitsP.value * base
  }

  private toLeak(i: number, exit: LeakId) {
    const y = this.py[i]
    this.px[i] = this.lut.cxAt(y) + this.pu[i] * this.lut.hwAt(y)
    this.vx[i] = EXIT_SIDE[exit] * (35 + Math.random() * 30)
    this.vy[i] = this.vy[i] * 0.3
    this.pu[i] = 0
    this.st[i] = LEAK
    this.exitAct[exit] = Math.min(1.6, this.exitAct[exit] + 0.35)
    // "R$" voando só quando os labels das saídas estão escondidos (senão vira ruído)
    if (this.vis.money.value > 0.5 && this.vis.exits.value < 0.5) {
      const m = this.moneyI++ % 16
      this.moneyX[m] = this.px[i] - 12
      this.moneyY[m] = y
      this.moneyAge[m] = 0
    }
    this.leakPayload.exit = exit
    this.events.emit('leak', this.leakPayload)
  }

  private toDeposit(i: number) {
    this.st[i] = TO_DEP
    this.sx[i] = this.px[i]
    this.sy[i] = this.py[i]
    this.pu[i] = 0
    this.slot[i] = Math.min(this.nextSlot, DEPOSIT_SLOTS - 1)
    if (this.nextSlot < DEPOSIT_SLOTS) this.nextSlot++
  }

  private land(i: number) {
    this.occupied[this.slot[i]] = 1
    this.landed++
    this.kill(i)
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

  private render() {
    const ctx = this.ctx
    const c = this.canvas
    if (!ctx || !c) return
    const dpr = this.dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, c.width, c.height)

    const sCss = this.cssScale()
    const S = sCss * dpr
    const ox = (this.cssW / 2) * dpr - this.camX.value * S
    const oy = this.vpCenter() * dpr - this.camY.value * S
    ctx.setTransform(S, 0, 0, S, ox, oy)
    const px = 1 / sCss // 1 px CSS em unidades lógicas

    const wallsP = this.wallsP.value
    if (wallsP > 0.001) this.drawInterior(wallsP)
    this.drawDepositPile(px)
    this.drawParticles(px)
    this.drawHeroes(px)
    if (this.v.dark > 0.005) this.drawOutsideDark(this.v.dark)
    if (wallsP > 0.001) this.drawWalls(wallsP, px)
    if (this.shape.gate > 0.02 && wallsP > 0.5) this.drawGate(px)
    if (this.v.memP > 0.01) this.drawMembrane(px)
    if (this.v.sweepY >= 0) this.drawSweep(px)
    this.drawMoney(px)
    if (wallsP > 0.3) this.drawAnchors(px, clamp01((wallsP - 0.3) / 0.7))
    this.drawLabels(px)
    this.drawHeroTags(px)
  }

  /* ---- texto ---- */

  private font(sizeCss: number, px: number, family: 'mono' | 'sans', weight = 500) {
    const ctx = this.ctx!
    ctx.font = `${weight} ${sizeCss * px}px ${family === 'mono' ? FONTS.mono : FONTS.sans}`
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = family === 'mono' ? `${0.06 * sizeCss * px}px` : '0px'
  }

  /** Bloco de texto com fundo recortado (as partículas passam por trás). y = centro da 1ª linha. */
  private textBlock(lines: readonly string[], x: number, y: number, align: 'left' | 'right' | 'center', color: string, alpha: number, px: number, lineCss: number, knock = true) {
    if (alpha <= 0.01) return 0
    const ctx = this.ctx!
    const lh = lineCss * px
    let w = 0
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width)
    if (knock) {
      const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
      const pad = 4 * px
      ctx.globalAlpha = alpha * 0.85
      ctx.fillStyle = COLORS.bg
      ctx.fillRect(x0 - pad, y - lh / 2 - pad * 0.5, w + pad * 2, lh * lines.length + pad)
    }
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lh)
    ctx.globalAlpha = 1
    return w
  }

  private widest(lines: readonly string[]) {
    let w = 0
    for (const l of lines) w = Math.max(w, this.ctx!.measureText(l).width)
    return w
  }

  private visibleLeft() { return this.camX.value - this.cssW / 2 / this.cssScale() }
  private visibleRight() { return this.camX.value + this.cssW / 2 / this.cssScale() }

  /* ---- funil ---- */

  private funnelPath(ctx: CanvasRenderingContext2D) {
    const lut = this.lut
    ctx.moveTo(lut.wallX(MOUTH_Y, -1), MOUTH_Y)
    for (let y = MOUTH_Y; y <= NODE_Y; y += 6) ctx.lineTo(lut.wallX(y, -1), y)
    ctx.lineTo(lut.wallX(NODE_Y, -1), NODE_Y)
    for (let y = NODE_Y; y >= MOUTH_Y; y -= 6) ctx.lineTo(lut.wallX(y, 1), y)
    ctx.closePath()
  }

  private drawInterior(p: number) {
    const ctx = this.ctx!
    ctx.globalAlpha = 0.03 * p
    ctx.fillStyle = COLORS.ink
    ctx.beginPath()
    this.funnelPath(ctx)
    ctx.fill()
    ctx.globalAlpha = 1
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
    if (side === -1 && this.exitsP.value > 0.01) {
      for (const k of LEAK_IDS) {
        const open = this.exitOpen(k)
        if (open < 0.02) continue
        const g = EXIT_GAP * open * (1 + 0.15 * Math.min(1, this.exitAct[k]))
        if (Math.abs(y - this.shape.exitY[k]) < g) return true
      }
    }
    return false
  }

  private drawWalls(p: number, px: number) {
    const ctx = this.ctx!
    const lut = this.lut
    const yEnd = MOUTH_Y + (NODE_Y - MOUTH_Y) * p
    ctx.lineWidth = 2 * px
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = mix(COLORS.line, COLORS.inkMuted, 0.45 + 0.3 * this.v.wallBright)
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
    // selo no "chegou sem dizer o que quer" (clímax)
    if (this.v.seal > 0) this.drawSeal(lut.wallX(this.shape.exitY.contexto, -1), this.shape.exitY.contexto, px)
  }

  private drawGate(px: number) {
    const ctx = this.ctx!
    const y = this.shape.gateY
    const l = this.lut.wallX(y, -1), r = this.lut.wallX(y, 1)
    ctx.globalAlpha = this.shape.gate * 0.8
    ctx.strokeStyle = COLORS.inkMuted
    ctx.lineWidth = 1.5 * px
    ctx.setLineDash([5 * px, 5 * px])
    ctx.beginPath()
    ctx.moveTo(l + 3, y)
    ctx.lineTo(r - 3, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawSeal(x: number, y: number, px: number) {
    const ctx = this.ctx!
    const t = this.v.seal
    const s = 8 * px * (1 + 0.6 * (1 - easeOutExpo(t)))
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.14)
    ctx.globalAlpha = Math.min(1, t * 2)
    ctx.strokeStyle = COLORS.signal
    ctx.lineWidth = 1.5 * px
    ctx.strokeRect(-s, -s, s * 2, s * 2)
    ctx.beginPath()
    ctx.moveTo(-s * 0.5, 0)
    ctx.lineTo(-s * 0.1, s * 0.4)
    ctx.lineTo(s * 0.55, -s * 0.45)
    ctx.stroke()
    ctx.restore()
  }

  private drawMembrane(px: number) {
    const ctx = this.ctx!
    const y = this.shape.membraneY
    const l = this.lut.wallX(y, -1), r = this.lut.wallX(y, 1)
    const reach = ((r - l) / 2) * this.v.memP
    ctx.strokeStyle = COLORS.signal
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    for (let side = -1; side <= 1; side += 2) {
      const xs = side < 0 ? l : r
      for (let s = 0; s <= 16; s++) {
        const x = xs - side * (reach * s) / 16
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
  }

  private drawSweep(px: number) {
    const ctx = this.ctx!
    const y = this.v.sweepY
    const L = this.visibleLeft(), R = this.visibleRight()
    const trail = 40 * px
    const g = ctx.createLinearGradient(0, y - trail, 0, y)
    g.addColorStop(0, 'rgba(198,255,61,0)')
    g.addColorStop(1, 'rgba(198,255,61,0.28)')
    ctx.fillStyle = g
    ctx.fillRect(L, y - trail, R - L, trail)
    ctx.fillStyle = COLORS.signal
    ctx.fillRect(L, y - 0.5 * px, R - L, px)
  }

  /* ---- partículas ---- */

  private drawParticles(px: number) {
    const ctx = this.ctx!
    const stdOn = this.stdApplied
    const bk = this.bucket
    for (let i = 0; i < POOL; i++) {
      const s = this.st[i]
      if (s === DEAD) continue
      if (this.flash[i] > 0.35) bk[i] = C_FLASH
      else if (s === LEAK || s === TO_DEP) bk[i] = C_LEAK
      else if (stdOn && this.crossed[i] && this.fate[i] === F_Q) bk[i] = C_SIGNAL
      else if (stdOn && this.crossed[i] && this.fate[i] === F_ID) bk[i] = C_ID
      else bk[i] = C_LEAD
    }
    ctx.lineCap = 'round'
    ctx.lineWidth = 4.5 * px
    for (let b = 0; b < 5; b++) {
      ctx.strokeStyle = BUCKET_COLORS[b]
      ctx.fillStyle = BUCKET_COLORS[b]
      if (this.trail) {
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath()
          let any = false
          const a0 = pass === 0 ? 0.35 : 0, a1 = pass === 0 ? 1 : 0.35
          for (let i = 0; i < POOL; i++) {
            if (this.st[i] === DEAD || bk[i] !== b || this.age[i] < 0.05) continue
            let dx = (this.qx[i] - this.px[i]) * TAIL_FRAMES
            let dy = (this.qy[i] - this.py[i]) * TAIL_FRAMES
            const len = Math.sqrt(dx * dx + dy * dy)
            if (len < 1) continue
            if (len > TAIL_MAX) { const k = TAIL_MAX / len; dx *= k; dy *= k }
            ctx.moveTo(this.px[i] + dx * a0, this.py[i] + dy * a0)
            ctx.lineTo(this.px[i] + dx * a1, this.py[i] + dy * a1)
            any = true
          }
          if (any) {
            ctx.globalAlpha = pass === 0 ? 0.22 : 0.09
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      let any = false
      for (let i = 0; i < POOL; i++) {
        if (this.st[i] === DEAD || bk[i] !== b) continue
        const r = this.pr[i] * px * (b === C_FLASH ? 1.4 : 1)
        ctx.moveTo(this.px[i] + r, this.py[i])
        ctx.arc(this.px[i], this.py[i], r, 0, 6.2832)
        any = true
      }
      if (any) ctx.fill()
    }
  }

  private drawHeroes(px: number) {
    const ctx = this.ctx!
    for (const h of this.heroes) {
      if (!h.active) continue
      const r = HERO_R * px * (1 + h.flash * 0.5)
      ctx.globalAlpha = 0.35
      ctx.strokeStyle = BUCKET_COLORS[h.bucket]
      ctx.lineWidth = 1.5 * px
      ctx.beginPath()
      ctx.arc(h.x, h.y, r + 5 * px, 0, 6.2832)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = h.flash > 0.4 ? COLORS.ink : BUCKET_COLORS[h.bucket]
      ctx.beginPath()
      ctx.arc(h.x, h.y, r, 0, 6.2832)
      ctx.fill()
    }
  }

  private drawHeroTags(px: number) {
    const now = performance.now()
    for (const h of this.heroes) {
      if (!h.active) continue
      const e = now - h.t0
      const out = h.tagOut >= 0 ? 1 - clamp01((e - h.tagOut) / 300) : 1
      if (out <= 0) continue
      this.font(13, px, 'sans', 600)
      const w = this.widest(h.tags)
      const right = h.x + (HERO_R + 12) * px
      const flip = right + w + 8 * px > this.visibleRight()
      const x = flip ? h.x - (HERO_R + 12) * px : right
      const lh = 19 * px
      const y0 = h.y - ((h.tags.length - 1) * lh) / 2
      const color = h.kind === 'qualified' ? COLORS.signal : h.kind === 'researching' ? COLORS.inkMuted : COLORS.ink
      for (let i = 0; i < h.tags.length; i++) {
        const a = easeOutExpo(clamp01((e - h.tagAt[i]) / 350)) * out
        if (a <= 0) continue
        this.textBlock([h.tags[i]], x + (flip ? -1 : 1) * (1 - a) * 8 * px, y0 + i * lh, flip ? 'right' : 'left', color, a, px, 19)
      }
    }
  }

  /* ---- depósito ---- */

  private drawDepositPile(px: number) {
    const ctx = this.ctx!
    let any = false
    ctx.beginPath()
    for (let k = 0; k < DEPOSIT_SLOTS; k++) {
      if (!this.occupied[k]) continue
      depositSlot(k, this.tmp)
      const r = 4 * px
      ctx.moveTo(this.tmp.x + r, this.tmp.y)
      ctx.arc(this.tmp.x, this.tmp.y, r, 0, 6.2832)
      any = true
    }
    if (any) {
      ctx.globalAlpha = 0.35 + 0.5 * this.vis.deposit.value
      ctx.fillStyle = COLORS.leak
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  private drawMoney(px: number) {
    const ctx = this.ctx!
    let set = false
    for (let k = 0; k < 16; k++) {
      const ag = this.moneyAge[k]
      if (ag > 0.7) continue
      if (!set) {
        this.font(12, px, 'mono', 500)
        ctx.fillStyle = COLORS.leak
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        set = true
      }
      ctx.globalAlpha = (1 - ag / 0.7) * 0.9
      ctx.fillText('R$', this.moneyX[k], this.moneyY[k] + ag * 16)
    }
    ctx.globalAlpha = 1
  }

  /* ---- âncoras: SEU ANÚNCIO (topo) e SEU WHATSAPP (base) ---- */

  private drawAnchors(px: number, a: number) {
    const ctx = this.ctx!
    const lut = this.lut
    // topo: ícone de anúncio + label
    const mx = lut.cxAt(MOUTH_Y)
    const segOn = this.inputs.segment ? this.vis.segment.value : 0
    const labelY = MOUTH_Y - (14 + 18 * segOn) * px
    this.font(12, px, 'mono', 500)
    const w = ctx.measureText(T.anuncio).width
    const iconW = 16 * px
    const gap = 7 * px
    const x0 = mx - (w + iconW + gap) / 2
    ctx.globalAlpha = a
    this.drawAdIcon(x0 + iconW / 2, labelY, px)
    this.textBlock([T.anuncio], x0 + iconW + gap, labelY, 'left', COLORS.ink, a, px, 16, false)
    if (segOn > 0.01 && this.inputs.segment) {
      const label = SEGMENTS[this.inputs.segment].label
      this.font(12, px, 'mono', 500)
      const n = Math.ceil(label.length * Math.min(1, segOn * 1.3))
      this.textBlock([label.slice(0, n)], mx, MOUTH_Y - 13 * px, 'center', COLORS.inkMuted, a * segOn, px, 16, false)
    }

    // base: nó do WhatsApp, 64px
    const nx = lut.cxAt(NODE_Y)
    const ny = this.nodeCenterY()
    const R = NODE_R_CSS * px
    const on = this.prontasOn.value
    const ring = on > 0 ? mix(COLORS.inkMuted, COLORS.signal, on) : COLORS.inkMuted
    ctx.lineWidth = 1.5 * px
    for (let k = 0; k < 6; k++) {
      const ag = this.pulseAge[k]
      if (ag > 0.8) continue
      ctx.globalAlpha = a * (1 - ag / 0.8) * 0.55
      ctx.strokeStyle = ring
      ctx.beginPath()
      ctx.arc(nx, ny, R + ag * 26 * px, 0, 6.2832)
      ctx.stroke()
    }
    ctx.globalAlpha = a
    ctx.fillStyle = COLORS.bgRaised
    ctx.strokeStyle = ring
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    ctx.arc(nx, ny, R, 0, 6.2832)
    ctx.fill()
    ctx.stroke()
    this.drawChatIcon(nx, ny, px, ring)
    this.font(12, px, 'mono', 500)
    this.textBlock([T.whatsapp], nx, ny + R + 14 * px, 'center', COLORS.ink, a, px, 16, false)
    ctx.globalAlpha = 1
  }

  private drawAdIcon(cx: number, cy: number, s: number) {
    // megafone simples, em traço
    const ctx = this.ctx!
    ctx.strokeStyle = COLORS.ink
    ctx.lineWidth = 1.6 * s
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - 7 * s, cy - 3 * s)
    ctx.lineTo(cx - 3 * s, cy - 3 * s)
    ctx.lineTo(cx + 6 * s, cy - 7 * s)
    ctx.lineTo(cx + 6 * s, cy + 7 * s)
    ctx.lineTo(cx - 3 * s, cy + 3 * s)
    ctx.lineTo(cx - 7 * s, cy + 3 * s)
    ctx.closePath()
    ctx.moveTo(cx - 4 * s, cy + 3 * s)
    ctx.lineTo(cx - 2 * s, cy + 8 * s)
    ctx.stroke()
  }

  private drawChatIcon(cx: number, cy: number, px: number, color: string) {
    const ctx = this.ctx!
    const r = 12 * px
    ctx.strokeStyle = color
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    ctx.arc(cx, cy - px, r, 0.62 * Math.PI, 2.55 * Math.PI)
    ctx.lineTo(cx - r * 1.05, cy + r * 1.05)
    ctx.closePath()
    ctx.stroke()
  }

  /* ---- labels (divulgação progressiva) ---- */

  private drawLabels(px: number) {
    const lut = this.lut
    const vis = this.vis
    const L = this.visibleLeft()

    // saídas de vazamento (parede esquerda), em linguagem leiga
    const ex = vis.exits.value * this.exitsP.value
    if (ex > 0.01) {
      this.font(13, px, 'sans', 600)
      for (const k of LEAK_IDS) {
        const y = this.shape.exitY[k]
        const act = Math.min(1, this.exitAct[k])
        const transformed = 1 - (k === 'preco' ? this.v.precoOpen : k === 'contexto' ? this.v.ctxOpen : this.v.curOpen)
        const color = transformed > 0.5 ? COLORS.inkMuted : COLORS.leak
        const alpha = ex * (0.8 + 0.2 * act)
        const lines = T.exits[k]
        const x = Math.max(lut.wallX(y, -1) - 12 * px, L + this.widest(lines) + 6 * px)
        this.textBlock(lines, x, y - 8 * px, 'right', color, alpha, px, 16)
      }
    }

    // depósito de perdidos
    const dp = vis.deposit.value
    if (dp > 0.01 && this.landed > 0) {
      const top = DEPOSIT.floorY - (DEPOSIT.rows.length - 1) * DEPOSIT.dy - 16 * px
      const x = Math.max(DEPOSIT.x0 - 4 * px, L + 6 * px)
      const lines: string[] = [T.perdidos, T.pessoas(fmt(this.lostN.value))]
      if (this.inputs.ticket != null && vis.money.value > 0.01) lines.push(`R$ ${fmt(this.lostR.value)}`)
      this.font(12, px, 'mono', 500)
      this.textBlock(lines, x, top - (lines.length - 1) * 17 * px, 'left', COLORS.leak, dp, px, 17)
    }

    // placar antes/depois, ladeando o tubo acima do nó
    const sc = vis.score.value
    if (sc > 0.01) {
      const ax = lut.cxAt(NODE_Y)
      const valY = NODE_Y - 10 * px
      const off = 20 * px
      this.font(12, px, 'mono', 500)
      this.textBlock(T.chegaram, ax - off, valY - 22 * px, 'right', COLORS.inkMuted, sc, px, 16)
      this.textBlock(T.prontas, ax + off, valY - 38 * px, 'left', COLORS.inkMuted, sc, px, 16)
      this.font(18, px, 'mono', 500)
      this.textBlock([fmt(this.chegaram.value)], ax - off, valY, 'right', COLORS.ink, sc, px, 20)
      const on = this.prontasOn.value
      this.textBlock([fmt(this.prontas.value)], ax + off, valY, 'left', on > 0 ? mix(COLORS.inkMuted, COLORS.signal, on) : COLORS.inkMuted, sc, px, 20)
    }

    // FILTRO STD
    const mb = vis.membrane.value * this.v.memP
    if (mb > 0.01) {
      const y = this.shape.membraneY
      this.font(13, px, 'mono', 600)
      const w1 = this.ctx!.measureText(T.filtro).width
      this.font(12, px, 'sans', 500)
      const w2 = this.widest(T.filtroSub)
      const x = Math.max(lut.wallX(y, -1) - 12 * px, L + Math.max(w1, w2) + 6 * px)
      this.font(13, px, 'mono', 600)
      this.textBlock([T.filtro], x, y - 4 * px, 'right', COLORS.signal, mb, px, 16)
      this.font(12, px, 'sans', 500)
      this.textBlock(T.filtroSub, x, y + 14 * px, 'right', COLORS.ink, mb, px, 15)
    }

  }
}

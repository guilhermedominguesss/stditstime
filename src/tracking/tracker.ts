import type { SupabaseClient } from '@supabase/supabase-js'
import { ENV } from '../funil/config'
import { detectDevice, detectInAppBrowser, generateRefCode, isCrawler, readAttribution, resolveTestDevice, uuid, type Attribution } from './session'

/**
 * TRACKING (Supabase: funil_sessions / funil_events, no projeto do painel).
 *
 *  - A chave anon NÃO lê nada e NÃO escreve direto nas tabelas: tudo passa pelas RPCs
 *    security definer fv_create_session / fv_log_event / fv_patch_session.
 *  - A sessão só nasce quando a página está VISÍVEL. O navegador do Instagram/Facebook
 *    pode pré-carregar o site do anúncio antes do toque; essas cargas escondidas não
 *    viram sessão (e, se depois a pessoa abrir, a sessão vem marcada preloaded=true).
 *  - Robôs (facebookexternalhit, Facebot, bot, crawler, preview) não criam nada.
 *  - ?test=1 marca a sessão com is_test=true (o painel exclui).
 *  - Fila sequencial espelhada em localStorage: Supabase fora do ar não quebra o fluxo.
 *  - Nada aqui lança erro para quem chamou.
 */

export type FvEvent =
  | 'fv_view' | 'fv_start' | 'fv_scene_enter' | 'fv_input' | 'fv_diagnosis_view' | 'fv_std_on'
  | 'fv_case_view' | 'fv_case_open_std' | 'fv_qualified' | 'fv_disqualified' | 'fv_whatsapp_click'
  | 'fv_checklist_check' | 'fv_back'
  | 'fv_error' | 'fv_first_paint' | 'fv_first_interaction' | 'fv_intro_view' | 'fv_intro_cta'
  | 'fv_whatsapp_retorno' | 'fv_whatsapp_confirmado' | 'fv_whatsapp_nao_abriu'

/** Colunas que o RPC aceita (o banco também valida). */
export interface SessionPatch {
  segmento?: string
  leads_mes?: number
  conv_10?: number
  ticket?: number
  investe?: string
  faturamento?: string
  valor_em_jogo?: number
  receita_extra?: number
  qualificado?: boolean
  outcome?: 'whatsapp' | 'nao_qualificado' | 'abandono'
  last_scene?: string
  std_on_at?: string
  completed_at?: string
  intro_cta_at?: string
  /** WhatsApp do lead qualificado: 11 dígitos (DDD + número) */
  whatsapp?: string
}

export type Job =
  | { kind: 'session'; id: string; ref: string; fields: Record<string, unknown>; tries: number }
  | { kind: 'event'; sid: string; name: FvEvent; scene: string; payload: Record<string, unknown>; tries: number }
  | { kind: 'patch'; id: string; fields: SessionPatch; tries: number }

export const QUEUE_KEY = 'fv_queue_v2'
const MAX_TRIES = 6
const MAX_QUEUE = 300
const MAX_ERRORS = 5
/** Códigos do Postgres que não adianta reenviar: limite/trava (P0001), check, tipo, FK. */
const PERMANENT = new Set(['P0001', '23514', '22P02', '23503', '22003', '42883'])

function loadQueue(): Job[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as Job[]).slice(-MAX_QUEUE) : []
  } catch {
    return []
  }
}

function saveQueue(q: Job[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)))
    else localStorage.removeItem(QUEUE_KEY)
  } catch {
    /* modo privado / armazenamento cheio: segue só em memória */
  }
}

const now = () => Math.round(typeof performance !== 'undefined' ? performance.now() : 0)

class Tracker {
  readonly sessionId = uuid()
  readonly refCode = generateRefCode()
  readonly attribution: Attribution
  /** robô: não registra nada */
  readonly disabled: boolean
  readonly isTest: boolean
  private queue: Job[] = []
  /** registros feitos antes de a sessão existir (página ainda escondida) */
  private early: Job[] = []
  private pumping = false
  private client: Promise<SupabaseClient | null> | null = null
  private armed = false
  private started = false
  private scene = 'intro'
  private preloaded = false
  /** ms (desde o carregamento) em que a página ficou visível */
  private visibleAt = 0
  private errors = 0
  private retryTimer = 0

  constructor() {
    const hasWindow = typeof window !== 'undefined'
    this.attribution = readAttribution(hasWindow ? window.location.search : '')
    this.disabled = hasWindow ? isCrawler(navigator.userAgent) : true
    this.isTest = hasWindow ? resolveTestDevice(window.location.search) : false
  }

  /**
   * Liga o tracking. A sessão é criada agora se a página estiver visível; senão, no
   * primeiro momento em que ficar visível (pré-carregamento do in-app browser).
   */
  init() {
    if (this.armed || this.disabled || typeof window === 'undefined') return
    this.armed = true
    this.queue = loadQueue() // sobras de sessões anteriores vão primeiro
    window.addEventListener('online', () => void this.pump())
    window.addEventListener('pagehide', () => saveQueue(this.queue))
    this.watchErrors()
    const hidden = () =>
      document.visibilityState !== 'visible' || (document as Document & { prerendering?: boolean }).prerendering === true
    if (!hidden()) {
      this.start()
      return
    }
    this.preloaded = true
    const onVisible = () => {
      if (hidden()) return
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('prerenderingchange', onVisible)
      this.start()
    }
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('prerenderingchange', onVisible)
  }

  private start() {
    if (this.started) return
    this.started = true
    this.visibleAt = now()
    const ua = navigator.userAgent
    this.queue.push({
      kind: 'session',
      tries: 0,
      id: this.sessionId,
      ref: this.refCode,
      fields: {
        ...this.attribution,
        device: detectDevice(ua, window.innerWidth),
        in_app_browser: detectInAppBrowser(ua),
        last_scene: this.scene,
        is_test: this.isTest,
        user_agent: ua.slice(0, 400),
        has_intro: true,
        preloaded: this.preloaded,
      },
    })
    this.queue.push({ kind: 'event', tries: 0, sid: this.sessionId, name: 'fv_view', scene: this.scene, payload: { preloaded: this.preloaded } })
    if (this.pendingFirstPaint) {
      this.pendingFirstPaint = false
      this.queue.push({ kind: 'event', tries: 0, sid: this.sessionId, name: 'fv_first_paint', scene: this.scene, payload: { ...this.timing(), ...this.paintCheck } })
    }
    this.queue.push(...this.early)
    this.early = []
    this.watchFirstInteraction()
    saveQueue(this.queue)
    void this.pump()
  }

  private pendingFirstPaint = false

  /**
   * A intro está pintada. Se a página ainda estiver escondida (pré-carregamento), o
   * evento sai no momento em que ela ficar visível: é aí que a pessoa vê de fato.
   */
  firstPaint(check: Record<string, unknown> = {}) {
    if (this.disabled) return
    this.paintCheck = check
    if (this.started) this.event('fv_first_paint', { ...this.timing(), ...check })
    else this.pendingFirstPaint = true
  }

  /** o que estava visível no 1º paint (headline/apoio/botão, fontes) */
  private paintCheck: Record<string, unknown> = {}

  /** ms desde o carregamento e desde que a página ficou visível (para os tempos). */
  timing() {
    const t = now()
    return { ms: t, ms_since_visible: this.started ? Math.max(0, t - this.visibleAt) : 0, preloaded: this.preloaded }
  }

  private watchFirstInteraction() {
    const once = () => {
      window.removeEventListener('pointerdown', once, true)
      window.removeEventListener('keydown', once, true)
      this.event('fv_first_interaction', this.timing())
    }
    window.addEventListener('pointerdown', once, true)
    window.addEventListener('keydown', once, true)
  }

  private watchErrors() {
    const report = (message: string, extra: Record<string, unknown>) => {
      if (this.errors >= MAX_ERRORS) return
      this.errors++
      this.event('fv_error', { message: message.slice(0, 500), ua: navigator.userAgent.slice(0, 300), ...extra })
    }
    window.addEventListener('error', (e) => {
      report(String(e.message || 'error'), { source: String(e.filename || '').slice(-200), line: e.lineno, col: e.colno })
    })
    window.addEventListener('unhandledrejection', (e) => {
      const r = (e as PromiseRejectionEvent).reason
      report(r instanceof Error ? r.message : String(r), { kind: 'unhandledrejection' })
    })
  }

  setScene(scene: string) {
    this.scene = scene
  }

  event(name: FvEvent, payload: Record<string, unknown> = {}, scene = this.scene) {
    this.push({ kind: 'event', tries: 0, sid: this.sessionId, name, scene, payload })
  }

  patch(fields: SessionPatch) {
    this.push({ kind: 'patch', tries: 0, id: this.sessionId, fields })
  }

  /** Evento de OUTRA sessão desta aba (ex.: a pessoa voltou do WhatsApp e a página recarregou). */
  eventFor(sid: string, name: FvEvent, payload: Record<string, unknown> = {}, scene = this.scene) {
    this.push({ kind: 'event', tries: 0, sid, name, scene, payload })
  }

  /**
   * Grava AGORA, com keepalive (sobrevive à troca de página para o WhatsApp). Também entra
   * na fila, que reenvia se este envio falhar (o RPC é idempotente).
   */
  saveNow(fields: SessionPatch) {
    this.patch(fields)
    if (this.disabled || !ENV.supabaseUrl || !ENV.supabaseAnonKey) return
    try {
      void fetch(`${ENV.supabaseUrl}/rest/v1/rpc/fv_patch_session`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: ENV.supabaseAnonKey,
          Authorization: `Bearer ${ENV.supabaseAnonKey}`,
        },
        body: JSON.stringify({ p_id: this.sessionId, p_fields: fields }),
      }).catch(() => undefined)
    } catch {
      /* a fila cobre */
    }
  }

  /** Quantos registros ainda esperam o Supabase (teste/diagnóstico). */
  get pending() {
    return this.queue.length + this.early.length
  }

  private push(job: Job) {
    if (this.disabled) return
    if (!this.started) {
      // sessão ainda não existe (página escondida): guarda para depois dela
      if (this.early.length < 60) this.early.push(job)
      return
    }
    this.queue.push(job)
    saveQueue(this.queue)
    void this.pump()
  }

  private getClient() {
    if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) return Promise.resolve(null)
    if (!this.client) {
      this.client = import('@supabase/supabase-js')
        .then(({ createClient }) => createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }))
        .catch(() => null)
    }
    return this.client
  }

  /**
   * 'ok' | 'drop' (erro definitivo) | 'retry' (erro do servidor, conta tentativa)
   * | 'offline' (rede/Supabase fora: NÃO conta tentativa, a fila só pausa)
   */
  private async run(db: SupabaseClient, job: Job): Promise<'ok' | 'retry' | 'drop' | 'offline'> {
    try {
      const { error, status } =
        job.kind === 'session'
          ? await db.rpc('fv_create_session', { p_id: job.id, p_ref_code: job.ref, p_fields: job.fields })
          : job.kind === 'event'
            ? await db.rpc('fv_log_event', { p_session_id: job.sid, p_name: job.name, p_scene: job.scene, p_payload: job.payload })
            : await db.rpc('fv_patch_session', { p_id: job.id, p_fields: job.fields })
      if (!error) return 'ok'
      if (error.code && PERMANENT.has(error.code)) return 'drop'
      if (!status || status >= 500 || !error.code) return 'offline'
      return 'retry'
    } catch {
      return 'offline'
    }
  }

  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      const db = await this.getClient()
      if (!db) return // sem credenciais: a fila fica guardada (e o app segue normal)
      while (this.queue.length) {
        const job = this.queue[0]
        const res = await this.run(db, job)
        if (res === 'offline') {
          saveQueue(this.queue)
          window.clearTimeout(this.retryTimer)
          this.retryTimer = window.setTimeout(() => void this.pump(), 15000)
          break
        }
        if (res === 'retry' && ++job.tries < MAX_TRIES) {
          saveQueue(this.queue)
          await new Promise((r) => setTimeout(r, 400 * 2 ** job.tries))
          continue
        }
        this.queue.shift()
        saveQueue(this.queue)
      }
    } finally {
      this.pumping = false
    }
  }
}

export const tracker = new Tracker()
if (typeof window !== 'undefined') (window as unknown as { __fvTracker: Tracker }).__fvTracker = tracker

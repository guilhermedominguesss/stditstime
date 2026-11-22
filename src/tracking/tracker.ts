import type { SupabaseClient } from '@supabase/supabase-js'
import { ENV } from '../funil/config'
import { detectDevice, detectInAppBrowser, generateRefCode, readAttribution, uuid, type Attribution } from './session'

/**
 * TRACKING (Supabase: funil_sessions / funil_events, no projeto do painel).
 *
 *  - A chave anon NÃO lê nada e NÃO escreve direto nas tabelas: tudo passa pelas RPCs
 *    security definer fv_create_session / fv_log_event / fv_patch_session
 *    (supabase/003_rpc.sql), que aplicam a trava de 24h e os limites por IP e por sessão.
 *  - Tudo passa por uma FILA sequencial (sessão primeiro, por causa da FK), espelhada em
 *    localStorage: se o Supabase cair ou a rede sumir, o fluxo continua e os registros
 *    são reenviados depois (no 'online' ou no próximo load).
 *  - Erro definitivo (limite, valor inválido, sessão expirada): descarta, não insiste.
 *  - Nada aqui lança erro para quem chamou. O cliente do Supabase é importado sob demanda.
 */

export type FvEvent =
  | 'fv_view' | 'fv_start' | 'fv_scene_enter' | 'fv_input' | 'fv_diagnosis_view' | 'fv_std_on'
  | 'fv_case_view' | 'fv_case_open_std' | 'fv_qualified' | 'fv_disqualified' | 'fv_whatsapp_click'
  | 'fv_checklist_check' | 'fv_back'

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
}

export type Job =
  | { kind: 'session'; id: string; ref: string; fields: Record<string, unknown>; tries: number }
  | { kind: 'event'; sid: string; name: FvEvent; scene: string; payload: Record<string, unknown>; tries: number }
  | { kind: 'patch'; id: string; fields: SessionPatch; tries: number }

export const QUEUE_KEY = 'fv_queue_v2'
const MAX_TRIES = 6
const MAX_QUEUE = 300
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

class Tracker {
  readonly sessionId = uuid()
  readonly refCode = generateRefCode()
  readonly attribution: Attribution
  private queue: Job[] = []
  private pumping = false
  private client: Promise<SupabaseClient | null> | null = null
  private started = false
  private scene = 'nicho'

  constructor() {
    this.attribution = typeof window !== 'undefined' ? readAttribution(window.location.search) : readAttribution('')
  }

  /** Cria a sessão e dispara fv_view. Idempotente (StrictMode). */
  init() {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    this.queue = loadQueue() // sobras de sessões anteriores vão primeiro
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
      },
    })
    this.event('fv_view')
    window.addEventListener('online', () => void this.pump())
    window.addEventListener('pagehide', () => saveQueue(this.queue))
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

  /** Quantos registros ainda esperam o Supabase (teste/diagnóstico). */
  get pending() {
    return this.queue.length
  }

  private push(job: Job) {
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
      // sem status HTTP (fetch falhou) ou 5xx de gateway: é indisponibilidade, não erro do registro
      if (!status || status >= 500 || !error.code) return 'offline'
      return 'retry'
    } catch {
      return 'offline'
    }
  }

  private retryTimer = 0

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
          // pausa preservando a ordem; volta no 'online', no próximo registro ou em 15s
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

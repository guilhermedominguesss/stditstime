import type { SupabaseClient } from '@supabase/supabase-js'
import { ENV } from '../funil/config'
import { detectDevice, detectInAppBrowser, generateRefCode, readAttribution, uuid, type Attribution } from './session'

/**
 * TRACKING (Supabase: funil_sessions / funil_events, no mesmo projeto do painel).
 *
 *  - A chave anon só INSERE (sessão e eventos) e ATUALIZA a própria sessão via RPC
 *    fv_patch_session (security definer). Nunca SELECT. Ver supabase/*.sql.
 *  - Tudo passa por uma FILA sequencial (sessão primeiro, por causa da FK), espelhada em
 *    localStorage: se o Supabase falhar ou a rede cair, a experiência continua e os
 *    registros são reenviados depois (no 'online' ou no próximo load).
 *  - Nada aqui lança erro para quem chamou.
 *  - O cliente do Supabase é importado sob demanda (fora do bundle inicial).
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

type Job =
  | { kind: 'session'; row: Record<string, unknown>; tries: number }
  | { kind: 'event'; row: Record<string, unknown>; tries: number }
  | { kind: 'patch'; id: string; fields: SessionPatch; tries: number }

const QUEUE_KEY = 'fv_queue_v1'
const MAX_TRIES = 6
const MAX_QUEUE = 300

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
      row: {
        id: this.sessionId,
        ref_code: this.refCode,
        ...this.attribution,
        device: detectDevice(ua, window.innerWidth),
        in_app_browser: detectInAppBrowser(ua),
        last_scene: this.scene,
      },
    })
    this.event('fv_view')
    window.addEventListener('online', () => this.pump())
    // abandono: se a pessoa sai antes de terminar, a última cena já está gravada (last_scene)
    window.addEventListener('pagehide', () => saveQueue(this.queue))
  }

  setScene(scene: string) {
    this.scene = scene
  }

  event(name: FvEvent, payload: Record<string, unknown> = {}, scene = this.scene) {
    this.push({ kind: 'event', tries: 0, row: { session_id: this.sessionId, name, scene, payload } })
  }

  patch(fields: SessionPatch) {
    this.push({ kind: 'patch', tries: 0, id: this.sessionId, fields })
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

  private async run(db: SupabaseClient, job: Job): Promise<boolean> {
    if (job.kind === 'session') {
      const { error } = await db.from('funil_sessions').insert(job.row)
      // 23505 = já existe (reenvio): conta como sucesso
      return !error || error.code === '23505'
    }
    if (job.kind === 'event') {
      const { error } = await db.from('funil_events').insert(job.row)
      return !error
    }
    const { error } = await db.rpc('fv_patch_session', { p_id: job.id, p_fields: job.fields })
    return !error
  }

  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      const db = await this.getClient()
      if (!db) return // sem credenciais: a fila fica guardada (e o app segue normal)
      while (this.queue.length) {
        const job = this.queue[0]
        let ok = false
        try {
          ok = await this.run(db, job)
        } catch {
          ok = false
        }
        if (ok || ++job.tries >= MAX_TRIES) {
          this.queue.shift()
          saveQueue(this.queue)
          continue
        }
        saveQueue(this.queue)
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break
        await new Promise((r) => setTimeout(r, 400 * 2 ** job.tries))
      }
    } finally {
      this.pumping = false
    }
  }
}

export const tracker = new Tracker()

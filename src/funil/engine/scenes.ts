import type { CaptionKey } from '../copy'
import { ROI_BOTTOM, ROI_TOP } from './geometry'

/**
 * CENAS DO MOTOR (visual, não negócio).
 *  - cam: ponto lógico no centro da área visível + zoom sobre o enquadramento base.
 *  - labels: DIVULGAÇÃO PROGRESSIVA. Só aparece o label do que importa na cena.
 *    (âncoras "SEU ANÚNCIO" e "SEU WHATSAPP" ficam sempre visíveis)
 *  - caption: legenda de filme da cena (o clímax troca a legenda por conta própria).
 */
export type EngineScene =
  | 'void' | 'cold_single' | 'cold_funnel'
  | 'segmento' | 'volume' | 'rota' | 'conversao' | 'ticket'
  | 'diagnostico' | 'std_on' | 'prova' | 'qualificacao' | 'saida'

export type LabelKey = 'segment' | 'exits' | 'deposit' | 'money' | 'score'

export interface SceneDef {
  cam: { cx: number; cy: number; zoom: number }
  /** 'single' = cold open: uma pessoa só; 'funnel' = fluxo normal */
  mode: 'none' | 'single' | 'funnel'
  walls: boolean
  /** saídas de vazamento abertas (partículas vazam) */
  exits: boolean
  labels: LabelKey[]
  caption: CaptionKey | null
  camMs?: number
}

const CY = (ROI_TOP + ROI_BOTTOM) / 2
const BASE = { cx: 195, cy: CY, zoom: 1 }

export const SCENES: Record<EngineScene, SceneDef> = {
  void: { cam: BASE, mode: 'none', walls: false, exits: false, labels: [], caption: null },
  cold_single: { cam: BASE, mode: 'single', walls: true, exits: false, labels: [], caption: 'cold_one' },
  cold_funnel: { cam: BASE, mode: 'funnel', walls: true, exits: false, labels: [], caption: 'cold_flow' },
  segmento: { cam: { cx: 195, cy: CY - 6, zoom: 1.04 }, mode: 'funnel', walls: true, exits: false, labels: ['segment'], caption: 'segmento', camMs: 1200 },
  volume: { cam: { cx: 200, cy: CY - 60, zoom: 1.15 }, mode: 'funnel', walls: true, exits: false, labels: ['segment'], caption: 'volume', camMs: 1100 },
  rota: { cam: BASE, mode: 'funnel', walls: true, exits: true, labels: ['exits'], caption: 'rota', camMs: 900 },
  conversao: { cam: BASE, mode: 'funnel', walls: true, exits: true, labels: ['deposit', 'score'], caption: 'conversao' },
  ticket: { cam: BASE, mode: 'funnel', walls: true, exits: true, labels: ['deposit', 'money'], caption: 'ticket' },
  diagnostico: { cam: { cx: 195, cy: CY, zoom: 0.92 }, mode: 'funnel', walls: true, exits: true, labels: ['exits', 'deposit', 'money', 'score'], caption: 'diagnostico', camMs: 1400 },
  std_on: { cam: BASE, mode: 'funnel', walls: true, exits: true, labels: ['deposit', 'money', 'score'], caption: 'std_intro', camMs: 900 },
  prova: { cam: { cx: 195, cy: CY + 40, zoom: 0.55 }, mode: 'funnel', walls: true, exits: true, labels: [], caption: 'prova', camMs: 650 },
  qualificacao: { cam: { cx: 195, cy: CY + 40, zoom: 0.6 }, mode: 'funnel', walls: true, exits: true, labels: [], caption: null, camMs: 900 },
  saida: { cam: { cx: 195, cy: CY, zoom: 0.95 }, mode: 'funnel', walls: true, exits: true, labels: ['score'], caption: 'saida', camMs: 1000 },
}

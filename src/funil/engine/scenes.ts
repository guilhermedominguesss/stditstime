/**
 * ENQUADRAMENTOS DE CÂMERA por cena (visual, não negócio).
 * cx/cy: ponto lógico que fica no centro da área visível (entre HUD e painel).
 * zoom: multiplicador sobre o enquadramento base (funil inteiro cabendo).
 */
export type EngineScene =
  | 'void' | 'cold_single' | 'cold_chaos' | 'cold_funnel'
  | 'segmento' | 'volume' | 'rota' | 'conversao' | 'ticket'
  | 'diagnostico' | 'std_on' | 'prova' | 'qualificacao' | 'saida'

export interface SceneDef {
  cam: { cx: number; cy: number; zoom: number }
  /** 'chaos' = partículas caindo soltas, sem funil; 'funnel' = escorrendo no funil */
  mode: 'none' | 'single' | 'chaos' | 'funnel'
  /** o wireframe do funil aparece */
  walls: boolean
  /** labels das saídas de vazamento aparecem */
  exits: boolean
  /** rastro de "R$" nos vazamentos */
  money: boolean
  camMs?: number
}

const BASE = { cx: 195, cy: 270, zoom: 1 }

export const SCENES: Record<EngineScene, SceneDef> = {
  void: { cam: BASE, mode: 'none', walls: false, exits: false, money: false },
  cold_single: { cam: BASE, mode: 'single', walls: false, exits: false, money: false },
  cold_chaos: { cam: BASE, mode: 'chaos', walls: false, exits: false, money: false },
  cold_funnel: { cam: BASE, mode: 'funnel', walls: true, exits: false, money: false },
  segmento: { cam: { cx: 195, cy: 262, zoom: 1.04 }, mode: 'funnel', walls: true, exits: false, money: false, camMs: 1200 },
  volume: { cam: { cx: 195, cy: 200, zoom: 1.18 }, mode: 'funnel', walls: true, exits: false, money: false, camMs: 1100 },
  rota: { cam: BASE, mode: 'funnel', walls: true, exits: true, money: false, camMs: 900 },
  conversao: { cam: { cx: 195, cy: 280, zoom: 1 }, mode: 'funnel', walls: true, exits: true, money: false },
  ticket: { cam: BASE, mode: 'funnel', walls: true, exits: true, money: true },
  diagnostico: { cam: { cx: 195, cy: 270, zoom: 0.88 }, mode: 'funnel', walls: true, exits: true, money: true, camMs: 1400 },
  std_on: { cam: { cx: 195, cy: 280, zoom: 1 }, mode: 'funnel', walls: true, exits: true, money: false, camMs: 900 },
  prova: { cam: { cx: 195, cy: 300, zoom: 0.42 }, mode: 'funnel', walls: true, exits: false, money: false, camMs: 650 },
  qualificacao: { cam: { cx: 195, cy: 300, zoom: 0.5 }, mode: 'funnel', walls: true, exits: false, money: false, camMs: 900 },
  saida: { cam: { cx: 195, cy: 280, zoom: 0.9 }, mode: 'funnel', walls: true, exits: true, money: false, camMs: 1000 },
}

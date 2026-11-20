import type { LeakId, RouteId } from '../config'

/**
 * GEOMETRIA DO FUNIL — espaço lógico 390×844 (retrato).
 *
 * O funil é descrito por "nós" em alturas fixas (KNOT_Y). Em cada nó, a rota define a
 * meia-largura (hw) e o desvio do eixo central (axis). Entre os nós, Catmull-Rom.
 * Como todas as rotas têm os mesmos nós, o morph entre rotas é um lerp de arrays.
 *
 * Tudo é amostrado numa LUT por y (1 unidade lógica): as partículas só leem a tabela.
 */

export const WORLD_W = 390
export const WORLD_H = 844
export const CENTER_X = WORLD_W / 2

export const KNOT_Y = [70, 130, 190, 250, 310, 370, 430] as const
export const MOUTH_Y = KNOT_Y[0]
export const NODE_Y = 468
export const TUBE_HW = 11

/** Lado de cada saída de vazamento (fixo em todas as rotas: não se interpola lado). */
export const EXIT_SIDE: Record<LeakId, -1 | 1> = { preco: -1, curioso: 1, contexto: -1 }
export const LEAK_IDS: LeakId[] = ['preco', 'curioso', 'contexto']

export interface Shape {
  hw: number[]
  axis: number[]
  /** y de cada saída de vazamento */
  exitY: Record<LeakId, number>
  /** portão (formulário): força 0..1 na altura gateY */
  gate: number
  gateY: number
  /** turbulência lateral (direct): força 0..1 centrada em turbY */
  turb: number
  turbY: number
  /**
   * Membrana do STD. O brief pede ~55% do funil; aqui ela fica logo abaixo da última
   * saída de vazamento, onde o funil ainda é largo (na rota WhatsApp, 55% cairia no tubo).
   */
  membraneY: number
}

const Z = [0, 0, 0, 0, 0, 0, 0]

export const SHAPES: Record<RouteId | 'default', Shape> = {
  default: {
    hw: [150, 122, 92, 62, 34, 16, TUBE_HW],
    axis: Z,
    exitY: { preco: 140, curioso: 180, contexto: 220 },
    gate: 0, gateY: 220, turb: 0, turbY: 220, membraneY: 252,
  },
  // largo e curto, sem barreira: tudo despenca de uma vez no WhatsApp
  whatsapp: {
    hw: [166, 136, 92, 50, 22, TUBE_HW, TUBE_HW],
    axis: Z,
    exitY: { preco: 128, curioso: 158, contexto: 190 },
    gate: 0, gateY: 220, turb: 0, turbY: 220, membraneY: 222,
  },
  // portão no meio: acumula, e parte escapa ali (sem contexto)
  formulario: {
    hw: [148, 118, 58, 74, 42, 16, TUBE_HW],
    axis: Z,
    exitY: { preco: 136, curioso: 166, contexto: 198 },
    gate: 1, gateY: 194, turb: 0, turbY: 220, membraneY: 252,
  },
  // fila lateral confusa: eixo desvia e as partículas se misturam
  direct: {
    hw: [146, 124, 104, 80, 44, 16, TUBE_HW],
    axis: [0, 14, 34, 38, 18, 4, 0],
    exitY: { preco: 146, curioso: 196, contexto: 238 },
    gate: 0, gateY: 220, turb: 1, turbY: 205, membraneY: 266,
  },
  // estreito, pouco fluxo
  nao_anuncia: {
    hw: [70, 58, 46, 33, 21, 14, TUBE_HW],
    axis: Z,
    exitY: { preco: 125, curioso: 165, contexto: 205 },
    gate: 0, gateY: 220, turb: 0, turbY: 220, membraneY: 232,
  },
}

export function cloneShape(s: Shape): Shape {
  return { ...s, hw: s.hw.slice(), axis: s.axis.slice(), exitY: { ...s.exitY } }
}

/** Escreve em `out` o lerp entre a e b (sem alocar). */
export function lerpShape(out: Shape, a: Shape, b: Shape, t: number) {
  for (let i = 0; i < out.hw.length; i++) {
    out.hw[i] = a.hw[i] + (b.hw[i] - a.hw[i]) * t
    out.axis[i] = a.axis[i] + (b.axis[i] - a.axis[i]) * t
  }
  for (const k of LEAK_IDS) out.exitY[k] = a.exitY[k] + (b.exitY[k] - a.exitY[k]) * t
  out.gate = a.gate + (b.gate - a.gate) * t
  out.gateY = a.gateY + (b.gateY - a.gateY) * t
  out.turb = a.turb + (b.turb - a.turb) * t
  out.turbY = a.turbY + (b.turbY - a.turbY) * t
  out.membraneY = a.membraneY + (b.membraneY - a.membraneY) * t
}

const SEG = KNOT_Y[1] - KNOT_Y[0]
const LAST = KNOT_Y.length - 1

function catmull(v: number[], y: number): number {
  if (y <= KNOT_Y[0]) return v[0]
  if (y >= KNOT_Y[LAST]) return v[LAST]
  const f = (y - KNOT_Y[0]) / SEG
  const i = Math.floor(f)
  const t = f - i
  const p0 = v[Math.max(0, i - 1)]
  const p1 = v[i]
  const p2 = v[Math.min(LAST, i + 1)]
  const p3 = v[Math.min(LAST, i + 2)]
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

/** LUT de meia-largura e eixo por y lógico. */
export class FunnelLut {
  readonly hw = new Float32Array(WORLD_H)
  readonly cx = new Float32Array(WORLD_H)

  build(s: Shape) {
    for (let y = 0; y < WORLD_H; y++) {
      if (y > NODE_Y) {
        this.hw[y] = TUBE_HW
        this.cx[y] = CENTER_X
        continue
      }
      this.hw[y] = Math.max(TUBE_HW, catmull(s.hw, y))
      this.cx[y] = CENTER_X + catmull(s.axis, y)
    }
  }

  hwAt(y: number) {
    const i = y < 0 ? 0 : y >= WORLD_H ? WORLD_H - 1 : y | 0
    return this.hw[i]
  }

  cxAt(y: number) {
    const i = y < 0 ? 0 : y >= WORLD_H ? WORLD_H - 1 : y | 0
    return this.cx[i]
  }

  /** x da parede no lado `side` (-1 esquerda, 1 direita). */
  wallX(y: number, side: number) {
    return this.cxAt(y) + side * this.hwAt(y)
  }
}

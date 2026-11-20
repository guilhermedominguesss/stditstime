import type { LeakId, RouteId } from '../config'

/**
 * GEOMETRIA DO FUNIL — espaço lógico 390×844 (retrato).
 *
 * Layout pensado para o "teste do leigo":
 *  - eixo do funil um pouco à direita (x = 210): a coluna da esquerda abriga os labels
 *    das saídas de vazamento e o DEPÓSITO de perdidos (canto inferior esquerdo);
 *  - todas as saídas ficam na parede ESQUERDA (o vazamento cai direto no depósito);
 *  - o lado direito fica livre para a raia "Ainda não está pronto" (depois do STD).
 *
 * O funil é descrito por "nós" em alturas fixas (KNOT_Y). Em cada nó, a rota define a
 * meia-largura (hw) e o desvio do eixo (axis). Entre os nós, Catmull-Rom. Como todas as
 * rotas têm os mesmos nós, o morph entre rotas é um lerp de arrays. Tudo é amostrado
 * numa LUT por y: as partículas só leem a tabela.
 */

export const WORLD_W = 390
export const WORLD_H = 844
export const AXIS_X = 210

export const MOUTH_Y = 100
/** fim do tubo = topo do nó do WhatsApp */
export const NODE_Y = 380
export const KNOT_Y = [100, 146.67, 193.33, 240, 286.67, 333.33, 380] as const
export const TUBE_HW = 11

/** Faixa lógica que o enquadramento base mostra inteira (ícone do anúncio → depósito). */
export const ROI_TOP = 50
export const ROI_BOTTOM = 482

/** Depósito de perdidos: canto inferior esquerdo. Pilha em "pirâmide" (9+8+7+6 = 30). */
export const DEPOSIT = { x0: 16, floorY: 470, dx: 10, dy: 8.6, rows: [9, 8, 7, 6] } as const
export const DEPOSIT_SLOTS = DEPOSIT.rows.reduce((a, b) => a + b, 0)

/** Todas as saídas de vazamento na parede esquerda. */
export const EXIT_SIDE: Record<LeakId, -1 | 1> = { preco: -1, curioso: -1, contexto: -1 }
export const LEAK_IDS: LeakId[] = ['preco', 'curioso', 'contexto']

export interface Shape {
  hw: number[]
  axis: number[]
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
    hw: [105, 92, 76, 56, 32, 14, TUBE_HW],
    axis: Z,
    exitY: { preco: 126, curioso: 168, contexto: 210 },
    gate: 0, gateY: 200, turb: 0, turbY: 200, membraneY: 244,
  },
  // largo e curto, sem barreira: tudo despenca de uma vez no WhatsApp
  whatsapp: {
    hw: [112, 96, 70, 40, 18, TUBE_HW, TUBE_HW],
    axis: Z,
    exitY: { preco: 122, curioso: 160, contexto: 198 },
    gate: 0, gateY: 200, turb: 0, turbY: 200, membraneY: 226,
  },
  // portão no meio: acumula, e parte escapa ali (sem contexto)
  formulario: {
    hw: [104, 84, 46, 60, 34, 14, TUBE_HW],
    axis: Z,
    exitY: { preco: 122, curioso: 158, contexto: 194 },
    gate: 1, gateY: 192, turb: 0, turbY: 200, membraneY: 240,
  },
  // fila lateral confusa: eixo desvia e as partículas se misturam
  direct: {
    hw: [102, 90, 78, 60, 34, 14, TUBE_HW],
    axis: [0, 10, 24, 26, 12, 3, 0],
    exitY: { preco: 130, curioso: 174, contexto: 218 },
    gate: 0, gateY: 200, turb: 1, turbY: 200, membraneY: 252,
  },
  // estreito, pouco fluxo
  nao_anuncia: {
    hw: [56, 48, 40, 30, 20, 13, TUBE_HW],
    axis: Z,
    exitY: { preco: 124, curioso: 164, contexto: 204 },
    gate: 0, gateY: 200, turb: 0, turbY: 200, membraneY: 232,
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
  const i = Math.min(LAST - 1, Math.floor(f))
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
        this.cx[y] = AXIS_X
        continue
      }
      this.hw[y] = Math.max(TUBE_HW, catmull(s.hw, y))
      this.cx[y] = AXIS_X + catmull(s.axis, y)
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

/** Posição do slot k da pilha do depósito. */
export function depositSlot(k: number, out: { x: number; y: number }) {
  let row = 0
  let i = k
  while (row < DEPOSIT.rows.length - 1 && i >= DEPOSIT.rows[row]) {
    i -= DEPOSIT.rows[row]
    row++
  }
  out.x = DEPOSIT.x0 + row * (DEPOSIT.dx / 2) + Math.min(i, DEPOSIT.rows[row] - 1) * DEPOSIT.dx
  out.y = DEPOSIT.floorY - row * DEPOSIT.dy
  return out
}

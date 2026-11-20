/**
 * CONFIG DO FUNIL VIVO — toda constante de negócio mora aqui, com a origem comentada.
 * Nenhum componente nem o motor deve ter número de negócio solto.
 */

/* ------------------------------------------------------------------ */
/* Caso real de referência                                             */
/* ------------------------------------------------------------------ */

/** Origem: STD Thais Kislin (Estética, Curitiba), painel do funil, últimos 30 dias. */
export const CASE_REF = {
  name: 'Thais Kislin',
  niche: 'Estética',
  city: 'Curitiba',
  leads: 135,
  appointments: 75,
  closes: 49,
  qualifiedReplyRate: 0.77,
  abandonRate: 0.01,
  /** closes / leads = 49/135 ≈ 36% (chip "DE LEAD A CLIENTE"). */
  leadToClient: 49 / 135,
} as const

/** Conversão de referência: agendamentos / leads do caso real ≈ 0,556. */
export const REF_CONV = CASE_REF.appointments / CASE_REF.leads

/* ------------------------------------------------------------------ */
/* Premissas da projeção (conservadoras de propósito)                  */
/* ------------------------------------------------------------------ */

/** Premissa conservadora: o STD fecha só METADE da distância até a conversão do caso real. */
export const GAP_CAPTURE = 0.5
/** Das conversas sérias A MAIS, metade vira venda. (No caso real foi 49/75 ≈ 0,65.) */
export const CLOSE_ASSUMED = 0.5
/** Do que vaza, 15% seria recuperável se o lead chegasse qualificado. */
export const RECOVERABLE = 0.15

/* ------------------------------------------------------------------ */
/* Entradas                                                            */
/* ------------------------------------------------------------------ */

/** Volume (leads/mês): slider logarítmico. 1.000 aparece como "1.000+" e vale 1.000 nas contas. */
export const LEADS_MIN = 10
export const LEADS_MAX = 1000
export const LEADS_DEFAULT = 100
export const LEADS_SHORTCUTS = [30, 100, 300, 1000] as const

export type RouteId = 'whatsapp' | 'formulario' | 'direct' | 'nao_anuncia'
export const ROUTES: RouteId[] = ['whatsapp', 'formulario', 'direct', 'nao_anuncia']

export type SegmentId =
  | 'clinica' | 'estetica' | 'odonto' | 'educacao'
  | 'servicos' | 'varejo' | 'alimentacao' | 'outro'

export type TicketId = 'ate_300' | '300_1k' | '1k_3k' | '3k_mais'
/** Ponto médio de cada faixa de ticket (R$). "Acima de R$3.000" usa 4.000 (conservador). */
export const TICKET_MIDPOINTS: Record<TicketId, number> = {
  ate_300: 200,
  '300_1k': 650,
  '1k_3k': 2000,
  '3k_mais': 4000,
}

/* ------------------------------------------------------------------ */
/* Qualificação (cena 9)                                               */
/* ------------------------------------------------------------------ */

export type InvesteId = 'sim' | 'as_vezes' | 'ainda_nao'
export type FaturamentoId = 'ate_10k' | '10_30k' | '30_100k' | '100k_mais'

/** Regra de negócio: investe em anúncio (ao menos às vezes) e fatura acima de R$10 mil. */
export const isQualified = (investe: InvesteId, faturamento: FaturamentoId) =>
  investe !== 'ainda_nao' && faturamento !== 'ate_10k'

/* ------------------------------------------------------------------ */
/* Visual do motor (NÃO é estatística)                                 */
/* ------------------------------------------------------------------ */

export type LeakId = 'preco' | 'curioso' | 'contexto'

/**
 * Distribuição VISUAL das partículas que vazam, por rota. É dramatização para o funil
 * "parecer" a rota escolhida, NÃO é dado medido. Nunca mostre esses números na tela
 * como se fossem estatística.
 */
export const LEAK_SPLIT_VISUAL: Record<RouteId | 'default', Record<LeakId, number>> = {
  default: { preco: 0.34, curioso: 0.33, contexto: 0.33 },
  whatsapp: { preco: 0.5, curioso: 0.3, contexto: 0.2 },
  formulario: { preco: 0.25, curioso: 0.25, contexto: 0.5 },
  direct: { preco: 0.35, curioso: 0.45, contexto: 0.2 },
  nao_anuncia: { preco: 0.34, curioso: 0.33, contexto: 0.33 },
}

/**
 * Conversão (A/10) usada SÓ no visual enquanto a pessoa ainda não respondeu a cena 4
 * (ex.: cena 3, quando as saídas de vazamento aparecem). Nunca entra em conta exibida.
 */
export const VISUAL_DEFAULT_A10 = 4

/**
 * Depois do STD (visual): "sem contexto" fecha, "só preço" cai pela metade e o resto
 * dos não-qualificados é desviado para nutrição em vez de vazar.
 */
export const STD_LEAK_EFFECT = { precoScale: 0.5, contextoScale: 0 } as const

/**
 * Densidade de partículas: spawnRate = lerp(4, 60, log10(L/10)/2) partículas/s.
 * Mapeamento visual, não literal (30 leads = garoa, 1.000 = cachoeira).
 */
export const SPAWN_MIN = 4
export const SPAWN_MAX = 60
/** Multiplicador visual de fluxo por rota ("ainda não anuncio" = pouco fluxo). */
export const ROUTE_FLOW_MULT: Record<RouteId | 'default', number> = {
  default: 1,
  whatsapp: 1,
  formulario: 0.9,
  direct: 0.9,
  nao_anuncia: 0.45,
}

import type { LeakId, SegmentId } from './config'

/**
 * TEXTOS do Funil Vivo. Linguagem de leigo: quem lê é dono de negócio, não marqueteiro.
 * (Copy das cenas/painéis entra aqui na Fase 3.)
 */

/* ------------------------------------------------------------------ */
/* Legenda de filme (máx. 60 caracteres, testado em copy.test.ts)     */
/* ------------------------------------------------------------------ */

export const CAPTIONS = {
  cold_one: 'Cada ponto é uma pessoa que clicou no seu anúncio.',
  cold_flow: 'Todo mês chega muita gente. Veja pra onde elas vão.',
  segmento: 'Cada ponto é uma pessoa que clicou no seu anúncio.',
  volume: 'Quanto mais gente te chama, mais pontos caem.',
  rota: 'Os vermelhos desistiram antes de virar conversa.',
  conversao: 'Os vermelhos se perdem. Só uma parte chega pronta.',
  ticket: 'Cada vermelho é dinheiro que você já pagou pra atrair.',
  diagnostico: 'Esse é o seu funil hoje. O vermelho é o que você perde.',
  std_intro: 'Agora veja o mesmo anúncio com um STD.',
  std_filter: 'O filtro conhece cada pessoa antes do seu WhatsApp.',
  std_hero1: 'Essa sabe o que quer. Passa e chega pronta pra comprar.',
  std_hero2: 'Essa só estava curiosa. Recebe conteúdo, não seu tempo.',
  std_running: 'Mesmo anúncio. Agora chegam mais pessoas prontas.',
  prova: 'Isso aconteceu num funil de verdade.',
  saida: 'Você acabou de passar por um STD.',
} as const

export type CaptionKey = keyof typeof CAPTIONS

/* ------------------------------------------------------------------ */
/* Labels do motor (canvas). Mínimo 12px na tela.                      */
/* ------------------------------------------------------------------ */

export const ENGINE_LABELS = {
  anuncio: 'SEU ANÚNCIO',
  whatsapp: 'SEU WHATSAPP',
  coldTag: '1 pessoa clicou no seu anúncio',
  exits: {
    preco: ['Só quis saber', 'o preço'],
    curioso: ['Só estava', 'curioso'],
    contexto: ['Chegou sem dizer', 'o que quer'],
  } satisfies Record<LeakId, [string, string]>,
  filtro: 'FILTRO STD',
  filtroSub: ['conhece a pessoa antes', 'do seu WhatsApp'],
  lane: ['Ainda não está', 'pronto → recebe', 'conteúdo'],
  chegaram: ['CHEGARAM'],
  prontas: ['PRONTAS PRA', 'COMPRAR'],
  perdidos: 'PERDIDOS',
  pessoas: (n: string) => `${n} pessoas`,
  heroWhen: 'Quando: este mês',
  heroProfile: 'Perfil: ✓',
  heroWant: (procedimento: string) => `Quer: ${procedimento}`,
  heroCurious: 'Só curiosidade',
} as const

/* ------------------------------------------------------------------ */
/* Segmentos                                                           */
/* ------------------------------------------------------------------ */

/** label: aparece na boca do funil e no HUD. procedimento: etiqueta do herói no clímax. */
export const SEGMENTS: Record<SegmentId, { label: string; procedimento: string }> = {
  clinica: { label: 'CLÍNICA / SAÚDE', procedimento: 'Check-up' },
  estetica: { label: 'ESTÉTICA / BELEZA', procedimento: 'Bioestimulador' },
  odonto: { label: 'ODONTOLOGIA', procedimento: 'Clareamento' },
  educacao: { label: 'EDUCAÇÃO / CURSOS', procedimento: 'Curso de inglês' },
  servicos: { label: 'SERVIÇOS', procedimento: 'Orçamento' },
  varejo: { label: 'COMÉRCIO / VAREJO', procedimento: 'Pedido semanal' },
  alimentacao: { label: 'ALIMENTAÇÃO', procedimento: 'Encomenda' },
  outro: { label: 'SEU NEGÓCIO', procedimento: 'Agendar horário' },
}

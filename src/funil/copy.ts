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
  std_hero2: 'Essa ainda está pesquisando. Chega também, já identificada.',
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
  chegaram: ['CHEGARAM'],
  prontas: ['PRONTAS PRA', 'COMPRAR'],
  perdidos: 'PERDIDOS',
  pessoas: (n: string) => `${n} pessoas`,
  heroWhen: 'Quando: este mês',
  heroProfile: 'Perfil: ✓',
  heroWant: (procedimento: string) => `Quer: ${procedimento}`,
  heroResearching: 'Ainda pesquisando',
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

/* ------------------------------------------------------------------ */
/* Saída de não qualificado (cena 10B) — checklist                    */
/* ------------------------------------------------------------------ */

/** "Os 7 vazamentos mais comuns" — itens que o próprio dono marca. */
export const CHECKLIST_VAZAMENTOS = [
  'O anúncio cai direto no WhatsApp, sem nenhuma etapa antes.',
  'O lead chega sem dizer o que quer.',
  'A primeira pergunta que você recebe é o preço.',
  'Não existe filtro entre o curioso e o decidido.',
  'Você não sabe em que etapa o lead desiste.',
  'Você só descobre quem é curioso depois de mandar o preço.',
  'Seu anúncio é otimizado pra mensagem, não pra cliente qualificado.',
] as const

/* ------------------------------------------------------------------ */
/* Caixa de entrada viva (/lab3)                                       */
/* ------------------------------------------------------------------ */

export const INBOX = {
  nicheTitle: 'Qual é o seu negócio?',
  nicheSub: 'Um toque. Vamos simular a sua caixa de entrada.',
  segmentChip: {
    clinica: 'Clínica / saúde',
    estetica: 'Estética / beleza',
    odonto: 'Odontologia',
    educacao: 'Educação / cursos',
    servicos: 'Serviços',
    varejo: 'Comércio / varejo',
    alimentacao: 'Alimentação',
    outro: 'Outro',
  } satisfies Record<SegmentId, string>,
  title: 'Mensagens',
  replyOne: 'Responda uma.',
  reply: (price: string) => `O valor é R$ ${price}!`,
  send: 'Enviar',
  seen: 'Visualizada 09:43',
  typing: 'digitando…',
  ghostSeal: 'sumiu depois do preço',
  ghostCounter: (n: number, total: number) => [`${n} DE ${total}`, 'SUMIRAM DEPOIS DO PREÇO'] as const,
  question: 'Isso te parece familiar?',
  cta: 'Ver o mesmo anúncio com filtro',
  ctaSub: 'STD: uma etapa antes do WhatsApp que conhece a pessoa',
  readyTag: 'pronta pra agendar',
  researchingTag: 'ainda pesquisando',
  fieldQuer: 'Quer',
  fieldQuando: 'Quando',
  phrase: 'Mesmo anúncio. Outra conversa.',
  scoreReady: 'PRONTAS PRA AGENDAR',
  scoreIdentified: 'IDENTIFICADAS ANTES DA 1ª RESPOSTA',
  scoreReadySub: (pct: number) => `${pct}% de respostas qualificadas no caso real`,
  footer: 'Quem ainda não está pronto também chega, mas você já sabe disso antes de responder.',
  openHint: 'Toque num card para ver a mensagem que chega.',
  triageHeader: 'Resumo da triagem',
  triageIntro: 'Oi! Vim pelo anúncio e fiz a triagem.',
  triageName: (first: string) => `Meu nome é ${first}.`,
  back: 'Voltar',
  proofCta: 'Isso é real?',
  proofLabel: 'CASO REAL · ÚLTIMOS 30 DIAS',
  proofPlaceholder: 'A cena da prova entra aqui (Fase 6).',
  proofBack: 'Voltar à caixa de entrada',
} as const

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
/**
 * Placar "PRONTAS PRA COMPRAR" = conversas sérias × esta taxa. Usa a MESMA premissa da
 * "receita a mais" (CLOSE_ASSUMED), para o placar e a projeção nunca se contradizerem.
 */
export const READY_TO_BUY_SHARE = CLOSE_ASSUMED
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

/*
 * Depois do STD (visual): o STD não barra ninguém. TODOS chegam no WhatsApp — as
 * qualificadas em signal, as que ainda estão pesquisando em cinza, já identificadas.
 * (Acompanhar quem ainda não está pronto é trabalho do comercial do cliente.)
 */

/**
 * Densidade de partículas: spawnRate = lerp(SPAWN_MIN, SPAWN_MAX, log10(L/10)/2) partículas/s.
 * Mapeamento visual, não literal (30 leads = garoa, 1.000 = cachoeira).
 * Teste do leigo: no máximo MAX_VISIBLE partículas na tela, maiores e mais lentas, para
 * cada ponto ser lido como "uma pessoa". (O brief original pedia 4–60/s; ficou ilegível.)
 */
export const SPAWN_MIN = 2
export const SPAWN_MAX = 22
export const MAX_VISIBLE = 90
/** Multiplicador visual de fluxo por rota ("ainda não anuncio" = pouco fluxo). */
export const ROUTE_FLOW_MULT: Record<RouteId | 'default', number> = {
  default: 1,
  whatsapp: 1,
  formulario: 0.9,
  direct: 0.9,
  nao_anuncia: 0.45,
}

/* ------------------------------------------------------------------ */
/* Caixa de entrada por nicho (/lab3)                                  */
/* ------------------------------------------------------------------ */

/**
 * Pessoa da caixa de entrada. Conteúdo ILUSTRATIVO (dramatização para a demo, não dado real).
 *  - msg: o que ela manda HOJE, sem STD
 *  - readyBefore: já estava pronta mesmo sem STD (não some depois do preço)
 *  - ready: com a triagem, chega "pronta pra agendar"; senão "ainda pesquisando"
 *  - quer / quando / extra: os 3 campos do card da triagem
 *
 * Regras de cada nicho (testadas em config.test.ts): 8 pessoas; a ÚLTIMA a chegar (topo
 * da lista, a que a pessoa responde) pergunta preço e não está pronta; exatamente 2
 * readyBefore, ambas ready; exatamente 6 ready. As 6 que não eram readyBefore "somem
 * depois do preço" na demo da dor.
 * O STD não barra ninguém: as 8 chegam de novo, todas identificadas.
 */
export interface InboxPerson {
  name: string
  msg: string
  readyBefore: boolean
  ready: boolean
  quer: string
  quando: string
  extra: string
}

export interface InboxNiche {
  /** rótulo do 3º campo do card (ex.: "1ª vez") */
  extraLabel: string
  /** preço da resposta "O valor é R$ X!": ILUSTRATIVO, ordem de grandeza do ticket do nicho */
  priceExample: number
  people: InboxPerson[]
}

const P = (name: string, msg: string, readyBefore: boolean, ready: boolean, quer: string, quando: string, extra: string): InboxPerson =>
  ({ name, msg, readyBefore, ready, quer, quando, extra })

export const INBOX_BANK: Record<SegmentId, InboxNiche> = {
  estetica: {
    extraLabel: '1ª vez',
    priceExample: 650,
    people: [
      P('Mariana Costa', 'oi, quanto custa o botox?', false, true, 'Botox · testa', 'até dia 12', 'sim'),
      P('Rafael Nunes', 'valor?', false, true, 'Harmonização · queixo', 'este mês', 'sim'),
      P('Carla Mendes', 'tem horário amanhã à tarde?', true, true, 'Limpeza de pele', 'amanhã à tarde', 'não'),
      P('Bruno Teixeira', '?', false, false, 'Depilação a laser · costas', 'sem data', 'sim'),
      P('Fernanda Alves', 'qual o preço do procedimento?', false, true, 'Bioestimulador · rosto', 'próximas 2 semanas', 'sim'),
      P('Diego Martins', 'oi', false, false, 'Peeling', 'só comparando preços', 'sim'),
      P('Beatriz Rocha', 'vi o anúncio, tem horário sábado?', true, true, 'Sculpt Ice · abdômen', 'sábado', 'não'),
      P('Juliana Reis', 'oi, quanto fica o preenchimento?', false, true, 'Preenchimento labial', 'este mês', 'sim'),
    ],
  },
  odonto: {
    extraLabel: 'Já avaliou',
    priceExample: 1200,
    people: [
      P('Paulo Henrique', 'quanto é o clareamento?', false, true, 'Clareamento', 'antes do casamento, em março', 'não'),
      P('Aline Martins', 'valor?', false, true, 'Facetas · 4 dentes', 'este mês', 'sim'),
      P('Marcos Vinícius', 'tem horário pra avaliação amanhã?', true, true, 'Avaliação', 'amanhã cedo', 'não'),
      P('Patrícia Lima', '?', false, false, 'Aparelho', 'ainda vendo preços', 'não'),
      P('Gustavo Ramos', 'qual o preço do implante?', false, true, 'Implante · 1 dente', 'próximas semanas', 'sim'),
      P('Renata Souza', 'oi', false, false, 'Limpeza', 'sem pressa', 'não'),
      P('Tiago Ferreira', 'dá pra ver uma dor no dente hoje?', true, true, 'Urgência · dor de dente', 'hoje', 'não'),
      P('Camila Duarte', 'quanto custa a lente de contato dental?', false, true, 'Lentes de contato', 'este mês', 'sim'),
    ],
  },
  clinica: {
    extraLabel: 'Para quem',
    priceExample: 280,
    people: [
      P('Roberto Alves', 'quanto é a consulta?', false, true, 'Consulta · cardiologia', 'esta semana', 'ele mesmo'),
      P('Sandra Moura', 'valor?', false, true, 'Check-up completo', 'este mês', 'ela mesma'),
      P('Felipe Castro', 'tem horário amanhã?', true, true, 'Retorno', 'amanhã à tarde', 'ele mesmo'),
      P('Larissa Pinto', '?', false, false, 'Dermatologia', 'sem data', 'ela mesma'),
      P('Eduardo Lima', 'aceita convênio? quanto fica particular?', false, true, 'Check-up · empresa', 'próximo mês', '3 funcionários'),
      P('Vanessa Rocha', 'oi', false, false, 'Consulta', 'só pesquisando', 'a mãe'),
      P('André Souza', 'tem horário sábado de manhã?', true, true, 'Pediatria', 'sábado de manhã', 'o filho'),
      P('Cláudia Reis', 'quanto custa a consulta particular?', false, true, 'Consulta · ginecologia', 'próxima semana', 'ela mesma'),
    ],
  },
  educacao: {
    extraLabel: 'Nível',
    priceExample: 390,
    people: [
      P('Lucas Andrade', 'quanto é a mensalidade?', false, true, 'Inglês', 'começar em fevereiro', 'intermediário'),
      P('Gabriela Lopes', 'valor?', false, true, 'Espanhol · viagem', 'começar este mês', 'básico'),
      P('Rodrigo Pires', 'tem turma à noite?', true, true, 'Inglês · noite', 'próxima turma', 'avançado'),
      P('Isabela Santos', '?', false, false, 'Curso de idiomas', 'ainda decidindo', 'iniciante'),
      P('Matheus Carvalho', 'qual o preço do curso?', false, true, 'Inglês para negócios', 'este mês', 'intermediário'),
      P('Letícia Gomes', 'oi', false, false, 'Inglês infantil', 'ano que vem', 'iniciante'),
      P('Daniel Oliveira', 'posso fazer aula experimental sábado?', true, true, 'Aula experimental', 'sábado', 'básico'),
      P('Priscila Barros', 'quanto custa o curso de inglês?', false, true, 'Inglês · conversação', 'começar já', 'intermediário'),
    ],
  },
  servicos: {
    extraLabel: 'Verba',
    priceExample: 2500,
    people: [
      P('Ricardo Moraes', 'quanto custa um projeto?', false, true, 'Reforma · cozinha', 'prazo de 30 dias', 'definida'),
      P('Tatiane Freitas', 'valor?', false, true, 'Contabilidade · abrir LTDA', 'este mês', 'definida'),
      P('Leonardo Dias', 'consegue visitar amanhã?', true, true, 'Orçamento no local', 'amanhã', 'definida'),
      P('Simone Araújo', '?', false, false, 'Orçamento', 'sem prazo', 'ainda não'),
      P('Vinícius Rezende', 'qual o preço do serviço?', false, true, 'Manutenção mensal', 'começar já', 'definida'),
      P('Elaine Cardoso', 'oi', false, false, 'Consultoria', 'só cotando', 'ainda não'),
      P('Fábio Monteiro', 'dá pra fazer uma reunião sexta?', true, true, 'Reunião de proposta', 'sexta', 'definida'),
      P('Adriana Mello', 'quanto fica o orçamento?', false, true, 'Projeto · escritório', 'prazo de 45 dias', 'definida'),
    ],
  },
  varejo: {
    extraLabel: 'Entrega',
    priceExample: 189,
    people: [
      P('Marcelo Pinto', 'quanto custa?', false, true, 'Kit presente', 'até sexta', 'retira na loja'),
      P('Débora Lins', 'valor?', false, true, 'Pedido semanal · escritório', 'toda segunda', 'entrega'),
      P('Henrique Batista', 'tem pra pronta entrega hoje?', true, true, 'Tênis · número 42', 'hoje', 'retira na loja'),
      P('Natália Prado', '?', false, false, 'Presente', 'sem data', 'a definir'),
      P('Alexandre Cunha', 'qual o preço no atacado?', false, true, 'Atacado · 50 peças', 'este mês', 'entrega'),
      P('Jéssica Vieira', 'oi', false, false, 'Vestido', 'só olhando', 'a definir'),
      P('Caio Medeiros', 'vocês entregam amanhã?', true, true, 'Cesta de aniversário', 'amanhã', 'entrega'),
      P('Luana Ribeiro', 'quanto fica com o frete?', false, true, 'Conjunto · tamanho M', 'esta semana', 'entrega'),
    ],
  },
  alimentacao: {
    extraLabel: 'Pessoas',
    priceExample: 320,
    people: [
      P('Sérgio Campos', 'quanto é o kit festa?', false, true, 'Kit festa', 'sábado', '40'),
      P('Mônica Farias', 'valor?', false, true, 'Bolo de aniversário', 'dia 18', '25'),
      P('Júlio César', 'consegue encomenda pra amanhã?', true, true, 'Salgados · 200 unidades', 'amanhã', '30'),
      P('Bianca Torres', '?', false, false, 'Doces', 'sem data', 'a definir'),
      P('Otávio Brandão', 'qual o preço do almoço corporativo?', false, true, 'Almoço · empresa', 'toda semana', '15'),
      P('Carolina Neves', 'oi', false, false, 'Bolo', 'só vendo o cardápio', 'a definir'),
      P('Wagner Lima', 'faz entrega sábado?', true, true, 'Marmitas da semana', 'entrega sábado', '2'),
      P('Rafaela Antunes', 'quanto custa o cento de salgado?', false, true, 'Salgados · 300 unidades', 'dia 20', '60'),
    ],
  },
  outro: {
    extraLabel: 'Já é cliente',
    priceExample: 450,
    people: [
      P('Rogério Fontes', 'quanto custa?', false, true, 'Primeiro atendimento', 'esta semana', 'não'),
      P('Paula Mendes', 'valor?', false, true, 'Pacote mensal', 'este mês', 'sim'),
      P('Nelson Prado', 'tem horário amanhã?', true, true, 'Agendar horário', 'amanhã', 'sim'),
      P('Kelly Ramos', '?', false, false, 'Informações', 'sem data', 'não'),
      P('Fernando Brito', 'qual o preço do serviço?', false, true, 'Plano completo', 'começar já', 'não'),
      P('Sabrina Costa', 'oi', false, false, 'Orçamento', 'só pesquisando', 'não'),
      P('Igor Santana', 'consigo ir sábado?', true, true, 'Visita', 'sábado', 'sim'),
      P('Viviane Lopes', 'quanto fica o pacote?', false, true, 'Pacote · 3 meses', 'próxima semana', 'não'),
    ],
  },
}

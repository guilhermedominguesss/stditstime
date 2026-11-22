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
  /**
   * Ticket médio ILUSTRATIVO do nicho (ordem de grandeza). Usado no "≈ R$ em conversas
   * perdidas" antes de a pessoa dizer o próprio ticket, e na resposta dos nichos sem conselho.
   */
  ticketMedio: number
  /**
   * Resposta pré-digitada na demo da dor. Odonto, estética e clínica NÃO mostram preço
   * (regras de conselho profissional): respondem que depende da avaliação.
   */
  reply: string
  /**
   * "Antes de chamar, viu:" — páginas/etapas do STD que a pessoa viu antes do WhatsApp.
   * 5 por nicho; cada card mostra 3. NUNCA preço (regras de conselho profissional).
   */
  seenBefore: string[]
  people: InboxPerson[]
}

/** Resposta dos nichos regulados por conselho (sem preço). */
export const REPLY_AVALIACAO = 'Depende da avaliação! Quer agendar um horário?'
const priceReply = (v: number) => `O valor é R$ ${v.toLocaleString('pt-BR')}!`

/** Nomes extras para a pergunta "de cada 10" (o nicho tem 8 pessoas). */
export const INBOX_EXTRA_NAMES = ['Ana Paula', 'José Carlos'] as const

const P = (name: string, msg: string, readyBefore: boolean, ready: boolean, quer: string, quando: string, extra: string): InboxPerson =>
  ({ name, msg, readyBefore, ready, quer, quando, extra })

export const INBOX_BANK: Record<SegmentId, InboxNiche> = {
  estetica: {
    extraLabel: '1ª vez',
    ticketMedio: 650,
    reply: REPLY_AVALIACAO,
    seenBefore: ['como funciona', 'resultados reais', 'quantas sessões', 'tempo de recuperação', 'quem pode fazer'],
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
    extraLabel: 'Já fez avaliação',
    ticketMedio: 1200,
    reply: REPLY_AVALIACAO,
    seenBefore: ['como funciona', 'tempo de tratamento', 'o que está incluso', 'casos reais', 'cuidados depois'],
    people: [
      P('Paulo Henrique', 'quanto é o clareamento?', false, true, 'Clareamento', 'antes do casamento', 'não'),
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
    ticketMedio: 280,
    reply: REPLY_AVALIACAO,
    seenBefore: ['especialidades', 'como é a consulta', 'convênios aceitos', 'horários', 'preparo para exames'],
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
    ticketMedio: 390,
    reply: priceReply(390),
    seenBefore: ['metodologia', 'duração do curso', 'certificado', 'turmas e horários', 'aula experimental'],
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
    ticketMedio: 2500,
    reply: priceReply(2500),
    seenBefore: ['como funciona', 'prazo de entrega', 'o que está incluso', 'trabalhos feitos', 'garantia'],
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
    ticketMedio: 189,
    reply: priceReply(189),
    seenBefore: ['catálogo', 'prazo de entrega', 'trocas e devolução', 'tamanhos', 'retirada na loja'],
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
    ticketMedio: 320,
    reply: priceReply(320),
    seenBefore: ['cardápio', 'prazo de encomenda', 'como é a entrega', 'quantidades', 'opções sem glúten'],
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
    ticketMedio: 450,
    reply: priceReply(450),
    seenBefore: ['como funciona', 'o que está incluso', 'prazos', 'quem já é cliente', 'horários'],
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

/* ------------------------------------------------------------------ */
/* Ambiente (Vercel → Project Settings → Environment Variables)        */
/* ------------------------------------------------------------------ */

/** WhatsApp do Guilherme (55 + DDD + número). A variável VITE_WHATSAPP_NUMBER, se existir, tem prioridade. */
export const WHATSAPP_NUMBER_DEFAULT = '5541984804266'

/** STD publicado da Thais (cena da prova). VITE_THAIS_STD_URL, se existir, tem prioridade. */
export const THAIS_STD_URL_DEFAULT = 'https://thais-lac.vercel.app'

/**
 * Destaque do resultado na caixa real: abaixo deste ganho mensal (R$), o ANUAL vai em
 * destaque (o mensal pequeno parece pouco); a partir dele, o MENSAL vai em destaque.
 */
export const HIGHLIGHT_ANNUAL_BELOW = 5000

const env = import.meta.env
export const ENV = {
  supabaseUrl: env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
  // Sem número, o wa.me abre "Compartilhe no WhatsApp" em vez da conversa: por isso há um padrão.
  whatsappNumber: env.VITE_WHATSAPP_NUMBER || WHATSAPP_NUMBER_DEFAULT,
  metaPixelId: env.VITE_META_PIXEL_ID ?? '',
  thaisStdUrl: env.VITE_THAIS_STD_URL || THAIS_STD_URL_DEFAULT,
}

/** Instagram do rodapé da saída de não qualificado. */
export const INSTAGRAM = { handle: '@guilhermedominguees', url: 'https://www.instagram.com/guilhermedominguees/' } as const

/**
 * Flag da saída de não qualificado: campo de WhatsApp para "receber o checklist"
 * (remarketing). Desligado até haver base legal/consentimento definidos.
 */
export const NOT_QUALIFIED_CAPTURE = false

/* ------------------------------------------------------------------ */
/* refCode e mensagem do WhatsApp                                      */
/* ------------------------------------------------------------------ */

/** "FV-" + 4 caracteres. Sem 0/O, 1/I/L: fácil de ler no WhatsApp (alfabeto do STD Berti). */
export const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const REF_PREFIX = 'FV-'

export interface WhatsAppData {
  segmento: string
  leads: number
  conv10: number
  ticketLabel: string
  /** receita a mais por mês (projeção conservadora); null = variante honesta */
  receitaExtraMes: number | null
  refCode: string
}

/**
 * Mensagem que chega no WhatsApp do Guilherme (o lead vê a prévia antes de enviar).
 * Adaptada do brief: a pergunta de rota saiu do fluxo da caixa de entrada, e o valor
 * mostrado é o mesmo que a pessoa viu no app (receita a mais, projeção conservadora).
 */
export function whatsappMessage(d: WhatsAppData, money: (n: number) => string): string {
  const ganho = d.receitaExtraMes == null
    ? 'Meu funil já converte acima da média: quero escalar sem perder qualidade.'
    : `Projeção: + R$ ${money(d.receitaExtraMes)}/mês`
  return [
    'Olá, Guilherme! Fiz o Funil Vivo.',
    '',
    `Negócio: ${d.segmento}`,
    `Leads/mês: ${d.leads >= LEADS_MAX ? '1.000+' : d.leads}`,
    `Conversão hoje: ${d.conv10}/10 · Ticket: ${d.ticketLabel}`,
    ganho,
    '',
    `Quero ver como seria um STD pro meu negócio. [${d.refCode}]`,
  ].join('\n')
}

/** Número só com dígitos e DDI 55 (aceita com ou sem o 55 na variável de ambiente). */
export function whatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`
}

/* ------------------------------------------------------------------ */
/* Qualificação (cena 9)                                               */
/* ------------------------------------------------------------------ */

export const INVESTE_OPTIONS: InvesteId[] = ['sim', 'as_vezes', 'ainda_nao']
export const FATURAMENTO_OPTIONS: FaturamentoId[] = ['ate_10k', '10_30k', '30_100k', '100k_mais']

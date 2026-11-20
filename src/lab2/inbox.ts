/**
 * CONTEÚDO DO PROTÓTIPO "CAIXA DE ENTRADA VIVA" (/lab2).
 *
 * Pessoas e mensagens são ILUSTRATIVAS (dramatização para a demo, não dados reais).
 * O STD não barra ninguém: as 8 pessoas chegam de novo, todas identificadas.
 * O placar "PRONTAS PRA COMPRAR: antes → depois" é CONTADO desta lista, nunca digitado:
 *   antes  = quem já estava pronta (readyBefore)
 *   depois = quem chega pronta com a triagem (readyAfter)
 */

export interface Person {
  id: string
  name: string
  /** tom do avatar (o verde signal fica reservado ao STD) */
  tone: string
  time: string
  /** mensagem que chega HOJE, sem STD */
  before: string
  /** já estava pronta pra comprar, mesmo sem STD (conta no "antes") */
  readyBefore: boolean
  /** resumo de triagem que chega COM o STD */
  after: string
  /** chega pronta pra agendar (senão: "ainda pesquisando", identificada antes da 1ª resposta) */
  readyAfter: boolean
}

export const PEOPLE: Person[] = [
  { id: 'mariana', name: 'Mariana Costa', tone: '#3A3F4A', time: '09:12', before: 'oi, quanto custa?', readyBefore: false, after: 'Fiz a triagem: Sculpt Ice · abdômen · quero este mês', readyAfter: true },
  { id: 'juliana', name: 'Juliana Reis', tone: '#4A3F3F', time: '09:15', before: 'valor?', readyBefore: false, after: 'Fiz a triagem: Botox · testa · tenho evento dia 12', readyAfter: true },
  { id: 'carla', name: 'Carla Mendes', tone: '#3F4A44', time: '09:21', before: 'tem horário amanhã?', readyBefore: true, after: 'Fiz a triagem: Limpeza de pele · amanhã à tarde', readyAfter: true },
  { id: 'patricia', name: 'Patrícia Lima', tone: '#45404D', time: '09:26', before: '?', readyBefore: false, after: 'Fiz a triagem: Peeling · sem data · só comparando', readyAfter: false },
  { id: 'fernanda', name: 'Fernanda Alves', tone: '#4D4639', time: '09:30', before: 'qual o preço do procedimento?', readyBefore: false, after: 'Fiz a triagem: Bioestimulador · 1ª vez · urgente', readyAfter: true },
  { id: 'renata', name: 'Renata Souza', tone: '#39434D', time: '09:34', before: 'oi', readyBefore: false, after: 'Fiz a triagem: Depilação a laser · talvez ano que vem', readyAfter: false },
  { id: 'beatriz', name: 'Beatriz Rocha', tone: '#4D3A44', time: '09:37', before: 'vi o anúncio, tem horário sábado?', readyBefore: true, after: 'Fiz a triagem: Depilação a laser · pernas · sábado', readyAfter: true },
  { id: 'aline', name: 'Aline Martins', tone: '#3F4740', time: '09:41', before: 'quanto fica?', readyBefore: false, after: 'Fiz a triagem: Harmonização · avaliação esta semana', readyAfter: true },
]

export const READY_BEFORE = PEOPLE.filter((p) => p.readyBefore).length
export const READY_AFTER = PEOPLE.filter((p) => p.readyAfter).length

export const INBOX_COPY = {
  title: 'Mensagens',
  question: 'Isso te parece familiar?',
  cta: 'Ligar o STD',
  readyTag: 'pronta pra agendar',
  researchingTag: 'ainda pesquisando',
  scoreLabel: 'PRONTAS PRA COMPRAR',
  scoreBefore: 'antes',
  scoreAfter: 'com STD',
  closing: 'Mesmo anúncio. Agora chegam pessoas que já sabem o que querem.',
  replay: 'Ver de novo',
} as const

/** Ritmo (ms) */
export const INBOX_TIMING = {
  powerOn: 650,
  arriveEvery: 450,
  questionDelay: 700,
  ctaDelay: 900,
  rewindStagger: 55,
  rearriveEvery: 420,
} as const

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

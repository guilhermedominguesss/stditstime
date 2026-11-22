# Funil Vivo · It's Time

STD próprio da It's Time: a página entre o anúncio e o WhatsApp do Guilherme.
Vite + React + TypeScript + Tailwind + Framer Motion + Supabase.

## Rotas

| Rota | O quê |
|---|---|
| `/` | **O app**: Caixa de Entrada Viva → Prova (Thais) → Qualificação → Saída |
| `/labs` | Índice dos protótipos (`/lab` motor de partículas … `/lab6` caixa de entrada aprovada) |

## Rodar

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # matemática, banco por nicho, tracking, WhatsApp, CAPI
npm run build
```

## Publicar (Vercel)

1. **Supabase** (mesmo projeto do painel): SQL Editor → rodar `supabase/001_funil_vivo.sql`
   (idempotente; cria `funil_sessions`, `funil_events`, RLS, triggers e o RPC `fv_patch_session`).
2. **Variáveis de ambiente** na Vercel (ver `.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_WHATSAPP_NUMBER` (com ou sem 55)
   - `VITE_META_PIXEL_ID`, `VITE_THAIS_STD_URL`
   - Servidor (sem `VITE_`): `META_PIXEL_ID`, `META_CAPI_TOKEN`, opcional `META_TEST_EVENT_CODE`
3. Redeploy. Sem Supabase, os eventos ficam numa fila no aparelho e nada quebra; sem Pixel, nada é enviado.

## Regras de tracking

- `Lead` (Pixel + CAPI, `eventID = refCode`) **somente** no clique de WhatsApp de lead qualificado.
- Não qualificado: só `FV_NaoQualificado`. Outros customizados: `FV_StdOn`, `FV_Diagnostico`, `FV_Caso`.
- `refCode` (`FV-XXXX`) vai na mensagem do WhatsApp e na linha da sessão: é o que liga os dois.
- `last_scene` é atualizado a cada cena (abandono por cena no painel).

## Onde fica cada coisa

| Caminho | O quê |
|---|---|
| `src/funil/config.ts` | Constantes de negócio, banco de mensagens por nicho, mensagem do WhatsApp |
| `src/funil/copy.ts` | Todos os textos |
| `src/funil/math.ts` | Matemática pura (com testes) |
| `src/inbox/` | Caixa de Entrada Viva (`InboxFlow`) e suas peças |
| `src/app/` | O app: cenas 8–10 e a costura com o tracking |
| `src/tracking/` | Sessão/refCode, fila do Supabase, Pixel |
| `api/capi.ts` | API de Conversões (função da Vercel) |
| `supabase/` | Migração SQL |

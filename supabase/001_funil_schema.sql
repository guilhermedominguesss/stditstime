-- =====================================================================
-- Funil Vivo · 001 · schema
-- Rodar no SQL Editor do projeto do painel (o mesmo dos STDs Thais / Yes / Berti).
-- Idempotente. NÃO toca em nenhuma tabela std_* (só cria funil_*).
-- Ordem: 001 → 002 → 003 → 004 → 099 (verificação).
-- =====================================================================

begin;

create extension if not exists "pgcrypto";

create table if not exists public.funil_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  ref_code text unique,
  utm_source text, utm_medium text, utm_campaign text,
  utm_content text, utm_term text, fbclid text,
  device text, in_app_browser text,
  segmento text, leads_mes int, rota text, conv_10 int, ticket numeric,
  investe text, faturamento text,
  valor_em_jogo numeric, receita_extra numeric,
  qualificado boolean,
  outcome text,           -- 'whatsapp' | 'nao_qualificado' | 'abandono'
  last_scene text,
  std_on_at timestamptz,
  completed_at timestamptz,
  ip_hash text            -- md5(ip + sal): nunca o IP em texto
);

create table if not exists public.funil_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.funil_sessions(id) on delete cascade,
  created_at timestamptz default now(),
  name text, scene text, payload jsonb
);

create index if not exists funil_events_session_idx on public.funil_events (session_id, created_at);
create index if not exists funil_events_name_idx on public.funil_events (name, created_at);
create index if not exists funil_sessions_created_idx on public.funil_sessions (created_at);
create index if not exists funil_sessions_last_scene_idx on public.funil_sessions (last_scene);

-- limites de tamanho e valores
alter table public.funil_sessions drop constraint if exists funil_sessions_limits;
alter table public.funil_sessions add constraint funil_sessions_limits check (
  (ref_code is null or ref_code ~ '^FV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$') and
  char_length(coalesce(utm_source, '')) <= 200 and char_length(coalesce(utm_medium, '')) <= 200 and
  char_length(coalesce(utm_campaign, '')) <= 200 and char_length(coalesce(utm_content, '')) <= 200 and
  char_length(coalesce(utm_term, '')) <= 200 and char_length(coalesce(fbclid, '')) <= 500 and
  char_length(coalesce(device, '')) <= 20 and char_length(coalesce(in_app_browser, '')) <= 20 and
  char_length(coalesce(last_scene, '')) <= 40 and
  (outcome is null or outcome in ('whatsapp', 'nao_qualificado', 'abandono'))
);

alter table public.funil_events drop constraint if exists funil_events_limits;
alter table public.funil_events add constraint funil_events_limits check (
  octet_length(coalesce(payload::text, '')) <= 4000 and
  char_length(coalesce(scene, '')) <= 40 and
  name in (
    'fv_view', 'fv_start', 'fv_scene_enter', 'fv_input', 'fv_diagnosis_view', 'fv_std_on',
    'fv_case_view', 'fv_case_open_std', 'fv_qualified', 'fv_disqualified', 'fv_whatsapp_click',
    'fv_checklist_check', 'fv_back'
  )
);

-- RLS ligado e TODO acesso direto fechado. Escrita só pelas RPCs (003);
-- leitura só para admin (004). O Supabase dá grants amplos por padrão em tabelas
-- novas do schema public: por isso o revoke explícito.
alter table public.funil_sessions enable row level security;
alter table public.funil_events enable row level security;
revoke all on public.funil_sessions from public, anon, authenticated;
revoke all on public.funil_events from public, anon, authenticated;

-- se uma versão anterior (001_funil_vivo.sql) tiver criado policies de insert, saem
drop policy if exists "fv anon insert sessions" on public.funil_sessions;
drop policy if exists "fv anon insert events" on public.funil_events;

commit;

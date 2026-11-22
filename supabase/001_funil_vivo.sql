-- =====================================================================
-- Funil Vivo (It's Time) · funil_sessions / funil_events
-- Rodar no SQL Editor do MESMO projeto Supabase do painel multi-cliente.
-- Idempotente: pode rodar mais de uma vez. Não mexe nas tabelas std_* de ninguém.
--
-- Segurança (mesmo modelo dos STDs Thais / Berti):
--   * a chave anon (pública, vai no front) só pode INSERIR sessão e eventos;
--   * UPDATE da sessão só pela função fv_patch_session (security definer), só na
--     própria sessão (por id), só nas últimas 24h, só nas colunas da lista branca;
--   * nunca SELECT/UPDATE/DELETE direto para anon;
--   * triggers forçam created_at do servidor, limitam volume por IP (hash) e por sessão,
--     e aceitam só os nomes de evento conhecidos.
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
  ip_hash text
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
  char_length(coalesce(ref_code, '')) <= 12 and
  char_length(coalesce(utm_source, '')) <= 200 and char_length(coalesce(utm_medium, '')) <= 200 and
  char_length(coalesce(utm_campaign, '')) <= 200 and char_length(coalesce(utm_content, '')) <= 200 and
  char_length(coalesce(utm_term, '')) <= 200 and char_length(coalesce(fbclid, '')) <= 500 and
  char_length(coalesce(device, '')) <= 20 and char_length(coalesce(in_app_browser, '')) <= 20 and
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

-- RLS + grants: anon só insere
alter table public.funil_sessions enable row level security;
alter table public.funil_events enable row level security;

drop policy if exists "fv anon insert sessions" on public.funil_sessions;
create policy "fv anon insert sessions" on public.funil_sessions for insert to anon with check (true);
drop policy if exists "fv anon insert events" on public.funil_events;
create policy "fv anon insert events" on public.funil_events for insert to anon with check (true);

revoke select, update, delete on public.funil_sessions from anon, authenticated;
revoke select, update, delete on public.funil_events from anon, authenticated;
grant insert on public.funil_sessions to anon;
grant insert on public.funil_events to anon;

-- sessão: valores de servidor + limite por IP (hash, nunca o IP em texto)
create or replace function public.fv_before_session_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hdr json;
  ip text;
  recent int;
begin
  new.created_at := now();
  -- o cliente não escolhe resultado: tudo nasce limpo
  new.qualificado := null;
  new.outcome := null;
  new.std_on_at := null;
  new.completed_at := null;
  begin
    hdr := current_setting('request.headers', true)::json;
  exception when others then
    hdr := null;
  end;
  ip := split_part(coalesce(hdr ->> 'x-forwarded-for', hdr ->> 'cf-connecting-ip', ''), ',', 1);
  if ip <> '' then
    new.ip_hash := md5(ip || ':fv-salt-v1');
    select count(*) into recent from public.funil_sessions
      where ip_hash = new.ip_hash and created_at > now() - interval '1 hour';
    if recent >= 30 then
      raise exception 'rate limit: too many sessions' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fv_before_session_insert on public.funil_sessions;
create trigger fv_before_session_insert before insert on public.funil_sessions
  for each row execute function public.fv_before_session_insert();

-- eventos: sessão recente, teto por sessão e por minuto
create or replace function public.fv_before_event_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sess_created timestamptz;
  total int;
  last_min int;
begin
  new.created_at := now();
  select created_at into sess_created from public.funil_sessions where id = new.session_id;
  if sess_created is null or sess_created < now() - interval '24 hours' then
    raise exception 'invalid or expired session' using errcode = 'P0001';
  end if;
  select count(*) into total from public.funil_events where session_id = new.session_id;
  if total >= 400 then
    raise exception 'rate limit: too many events for session' using errcode = 'P0001';
  end if;
  select count(*) into last_min from public.funil_events
    where session_id = new.session_id and created_at > now() - interval '1 minute';
  if last_min >= 90 then
    raise exception 'rate limit: too many events per minute' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists fv_before_event_insert on public.funil_events;
create trigger fv_before_event_insert before insert on public.funil_events
  for each row execute function public.fv_before_event_insert();

-- UPDATE da sessão: só a lista branca de colunas, só a própria sessão, só 24h
create or replace function public.fv_patch_session(p_id uuid, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  update public.funil_sessions set
    segmento      = coalesce(left(f ->> 'segmento', 30), segmento),
    leads_mes     = coalesce(least(greatest((f ->> 'leads_mes')::int, 0), 100000), leads_mes),
    conv_10       = coalesce(least(greatest((f ->> 'conv_10')::int, 0), 10), conv_10),
    ticket        = coalesce(least(greatest((f ->> 'ticket')::numeric, 0), 10000000), ticket),
    investe       = case when f ->> 'investe' in ('sim', 'as_vezes', 'ainda_nao') then f ->> 'investe' else investe end,
    faturamento   = case when f ->> 'faturamento' in ('ate_10k', '10_30k', '30_100k', '100k_mais') then f ->> 'faturamento' else faturamento end,
    valor_em_jogo = coalesce(least(greatest((f ->> 'valor_em_jogo')::numeric, 0), 100000000), valor_em_jogo),
    receita_extra = coalesce(least(greatest((f ->> 'receita_extra')::numeric, 0), 100000000), receita_extra),
    qualificado   = coalesce((f ->> 'qualificado')::boolean, qualificado),
    -- "whatsapp" é final: um evento atrasado não rebaixa o resultado
    outcome       = case
                      when outcome = 'whatsapp' then outcome
                      when f ->> 'outcome' in ('whatsapp', 'nao_qualificado', 'abandono') then f ->> 'outcome'
                      else outcome end,
    last_scene    = coalesce(left(f ->> 'last_scene', 40), last_scene),
    std_on_at     = coalesce(std_on_at, case when f ? 'std_on_at' then now() end),
    completed_at  = coalesce(completed_at, case when f ? 'completed_at' then now() end)
  where id = p_id
    and created_at > now() - interval '24 hours';
exception when invalid_text_representation or numeric_value_out_of_range then
  -- valor malformado vindo da chave pública: ignora o patch inteiro
  return;
end $$;

revoke all on function public.fv_patch_session(uuid, jsonb) from public;
grant execute on function public.fv_patch_session(uuid, jsonb) to anon;

commit;

-- Conferência (deve listar 1 linha):
select p.oid::regprocedure as fv_patch_session from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fv_patch_session';

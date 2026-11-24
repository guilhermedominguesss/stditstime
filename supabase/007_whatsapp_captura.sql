-- =====================================================================
-- Funil Vivo · 007 · captura do WhatsApp do qualificado + aviso na hora
--                   + marca das respostas "10/10 sem toque" (rodar ANTES de publicar)
--
--   * funil_sessions ganha: whatsapp (11 dígitos), conv10_suspeito
--   * funil_events aceita: fv_whatsapp_retorno, fv_whatsapp_confirmado, fv_whatsapp_nao_abriu
--   * fv_patch_session grava whatsapp (só formato válido e só de sessão qualificada)
--   * aviso para o Guilherme quando um qualificado salva o número (pg_net → ntfy e/ou
--     CallMeBot/WhatsApp), lendo os dados DO BANCO (nada vem do navegador)
-- Mantém tudo do 001–006 (RLS, só RPC para anon, leitura só admin). Idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. colunas novas
-- ---------------------------------------------------------------------
alter table public.funil_sessions add column if not exists whatsapp text;
alter table public.funil_sessions drop constraint if exists funil_sessions_whatsapp_fmt;
alter table public.funil_sessions add constraint funil_sessions_whatsapp_fmt
  check (whatsapp is null or whatsapp ~ '^[1-9]{2}9[0-9]{8}$');

-- respostas antigas da pergunta "de cada 10": quem avançou sem tocar em nada virou 10/10
alter table public.funil_sessions add column if not exists conv10_suspeito boolean not null default false;
update public.funil_sessions s
   set conv10_suspeito = true
 where s.conv_10 = 10
   and not exists (
     select 1 from public.funil_events e
      where e.session_id = s.id and e.name = 'fv_input'
        and e.payload ->> 'campo' = 'conv_10'
        and (e.payload ->> 'nenhuma' = 'true' or (e.payload ->> 'tocou')::int > 0)
   );

-- ---------------------------------------------------------------------
-- 2. eventos novos
-- ---------------------------------------------------------------------
alter table public.funil_events drop constraint if exists funil_events_limits;
alter table public.funil_events add constraint funil_events_limits check (
  octet_length(coalesce(payload::text, '')) <= 4000 and
  char_length(coalesce(scene, '')) <= 40 and
  name in (
    'fv_view', 'fv_start', 'fv_scene_enter', 'fv_input', 'fv_diagnosis_view', 'fv_std_on',
    'fv_case_view', 'fv_case_open_std', 'fv_qualified', 'fv_disqualified', 'fv_whatsapp_click',
    'fv_checklist_check', 'fv_back',
    'fv_error', 'fv_first_paint', 'fv_first_interaction', 'fv_intro_view', 'fv_intro_cta',
    'fv_whatsapp_retorno', 'fv_whatsapp_confirmado', 'fv_whatsapp_nao_abriu'
  )
);

-- ---------------------------------------------------------------------
-- 3. fv_patch_session com whatsapp (mesma assinatura; resto igual ao 006)
-- ---------------------------------------------------------------------
drop function if exists public.fv_patch_session(uuid, jsonb);
create function public.fv_patch_session(p_id uuid, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  update public.funil_sessions set
    segmento      = case when f ->> 'segmento' in ('clinica', 'estetica', 'odonto', 'educacao', 'servicos', 'varejo', 'alimentacao', 'outro') then f ->> 'segmento' else segmento end,
    leads_mes     = case when f ? 'leads_mes' then least(greatest((f ->> 'leads_mes')::int, 0), 100000) else leads_mes end,
    conv_10       = case when f ? 'conv_10' then least(greatest((f ->> 'conv_10')::int, 0), 10) else conv_10 end,
    ticket        = case when f ? 'ticket' then least(greatest((f ->> 'ticket')::numeric, 0), 10000000) else ticket end,
    investe       = case when f ->> 'investe' in ('sim', 'as_vezes', 'ainda_nao') then f ->> 'investe' else investe end,
    faturamento   = case when f ->> 'faturamento' in ('ate_10k', '10_30k', '30_100k', '100k_mais') then f ->> 'faturamento' else faturamento end,
    valor_em_jogo = case when f ? 'valor_em_jogo' then least(greatest((f ->> 'valor_em_jogo')::numeric, 0), 100000000) else valor_em_jogo end,
    receita_extra = case when f ? 'receita_extra' then least(greatest((f ->> 'receita_extra')::numeric, 0), 100000000) else receita_extra end,
    qualificado   = coalesce((f ->> 'qualificado')::boolean, qualificado),
    -- só de quem é qualificado (neste patch ou antes) e só no formato DDD + 9 + 8 dígitos
    whatsapp      = case
                      when f ->> 'whatsapp' ~ '^[1-9]{2}9[0-9]{8}$'
                       and coalesce((f ->> 'qualificado')::boolean, qualificado, false)
                      then f ->> 'whatsapp' else whatsapp end,
    outcome       = case
                      when outcome = 'whatsapp' then outcome
                      when f ->> 'outcome' in ('whatsapp', 'nao_qualificado', 'abandono') then f ->> 'outcome'
                      else outcome end,
    last_scene    = coalesce(left(f ->> 'last_scene', 40), last_scene),
    std_on_at     = coalesce(std_on_at, case when f ? 'std_on_at' then now() end),
    completed_at  = coalesce(completed_at, case when f ? 'completed_at' then now() end),
    intro_cta_at  = coalesce(intro_cta_at, case when f ? 'intro_cta_at' then now() end)
  where id = p_id
    and created_at > now() - interval '24 hours';
exception when invalid_text_representation or numeric_value_out_of_range then
  return;
end $$;

revoke all on function public.fv_patch_session(uuid, jsonb) from public, authenticated;
grant execute on function public.fv_patch_session(uuid, jsonb) to anon;

-- ---------------------------------------------------------------------
-- 4. aviso na hora (pg_net). Configuração numa tabela que NINGUÉM lê pela API.
-- ---------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create table if not exists public.fv_notify_config (
  id int primary key default 1 check (id = 1),
  ntfy_topic text,          -- ex.: fv-guilherme-8k2p9x (app ntfy no celular, assina o mesmo tópico)
  callmebot_phone text,     -- ex.: 5541984804266 (WhatsApp que recebe o aviso)
  callmebot_apikey text,    -- chave que o CallMeBot manda no WhatsApp
  updated_at timestamptz default now()
);
alter table public.fv_notify_config enable row level security;
revoke all on table public.fv_notify_config from public, anon, authenticated;
insert into public.fv_notify_config (id) values (1) on conflict (id) do nothing;

create or replace function public.fv_notify_whatsapp_lead()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.fv_notify_config;
  nicho text;
  fone text;
  receita text;
  msg text;
begin
  select * into c from public.fv_notify_config where id = 1;
  if not found then return new; end if;

  nicho := case new.segmento
    when 'clinica' then 'Clínica / saúde' when 'estetica' then 'Estética / beleza'
    when 'odonto' then 'Odontologia' when 'educacao' then 'Educação / cursos'
    when 'servicos' then 'Serviços' when 'varejo' then 'Comércio / varejo'
    when 'alimentacao' then 'Alimentação' else coalesce(new.segmento, '—') end;
  fone := '(' || substr(new.whatsapp, 1, 2) || ') ' || substr(new.whatsapp, 3, 5) || '-' || substr(new.whatsapp, 8);
  receita := case
    when coalesce(new.receita_extra, 0) > 0
      then '+ R$ ' || replace(to_char(new.receita_extra, 'FM999G999G999'), ',', '.') || '/mês'
    else 'já converte acima da média' end;
  msg := case when new.is_test then '[TESTE] ' else '' end
      || 'Lead qualificado ' || coalesce(new.ref_code, '?') || E'\n'
      || 'Nicho: ' || nicho || E'\n'
      || 'WhatsApp: ' || fone || E'\n'
      || 'Receita a mais: ' || receita || E'\n'
      || 'Responder: https://wa.me/55' || new.whatsapp;

  if coalesce(c.ntfy_topic, '') <> '' then
    perform net.http_post(
      url := 'https://ntfy.sh/',
      body := jsonb_build_object(
        'topic', c.ntfy_topic,
        'title', 'Funil Vivo: lead qualificado ' || coalesce(new.ref_code, ''),
        'message', msg,
        'priority', 5,
        'click', 'https://wa.me/55' || new.whatsapp
      )
    );
  end if;

  if coalesce(c.callmebot_apikey, '') <> '' and coalesce(c.callmebot_phone, '') <> '' then
    perform net.http_get(
      url := 'https://api.callmebot.com/whatsapp.php',
      params := jsonb_build_object('phone', c.callmebot_phone, 'text', msg, 'apikey', c.callmebot_apikey)
    );
  end if;

  return new;
exception when others then
  -- o aviso nunca pode impedir a gravação do lead
  return new;
end $$;

revoke all on function public.fv_notify_whatsapp_lead() from public, anon, authenticated;

drop trigger if exists fv_notify_whatsapp_lead on public.funil_sessions;
create trigger fv_notify_whatsapp_lead
  after update of whatsapp on public.funil_sessions
  for each row
  when (new.whatsapp is not null and old.whatsapp is distinct from new.whatsapp)
  execute function public.fv_notify_whatsapp_lead();

commit;

-- ---------------------------------------------------------------------
-- DEPOIS DE RODAR: escolha o canal do aviso (um ou os dois) e rode SÓ a linha dele.
--
-- (A) ntfy (push no celular, sem cadastro, chega em segundos):
--     1. instale o app "ntfy" (Android/iOS) e assine um tópico difícil de adivinhar
--     2. update public.fv_notify_config set ntfy_topic = 'fv-guilherme-TROQUE-ISTO', updated_at = now();
--
-- (B) WhatsApp via CallMeBot (siga as instruções de https://www.callmebot.com/blog/free-api-whatsapp-messages/
--     para receber a sua apikey no seu WhatsApp):
--     update public.fv_notify_config set callmebot_phone = '5541984804266', callmebot_apikey = 'SUA_APIKEY', updated_at = now();
--
-- Teste do aviso (sessão de teste, não suja os dados):
--     ver supabase/103_diagnostico.sql, bloco 5
-- ---------------------------------------------------------------------

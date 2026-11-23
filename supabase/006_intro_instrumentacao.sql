-- =====================================================================
-- Funil Vivo · 006 · cena de intro + instrumentação (rodar ANTES de publicar a intro)
--
--   * funil_sessions ganha: is_test, user_agent, has_intro, intro_cta_at, preloaded
--   * funil_events aceita: fv_error, fv_first_paint, fv_first_interaction,
--     fv_intro_view, fv_intro_cta
--   * fv_create_session grava os campos novos; fv_patch_session grava intro_cta_at
-- Mantém tudo do 001–005 (RLS, só RPC para anon, leitura só admin). Idempotente.
-- =====================================================================

begin;

alter table public.funil_sessions add column if not exists is_test boolean not null default false;
alter table public.funil_sessions add column if not exists user_agent text;
alter table public.funil_sessions add column if not exists has_intro boolean;
alter table public.funil_sessions add column if not exists intro_cta_at timestamptz;
-- a página foi carregada escondida (pré-carregamento do navegador do Instagram/Facebook)
-- antes de a pessoa ver; a sessão só é criada quando ela fica visível
alter table public.funil_sessions add column if not exists preloaded boolean;

create index if not exists funil_sessions_is_test_idx on public.funil_sessions (is_test, created_at);

alter table public.funil_sessions drop constraint if exists funil_sessions_ua_len;
alter table public.funil_sessions add constraint funil_sessions_ua_len check (char_length(coalesce(user_agent, '')) <= 400);

alter table public.funil_events drop constraint if exists funil_events_limits;
alter table public.funil_events add constraint funil_events_limits check (
  octet_length(coalesce(payload::text, '')) <= 4000 and
  char_length(coalesce(scene, '')) <= 40 and
  name in (
    'fv_view', 'fv_start', 'fv_scene_enter', 'fv_input', 'fv_diagnosis_view', 'fv_std_on',
    'fv_case_view', 'fv_case_open_std', 'fv_qualified', 'fv_disqualified', 'fv_whatsapp_click',
    'fv_checklist_check', 'fv_back',
    'fv_error', 'fv_first_paint', 'fv_first_interaction', 'fv_intro_view', 'fv_intro_cta'
  )
);

-- recria as duas RPCs de sessão (mesmas assinaturas)
drop function if exists public.fv_create_session(uuid, text, jsonb);
create function public.fv_create_session(p_id uuid, p_ref_code text, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  insert into public.funil_sessions (
    id, ref_code, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
    device, in_app_browser, last_scene, is_test, user_agent, has_intro, preloaded
  ) values (
    p_id,
    p_ref_code,
    left(f ->> 'utm_source', 200), left(f ->> 'utm_medium', 200), left(f ->> 'utm_campaign', 200),
    left(f ->> 'utm_content', 200), left(f ->> 'utm_term', 200), left(f ->> 'fbclid', 500),
    case when f ->> 'device' in ('mobile', 'tablet', 'desktop') then f ->> 'device' end,
    case when f ->> 'in_app_browser' in ('instagram', 'facebook', 'outro') then f ->> 'in_app_browser' end,
    left(f ->> 'last_scene', 40),
    coalesce((f ->> 'is_test')::boolean, false),
    left(f ->> 'user_agent', 400),
    (f ->> 'has_intro')::boolean,
    (f ->> 'preloaded')::boolean
  )
  on conflict (id) do nothing;
exception when invalid_text_representation then
  return;
end $$;

drop function if exists public.fv_patch_session(uuid, jsonb);
create function public.fv_patch_session(p_id uuid, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  update public.funil_sessions set
    segmento      = case when f ->> 'segmento' in ('clinica', 'estetica', 'odonto', 'educacao', 'servicos', 'varejo', 'alimentacao', 'outro') then f ->> 'segmento' else segmento end,
    -- só mexe no campo se ele veio no patch (greatest() ignora NULL e devolveria 0)
    leads_mes     = case when f ? 'leads_mes' then least(greatest((f ->> 'leads_mes')::int, 0), 100000) else leads_mes end,
    conv_10       = case when f ? 'conv_10' then least(greatest((f ->> 'conv_10')::int, 0), 10) else conv_10 end,
    ticket        = case when f ? 'ticket' then least(greatest((f ->> 'ticket')::numeric, 0), 10000000) else ticket end,
    investe       = case when f ->> 'investe' in ('sim', 'as_vezes', 'ainda_nao') then f ->> 'investe' else investe end,
    faturamento   = case when f ->> 'faturamento' in ('ate_10k', '10_30k', '30_100k', '100k_mais') then f ->> 'faturamento' else faturamento end,
    valor_em_jogo = case when f ? 'valor_em_jogo' then least(greatest((f ->> 'valor_em_jogo')::numeric, 0), 100000000) else valor_em_jogo end,
    receita_extra = case when f ? 'receita_extra' then least(greatest((f ->> 'receita_extra')::numeric, 0), 100000000) else receita_extra end,
    qualificado   = coalesce((f ->> 'qualificado')::boolean, qualificado),
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

revoke all on function public.fv_create_session(uuid, text, jsonb) from public, authenticated;
revoke all on function public.fv_patch_session(uuid, jsonb) from public, authenticated;
grant execute on function public.fv_create_session(uuid, text, jsonb) to anon;
grant execute on function public.fv_patch_session(uuid, jsonb) to anon;

commit;

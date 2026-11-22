-- =====================================================================
-- Funil Vivo · 003 · RPCs (a ÚNICA porta de escrita da chave anon)
--   fv_create_session(p_id, p_ref_code, p_fields)   cria a sessão (idempotente)
--   fv_log_event(p_session_id, p_name, p_scene, p_payload)
--   fv_patch_session(p_id, p_fields)                 atualiza a própria sessão
-- Todas security definer, só para a role anon, nenhuma devolve dados.
-- Sessão com mais de 24h fica travada (não aceita patch nem evento).
-- Idempotente.
-- =====================================================================

begin;

-- remove versões anteriores com outra assinatura (evita o Postgres escolher a errada)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('fv_create_session', 'fv_log_event', 'fv_patch_session')
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

create function public.fv_create_session(p_id uuid, p_ref_code text, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  insert into public.funil_sessions (
    id, ref_code, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
    device, in_app_browser, last_scene
  ) values (
    p_id,
    p_ref_code,
    left(f ->> 'utm_source', 200), left(f ->> 'utm_medium', 200), left(f ->> 'utm_campaign', 200),
    left(f ->> 'utm_content', 200), left(f ->> 'utm_term', 200), left(f ->> 'fbclid', 500),
    case when f ->> 'device' in ('mobile', 'tablet', 'desktop') then f ->> 'device' end,
    case when f ->> 'in_app_browser' in ('instagram', 'facebook', 'outro') then f ->> 'in_app_browser' end,
    left(f ->> 'last_scene', 40)
  )
  on conflict (id) do nothing; -- reenvio da fila do aparelho: não duplica
end $$;

create function public.fv_log_event(p_session_id uuid, p_name text, p_scene text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- nome, tamanho e janela de 24h são validados pela constraint e pelo trigger (001/002)
  insert into public.funil_events (session_id, name, scene, payload)
  values (p_session_id, p_name, left(p_scene, 40), coalesce(p_payload, '{}'::jsonb));
end $$;

create function public.fv_patch_session(p_id uuid, p_fields jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  update public.funil_sessions set
    segmento      = case when f ->> 'segmento' in ('clinica', 'estetica', 'odonto', 'educacao', 'servicos', 'varejo', 'alimentacao', 'outro') then f ->> 'segmento' else segmento end,
    leads_mes     = coalesce(least(greatest((f ->> 'leads_mes')::int, 0), 100000), leads_mes),
    conv_10       = coalesce(least(greatest((f ->> 'conv_10')::int, 0), 10), conv_10),
    ticket        = coalesce(least(greatest((f ->> 'ticket')::numeric, 0), 10000000), ticket),
    investe       = case when f ->> 'investe' in ('sim', 'as_vezes', 'ainda_nao') then f ->> 'investe' else investe end,
    faturamento   = case when f ->> 'faturamento' in ('ate_10k', '10_30k', '30_100k', '100k_mais') then f ->> 'faturamento' else faturamento end,
    valor_em_jogo = coalesce(least(greatest((f ->> 'valor_em_jogo')::numeric, 0), 100000000), valor_em_jogo),
    receita_extra = coalesce(least(greatest((f ->> 'receita_extra')::numeric, 0), 100000000), receita_extra),
    qualificado   = coalesce((f ->> 'qualificado')::boolean, qualificado),
    -- "whatsapp" é final: um patch atrasado não rebaixa o resultado
    outcome       = case
                      when outcome = 'whatsapp' then outcome
                      when f ->> 'outcome' in ('whatsapp', 'nao_qualificado', 'abandono') then f ->> 'outcome'
                      else outcome end,
    last_scene    = coalesce(left(f ->> 'last_scene', 40), last_scene),
    std_on_at     = coalesce(std_on_at, case when f ? 'std_on_at' then now() end),
    completed_at  = coalesce(completed_at, case when f ? 'completed_at' then now() end)
  where id = p_id
    and created_at > now() - interval '24 hours'; -- trava: sessão antiga não é mais editável
exception when invalid_text_representation or numeric_value_out_of_range then
  return; -- valor malformado vindo da chave pública: ignora o patch inteiro
end $$;

revoke all on function public.fv_create_session(uuid, text, jsonb) from public, authenticated;
revoke all on function public.fv_log_event(uuid, text, text, jsonb) from public, authenticated;
revoke all on function public.fv_patch_session(uuid, jsonb) from public, authenticated;
grant execute on function public.fv_create_session(uuid, text, jsonb) to anon;
grant execute on function public.fv_log_event(uuid, text, text, jsonb) to anon;
grant execute on function public.fv_patch_session(uuid, jsonb) to anon;

commit;

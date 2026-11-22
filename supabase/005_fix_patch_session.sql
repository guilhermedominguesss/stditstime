-- =====================================================================
-- Funil Vivo · 005 · correção do fv_patch_session (rodar UMA vez, depois de 001–004)
--
-- Defeito: um patch que não trazia leads_mes/conv_10/ticket/valor_em_jogo/receita_extra
-- ZERAVA esses campos (greatest(NULL, 0) devolve 0 no Postgres). Agora cada campo só
-- muda se vier no patch. Também apaga as sessões de teste gravadas com o defeito.
-- Idempotente.
-- =====================================================================

begin;

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

revoke all on function public.fv_patch_session(uuid, jsonb) from public, authenticated;
grant execute on function public.fv_patch_session(uuid, jsonb) to anon;

-- sessões de teste gravadas com o defeito (os testes serão refeitos)
delete from public.funil_sessions where utm_campaign like 'teste_e2e%';

commit;

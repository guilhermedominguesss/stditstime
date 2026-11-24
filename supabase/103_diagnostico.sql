-- =====================================================================
-- Funil Vivo · 103 · diagnósticos da primeira semana (só leitura, exceto o bloco 4 e 5)
-- Rode bloco a bloco no SQL Editor e me cole os resultados.
-- =====================================================================

-- 1. FV-FKGF: a sessão inteira ----------------------------------------
select ref_code, created_at at time zone 'America/Sao_Paulo' as criada_brt, segmento, leads_mes, conv_10, ticket,
       investe, faturamento, qualificado, outcome, receita_extra, last_scene,
       in_app_browser, device, user_agent, utm_source, utm_campaign, utm_content, is_test, preloaded
  from public.funil_sessions
 where ref_code = 'FV-FKGF';

-- 2. FV-FKGF: todos os eventos em ordem, com horário -------------------
select e.created_at at time zone 'America/Sao_Paulo' as horario_brt,
       round(extract(epoch from e.created_at - min(e.created_at) over ()))::int as seg_desde_inicio,
       e.name, e.scene, e.payload
  from public.funil_events e
  join public.funil_sessions s on s.id = e.session_id
 where s.ref_code = 'FV-FKGF'
 order by e.created_at;

-- 3. As sessões "(sem anúncio · direto)": de onde vêm ------------------
-- 3a. resumo por aparelho/navegador
select coalesce(user_agent, '(sem user agent: sessão anterior ao 006)') as user_agent,
       in_app_browser, device, count(*) as sessoes,
       min(created_at at time zone 'America/Sao_Paulo') as primeira_brt,
       max(created_at at time zone 'America/Sao_Paulo') as ultima_brt,
       count(*) filter (where is_test) as ja_marcadas_teste
  from public.funil_sessions
 where utm_source is null and utm_content is null and utm_campaign is null
 group by 1, 2, 3
 order by sessoes desc;

-- 3b. por hora do dia (as suas visitas costumam se concentrar em horário de trabalho)
select extract(hour from created_at at time zone 'America/Sao_Paulo')::int as hora_brt, count(*) as sessoes
  from public.funil_sessions
 where utm_source is null and utm_content is null and utm_campaign is null
 group by 1 order by 1;

-- 3c. as 60 mais recentes, linha a linha
select ref_code, created_at at time zone 'America/Sao_Paulo' as criada_brt, in_app_browser, device,
       left(user_agent, 140) as user_agent, last_scene, segmento, is_test
  from public.funil_sessions
 where utm_source is null and utm_content is null and utm_campaign is null
 order by created_at desc
 limit 60;

-- 4. (OPCIONAL) marcar como teste as sessões diretas que forem suas --------
-- Troque o filtro pelo que o 3a mostrar (ex.: o user agent do seu celular/computador).
-- update public.funil_sessions set is_test = true
--  where utm_source is null and utm_content is null and utm_campaign is null
--    and user_agent like '%TRECHO DO SEU USER AGENT%';

-- 5. Teste do aviso de lead (depois do 007 e do canal configurado) ---------
-- Cria uma sessão de TESTE qualificada e grava um número: o aviso chega marcado [TESTE].
-- (rode as duas linhas juntas; o aviso dispara no UPDATE do número)
-- insert into public.funil_sessions (id, ref_code, segmento, qualificado, receita_extra, is_test, last_scene)
--   values (gen_random_uuid(), 'FV-TSTZ', 'odonto', true, 12345, true, 'saida_qualificado');
-- update public.funil_sessions set whatsapp = '41999999999' where ref_code = 'FV-TSTZ';
-- (para repetir o teste, apague antes: delete from public.funil_sessions where ref_code = 'FV-TSTZ';)
--
-- Conferir se o pg_net mandou (status 200 = entregue):
-- select id, status_code, left(content::text, 200) as resposta, created
--   from net._http_response order by created desc limit 5;

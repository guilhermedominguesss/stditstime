-- Funil Vivo · 102 · de onde vieram as sessões que COMEÇARAM (escolheram o nicho)
-- antes da intro? Foram testes? Cole e rode inteiro (devolve UMA tabela).
-- Sinais de teste seu: sem utm (abriu o link direto), device desktop, campanha de teste,
-- ou várias sessões do mesmo ip_hash em poucos minutos.
select
  to_char(s.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
  s.ref_code,
  coalesce(s.utm_source, '(sem utm)') as utm_source,
  s.utm_campaign,
  s.utm_content,
  s.device,
  coalesce(s.in_app_browser, 'navegador comum') as navegador,
  s.segmento,
  s.last_scene,
  s.outcome,
  left(s.ip_hash, 8) as ip,
  -- quantas sessões o mesmo IP abriu no total (muitas = provavelmente você testando)
  (select count(*) from public.funil_sessions x where x.ip_hash = s.ip_hash) as sessoes_do_mesmo_ip,
  (select count(*) from public.funil_events e where e.session_id = s.id) as eventos
from public.funil_sessions s
where s.segmento is not null
  and coalesce(s.utm_campaign, '') not like 'teste_e2e%'
order by s.created_at;

-- Para ver de onde vieram TODAS as sessões (inclusive as que pararam na 1ª tela),
-- selecione e rode só este bloco:
-- select coalesce(utm_source, '(sem utm)') as origem, coalesce(in_app_browser, 'navegador comum') as navegador,
--        device, count(*) as sessoes, count(*) filter (where segmento is not null) as comecaram
-- from public.funil_sessions
-- where coalesce(utm_campaign, '') not like 'teste_e2e%'
-- group by 1, 2, 3 order by sessoes desc;

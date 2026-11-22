-- =====================================================================
-- Funil Vivo · 100 · evidências dos testes de ponta a ponta
-- Rodar no SQL Editor depois dos testes automáticos (utm_campaign começa com "teste_e2e").
-- =====================================================================

-- 1) Sessões dos testes: ref_code, UTMs, inputs, qualificação, outcome, last_scene
select ref_code, utm_source, utm_campaign, fbclid, device, in_app_browser,
       segmento, leads_mes, conv_10, ticket, investe, faturamento,
       round(receita_extra) as receita_extra, qualificado, outcome, last_scene,
       std_on_at is not null as std_on, completed_at is not null as concluiu, created_at
from public.funil_sessions
where utm_campaign like 'teste_e2e%'
order by created_at desc;

-- 2) Eventos de cada cena, por sessão de teste (ordem real de chegada)
select s.ref_code, s.utm_campaign,
       string_agg(e.name || coalesce('@' || e.scene, ''), ' → ' order by e.id) as eventos
from public.funil_sessions s
join public.funil_events e on e.session_id = s.id
where s.utm_campaign like 'teste_e2e%'
group by s.ref_code, s.utm_campaign, s.created_at
order by s.created_at desc;

-- Para apagar os dados de teste depois:
-- delete from public.funil_sessions where utm_campaign like 'teste_e2e%';

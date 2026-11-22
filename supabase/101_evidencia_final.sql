-- Funil Vivo · 101 · evidência final em UMA tabela (cole e rode inteiro)
-- Uma linha por sessão de teste + quantos admins existem.
select
  s.ref_code,
  s.utm_campaign as campanha,
  s.utm_source,
  s.fbclid,
  s.in_app_browser,
  s.segmento,
  s.leads_mes,
  s.conv_10,
  s.ticket,
  s.investe,
  s.faturamento,
  s.qualificado,
  s.outcome,
  s.last_scene,
  s.completed_at is not null as concluiu,
  (select count(*) from public.funil_events e where e.session_id = s.id) as eventos,
  (select count(*) from public.fv_admins) as admins
from public.funil_sessions s
where s.utm_campaign like 'teste_e2e%'
order by s.created_at desc;

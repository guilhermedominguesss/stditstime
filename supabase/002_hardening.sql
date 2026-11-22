-- =====================================================================
-- Funil Vivo · 002 · proteção (padrão do STD Thais: testethais/supabase/hardening.sql)
-- Triggers valem para QUALQUER insert, inclusive os feitos pelas RPCs (003).
--   * sessão: created_at do servidor, resultado nasce limpo, limite de 30 sessões/hora
--     por IP (guardado só como hash);
--   * evento: só em sessão das últimas 24h; teto de 400 por sessão e 90 por minuto.
-- Idempotente.
-- =====================================================================

begin;

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

-- funções de trigger não são chamáveis por ninguém de fora
revoke all on function public.fv_before_session_insert() from public, anon, authenticated;
revoke all on function public.fv_before_event_insert() from public, anon, authenticated;

commit;

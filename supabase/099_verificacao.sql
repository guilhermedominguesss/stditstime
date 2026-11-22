-- =====================================================================
-- Funil Vivo · 099 · verificação de segurança (rodar DEPOIS de 001–004)
-- Simula cada papel (anon, usuário de cliente do painel, admin) e as travas.
-- Devolve uma tabela item | esperado | obtido | ok. Tudo que cria para testar, apaga.
-- Pode rodar quantas vezes quiser.
-- =====================================================================

drop table if exists pg_temp.fv_check;
create temp table fv_check (ordem serial, item text, esperado text, obtido text, ok boolean);

do $$
declare
  n int;
  total int;
  r text;
  ok boolean;
  admin_id uuid;
  client_uid uuid := gen_random_uuid();     -- um usuário logado qualquer (cliente do painel)
  s_lock uuid := gen_random_uuid();         -- sessão para testar a trava de 24h
  s_rate uuid := gen_random_uuid();         -- sessão para testar o limite por minuto
  i int;
  fns text;
begin
  /* ---------- estrutura ---------- */
  insert into fv_check (item, esperado, obtido, ok) values
    ('tabela funil_sessions existe', 'sim', coalesce(to_regclass('public.funil_sessions')::text, 'não'), to_regclass('public.funil_sessions') is not null),
    ('tabela funil_events existe', 'sim', coalesce(to_regclass('public.funil_events')::text, 'não'), to_regclass('public.funil_events') is not null),
    ('RLS ligado em funil_sessions', 'sim', (select relrowsecurity::text from pg_class where oid = 'public.funil_sessions'::regclass), (select relrowsecurity from pg_class where oid = 'public.funil_sessions'::regclass)),
    ('RLS ligado em funil_events', 'sim', (select relrowsecurity::text from pg_class where oid = 'public.funil_events'::regclass), (select relrowsecurity from pg_class where oid = 'public.funil_events'::regclass));

  /* ---------- anon: não lê, não escreve direto ---------- */
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.funil_sessions' into n;
    r := 'leu ' || n || ' linha(s)'; ok := false;
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('anon: SELECT funil_sessions', 'negado', r, ok);

  begin
    execute 'set local role anon';
    execute 'select count(*) from public.funil_events' into n;
    r := 'leu ' || n || ' linha(s)'; ok := false;
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('anon: SELECT funil_events', 'negado', r, ok);

  begin
    execute 'set local role anon';
    execute 'insert into public.funil_sessions (id) values (gen_random_uuid())';
    r := 'inseriu'; ok := false;
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('anon: INSERT direto em funil_sessions', 'negado', r, ok);

  /* ---------- anon: escreve pelas RPCs ---------- */
  begin
    execute 'set local role anon';
    execute 'select public.fv_create_session($1, null, $2)' using s_lock, '{"utm_source":"verificacao","device":"mobile"}'::jsonb;
    execute 'select public.fv_log_event($1, ''fv_view'', ''nicho'', ''{}''::jsonb)' using s_lock;
    execute 'select public.fv_patch_session($1, ''{"conv_10": 4, "last_scene": "de_cada_10"}''::jsonb)' using s_lock;
    r := 'ok'; ok := true;
  exception when others then r := sqlerrm; ok := false;
  end;
  execute 'reset role';
  select count(*) into n from public.funil_events where session_id = s_lock;
  insert into fv_check (item, esperado, obtido, ok) values
    ('anon: criar sessão + evento + patch pelas RPCs', 'ok', r, ok),
    ('RPC gravou de fato (sessão, conv_10, evento)', 'conv_10=4, 1 evento',
      coalesce((select 'conv_10=' || conv_10 || ', ' || n || ' evento' from public.funil_sessions where id = s_lock), 'sessão não existe'),
      exists (select 1 from public.funil_sessions where id = s_lock and conv_10 = 4) and n = 1);

  select count(*) into total from public.funil_sessions;

  /* ---------- usuário de cliente do painel (logado, não admin) ---------- */
  perform set_config('request.jwt.claims', json_build_object('sub', client_uid, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    execute 'select count(*) from public.funil_sessions' into n;
    r := 'viu ' || n || ' de ' || total || ' linha(s)'; ok := (n = 0 and total > 0);
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('cliente do painel: SELECT funil_sessions', '0 linhas', r, ok);

  begin
    execute 'set local role authenticated';
    execute 'select count(*) from public.funil_events' into n;
    r := 'viu ' || n || ' linha(s)'; ok := (n = 0);
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('cliente do painel: SELECT funil_events', '0 linhas', r, ok);

  begin
    execute 'set local role authenticated';
    execute 'select public.fv_patch_session($1, ''{"conv_10": 1}''::jsonb)' using s_lock;
    r := 'executou'; ok := false;
  exception when insufficient_privilege then r := 'permission denied'; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('cliente do painel: chamar RPC do funil', 'negado', r, ok);

  /* ---------- admin (fv_admins) ---------- */
  select user_id into admin_id from public.fv_admins limit 1;
  if admin_id is null then
    insert into fv_check (item, esperado, obtido, ok) values ('admin cadastrado em fv_admins', '1 usuário', 'nenhum (rode o 004 com o seu e-mail)', false);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    begin
      execute 'set local role authenticated';
      execute 'select count(*) from public.funil_sessions' into n;
      r := 'viu ' || n || ' de ' || total || ' linha(s)'; ok := (n = total);
    exception when others then r := sqlerrm; ok := false;
    end;
    execute 'reset role';
    insert into fv_check (item, esperado, obtido, ok) values ('admin: SELECT funil_sessions', 'todas', r, ok);
  end if;
  perform set_config('request.jwt.claims', '', true);

  /* ---------- nenhum outro caminho até os dados ---------- */
  select count(*) into n from pg_views where schemaname not in ('pg_catalog', 'information_schema') and definition ilike '%funil_%';
  insert into fv_check (item, esperado, obtido, ok) values ('views que leem funil_*', '0', n::text, n = 0);

  select string_agg(p.proname, ', ' order by p.proname) into fns
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and (p.prosrc ilike '%funil_sessions%' or p.prosrc ilike '%funil_events%');
  insert into fv_check (item, esperado, obtido, ok) values (
    'funções que tocam funil_* (todas só escrevem)',
    'fv_before_event_insert, fv_before_session_insert, fv_create_session, fv_log_event, fv_patch_session',
    fns,
    fns = 'fv_before_event_insert, fv_before_session_insert, fv_create_session, fv_log_event, fv_patch_session');

  /* ---------- trava de 24h ---------- */
  update public.funil_sessions set created_at = now() - interval '25 hours' where id = s_lock;
  execute 'set local role anon';
  execute 'select public.fv_patch_session($1, ''{"conv_10": 9}''::jsonb)' using s_lock;
  execute 'reset role';
  select conv_10 into n from public.funil_sessions where id = s_lock;
  insert into fv_check (item, esperado, obtido, ok) values ('sessão com 25h: patch ignorado', 'conv_10 continua 4', 'conv_10=' || n, n = 4);

  begin
    execute 'set local role anon';
    execute 'select public.fv_log_event($1, ''fv_view'', ''nicho'', ''{}''::jsonb)' using s_lock;
    r := 'aceitou'; ok := false;
  exception when others then r := sqlerrm; ok := true;
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('sessão com 25h: evento recusado', 'erro', r, ok);

  /* ---------- limite por sessão (90 eventos/minuto) ---------- */
  execute 'set local role anon';
  execute 'select public.fv_create_session($1, null, ''{}''::jsonb)' using s_rate;
  execute 'reset role';
  i := 0;
  begin
    execute 'set local role anon';
    for k in 1..95 loop
      execute 'select public.fv_log_event($1, ''fv_input'', ''teste'', ''{}''::jsonb)' using s_rate;
      i := k;
    end loop;
    r := 'aceitou os 95'; ok := false;
  exception when others then r := 'parou depois de ' || i || ': ' || sqlerrm; ok := (i = 90);
  end;
  execute 'reset role';
  insert into fv_check (item, esperado, obtido, ok) values ('limite: 90 eventos/minuto por sessão', 'parar no 91º', r, ok);

  /* ---------- limite por IP (30 sessões/hora) ---------- */
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.77"}', true);
  i := 0;
  begin
    execute 'set local role anon';
    for k in 1..32 loop
      execute 'select public.fv_create_session(gen_random_uuid(), null, ''{}''::jsonb)';
      i := k;
    end loop;
    r := 'aceitou as 32'; ok := false;
  exception when others then r := 'parou depois de ' || i || ': ' || sqlerrm; ok := (i = 30);
  end;
  execute 'reset role';
  perform set_config('request.headers', '', true);
  insert into fv_check (item, esperado, obtido, ok) values ('limite: 30 sessões/hora por IP', 'parar na 31ª', r, ok);

  /* ---------- limpeza ---------- */
  delete from public.funil_sessions
  where id in (s_lock, s_rate) or ip_hash = md5('203.0.113.77:fv-salt-v1');
end $$;

select ordem, item, esperado, obtido, case when ok then '✅' else '❌' end as ok from fv_check order by ordem;

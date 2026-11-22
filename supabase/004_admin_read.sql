-- =====================================================================
-- Funil Vivo · 004 · leitura só para admin
--
-- No painel, qualquer usuário logado lê std_* (dashboard_rls.sql). As tabelas funil_*
-- são da It's Time: só quem estiver em fv_admins lê. Usuário de cliente do painel não
-- lê nada: nem tabela, nem view, nem RPC (nenhuma função devolve linhas de funil_*).
--
-- ANTES DE RODAR: troque SEU_EMAIL_DE_LOGIN_DO_PAINEL no final pelo e-mail com que
-- você entra no painel (não salve o arquivo com o e-mail: ele vai para o GitHub).
-- Idempotente.
-- =====================================================================

begin;

create table if not exists public.fv_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.fv_admins enable row level security;
revoke all on public.fv_admins from public, anon, authenticated; -- ninguém lê a lista pela API

create or replace function public.fv_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fv_admins where user_id = auth.uid());
$$;
revoke all on function public.fv_is_admin() from public, anon;
grant execute on function public.fv_is_admin() to authenticated;

-- leitura: grant de SELECT para authenticated + policy que só deixa passar admin
grant select on public.funil_sessions to authenticated;
grant select on public.funil_events to authenticated;

drop policy if exists "fv admin read sessions" on public.funil_sessions;
create policy "fv admin read sessions" on public.funil_sessions
  for select to authenticated using (public.fv_is_admin());

drop policy if exists "fv admin read events" on public.funil_events;
create policy "fv admin read events" on public.funil_events
  for select to authenticated using (public.fv_is_admin());

-- você como admin (troque o e-mail antes de rodar)
insert into public.fv_admins (user_id)
select id from auth.users where lower(email) = lower('SEU_EMAIL_DE_LOGIN_DO_PAINEL')
on conflict do nothing;

commit;

-- deve listar 1 linha (você); se vier vazio, o e-mail não bate com auth.users
select a.user_id, u.email from public.fv_admins a join auth.users u on u.id = a.user_id;

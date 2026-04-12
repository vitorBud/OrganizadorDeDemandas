-- Schema base do OrgDemandas (rode PRIMEIRO no SQL Editor do Supabase).
-- Depois: collab_setup.sql e tasks_schema.sql (nessa ordem).

-- ---------------------------------------------------------------------------
-- Perfis (nome exibido no app; ligado ao Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Usuário'
    )
  )
  on conflict (id) do update
    set name = excluded.name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Projetos e membros
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (project_id, user_id)
);

create or replace function public.handle_new_project_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id)
  values (new.id, new.owner_id)
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created_add_owner on public.projects;
create trigger on_project_created_add_owner
  after insert on public.projects
  for each row execute function public.handle_new_project_owner_member();

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

create or replace function public.is_project_member(p_project uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members m
    where m.project_id = p_project
      and m.user_id = p_user
  );
$$;

grant execute on function public.is_project_member(uuid, uuid) to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.is_project_member(id, auth.uid()));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (auth.uid() = owner_id);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.is_project_member(id, auth.uid()))
  with check (public.is_project_member(id, auth.uid()));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (owner_id = auth.uid());

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (public.is_project_member(project_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Blocos (documento livre) e mensagens (chat)
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null,
  content text not null default '',
  meta jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists blocks_project_idx on public.blocks (project_id);
create index if not exists messages_project_idx on public.messages (project_id);

alter table public.blocks enable row level security;
alter table public.messages enable row level security;

drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists blocks_update on public.blocks;
create policy blocks_update on public.blocks
  for update using (public.is_project_member(project_id, auth.uid()))
  with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
  for delete using (public.is_project_member(project_id, auth.uid()));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_project_member(project_id, auth.uid())
    and user_id = auth.uid()
  );

-- Realtime (ignore erro se a tabela já estiver na publicação):
-- alter publication supabase_realtime add table public.blocks;
-- alter publication supabase_realtime add table public.messages;
-- alter publication supabase_realtime add table public.projects;

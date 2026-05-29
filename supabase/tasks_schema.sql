-- Extensão do colaborativo: Kanban, comentários por tarefa, histórico e notificações.
-- Pré-requisitos: tabelas public.projects, public.project_members e public.profiles (id = auth.users.id).

-- ---------------------------------------------------------------------------
-- Tarefas
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done')),
  assignee_id uuid references auth.users (id) on delete set null,
  due_date date,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_status_idx on public.tasks (project_id, status);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

-- ---------------------------------------------------------------------------
-- Comentários na tarefa
-- ---------------------------------------------------------------------------
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id);
create index if not exists task_comments_project_idx on public.task_comments (project_id);

-- ---------------------------------------------------------------------------
-- Histórico de alterações
-- ---------------------------------------------------------------------------
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_project_idx on public.task_activity (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notificações in-app
-- ---------------------------------------------------------------------------
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_idx on public.app_notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.app_notifications enable row level security;

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

-- tasks
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (public.is_project_member(project_id, auth.uid()))
  with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (public.is_project_member(project_id, auth.uid()));

-- task_comments
drop policy if exists task_comments_select on public.task_comments;
create policy task_comments_select on public.task_comments
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists task_comments_insert on public.task_comments;
create policy task_comments_insert on public.task_comments
  for insert with check (public.is_project_member(project_id, auth.uid()) and user_id = auth.uid());

drop policy if exists task_comments_delete on public.task_comments;
create policy task_comments_delete on public.task_comments
  for delete using (user_id = auth.uid());

-- task_activity
drop policy if exists task_activity_select on public.task_activity;
create policy task_activity_select on public.task_activity
  for select using (public.is_project_member(project_id, auth.uid()));

drop policy if exists task_activity_insert on public.task_activity;
create policy task_activity_insert on public.task_activity
  for insert with check (
    public.is_project_member(project_id, auth.uid())
    and (actor_id is null or actor_id = auth.uid())
  );

-- app_notifications
drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select on public.app_notifications
  for select using (user_id = auth.uid());

drop policy if exists app_notifications_insert on public.app_notifications;
create policy app_notifications_insert on public.app_notifications
  for insert with check (
    public.is_project_member(project_id, auth.uid())
    and public.is_project_member(project_id, user_id)
  );

drop policy if exists app_notifications_update on public.app_notifications;
create policy app_notifications_update on public.app_notifications
  for update using (user_id = auth.uid());

grant execute on function public.is_project_member(uuid, uuid) to authenticated;

-- Reordenação/mudança de coluna em lote.
-- Evita que o Realtime publique estados intermediários enquanto o usuário arrasta cards.
create or replace function public.reorder_project_tasks(p_project_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_member(p_project_id, auth.uid()) then
    raise exception 'Sem acesso ao projeto.' using errcode = '42501';
  end if;

  update public.tasks t
     set status = item.status,
         sort_order = item.sort_order,
         updated_at = now()
    from (
      select
        (value->>'id')::uuid as id,
        value->>'status' as status,
        (value->>'sortOrder')::int as sort_order
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    ) as item
   where t.project_id = p_project_id
     and t.id = item.id;
end;
$$;

grant execute on function public.reorder_project_tasks(uuid, jsonb) to authenticated;

-- Realtime (rode no painel se a linha abaixo falhar por duplicidade):
-- alter publication supabase_realtime add table public.tasks;
-- alter publication supabase_realtime add table public.task_comments;
-- alter publication supabase_realtime add table public.task_activity;
-- alter publication supabase_realtime add table public.app_notifications;

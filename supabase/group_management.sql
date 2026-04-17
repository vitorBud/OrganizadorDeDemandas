-- Gestão de grupos: sair do grupo e expulsar membros.
-- Rode no SQL Editor do Supabase.

drop function if exists public.leave_project(uuid);
create or replace function public.leave_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.projects
  where id = p_project_id;

  if v_owner is null then
    raise exception 'Projeto não encontrado' using errcode = 'P0001';
  end if;

  if v_owner = auth.uid() then
    raise exception 'Líder não pode sair sem excluir o grupo' using errcode = 'P0001';
  end if;

  delete from public.project_members
  where project_id = p_project_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_project(uuid) to authenticated;

drop function if exists public.remove_project_member(uuid, uuid);
create or replace function public.remove_project_member(p_project_id uuid, p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.projects
  where id = p_project_id;

  if v_owner is null then
    raise exception 'Projeto não encontrado' using errcode = 'P0001';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'Somente o líder pode remover membros' using errcode = 'P0001';
  end if;

  if p_target_user_id = v_owner then
    raise exception 'Não é possível remover o líder' using errcode = 'P0001';
  end if;

  delete from public.project_members
  where project_id = p_project_id
    and user_id = p_target_user_id;

  update public.tasks
  set assignee_id = null,
      updated_at = now()
  where project_id = p_project_id
    and assignee_id = p_target_user_id;
end;
$$;

grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

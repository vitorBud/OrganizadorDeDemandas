-- Rode no SQL Editor do Supabase (projeto novo ou migração).
-- Entrar na sala por código: insere em project_members e devolve o projeto
-- em JSON (evita um segundo SELECT que o RLS poderia bloquear).

DROP FUNCTION IF EXISTS public.join_project_by_code(text);

create or replace function public.join_project_by_code(invite_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  prow public.projects%rowtype;
begin
  select * into prow
  from public.projects p
  where upper(trim(p.join_code)) = upper(trim(invite_code))
  limit 1;

  if not found then
    raise exception 'Código inválido' using errcode = 'P0001';
  end if;

  insert into public.project_members (project_id, user_id)
  values (prow.id, auth.uid())
  on conflict (project_id, user_id) do nothing;

  return json_build_object(
    'id', prow.id,
    'name', prow.name,
    'join_code', prow.join_code,
    'owner_id', prow.owner_id,
    'updated_at', prow.updated_at
  );
end;
$$;

grant execute on function public.join_project_by_code(text) to authenticated;

-- Realtime: Database → Publications → supabase_realtime
-- Marque public.blocks e public.messages (ou):
-- alter publication supabase_realtime add table public.blocks;
-- alter publication supabase_realtime add table public.messages;

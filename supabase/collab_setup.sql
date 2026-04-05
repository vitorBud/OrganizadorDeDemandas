-- Rode no SQL Editor do Supabase se ainda não existir.
-- 1) Entrar na sala só com código válido (seguro no servidor)

create or replace function public.join_project_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  select id into pid
  from public.projects
  where upper(trim(join_code)) = upper(trim(p_code));

  if pid is null then
    raise exception 'Código inválido' using errcode = 'P0001';
  end if;

  insert into public.project_members (project_id, user_id)
  values (pid, auth.uid())
  on conflict (project_id, user_id) do nothing;

  return pid;
end;
$$;

grant execute on function public.join_project_by_code(text) to authenticated;

-- Opcional: permitir que membros vejam nomes nos chats (ajuste se já tiver política)
-- drop policy if exists "profiles_select_authenticated" on public.profiles;
-- create policy "profiles_select_authenticated"
--   on public.profiles for select to authenticated using (true);

-- 2) Tempo real: Database → Publications → supabase_realtime
--    Marque as tabelas public.blocks e public.messages (ou rode, se sua versão permitir):

-- alter publication supabase_realtime add table public.blocks;
-- alter publication supabase_realtime add table public.messages;

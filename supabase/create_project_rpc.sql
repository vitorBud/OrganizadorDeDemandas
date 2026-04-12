-- Cria projeto com owner = auth.uid() no servidor (evita falha de RLS no INSERT direto).
-- Rode no SQL Editor depois de core_schema / se "criar projeto" der erro de RLS.

create or replace function public.create_project(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_row public.projects%rowtype;
  jc text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  pos int;
  attempt int := 0;
begin
  if uid is null then
    raise exception 'Não autenticado' using errcode = 'P0001';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nome obrigatório' using errcode = 'P0001';
  end if;

  loop
    jc := '';
    for i in 1..6 loop
      pos := 1 + floor(random() * length(chars))::int;
      jc := jc || substr(chars, pos, 1);
    end loop;
    exit when not exists (select 1 from public.projects p where upper(p.join_code) = upper(jc));
    attempt := attempt + 1;
    exit when attempt > 40;
  end loop;

  insert into public.projects (name, join_code, owner_id)
  values (trim(p_name), jc, uid)
  returning * into new_row;

  return json_build_object(
    'id', new_row.id,
    'name', new_row.name,
    'join_code', new_row.join_code,
    'owner_id', new_row.owner_id,
    'updated_at', new_row.updated_at
  );
end;
$$;

grant execute on function public.create_project(text) to authenticated;

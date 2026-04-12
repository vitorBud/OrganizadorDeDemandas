-- Cor de destaque do utilizador (nomes no chat, Kanban, comentários).
-- Rode no SQL Editor depois de core_schema.sql.

alter table public.profiles add column if not exists accent_color text;

comment on column public.profiles.accent_color is 'Hex #rrggbb opcional; UI usa tom derivado do id se null.';

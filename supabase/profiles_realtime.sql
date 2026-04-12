-- Permite que o browser receba mudanças em perfis (ex.: accent_color) em tempo quase real.
-- Se der erro "already member of publication", a tabela já está incluída — pode ignorar.

alter publication supabase_realtime add table public.profiles;

-- Chat: nome no envio + melhor suporte a Realtime (rode no SQL Editor uma vez).

-- Nome exibido gravado junto da mensagem (fallback quando profiles.name está vazio)
alter table public.messages add column if not exists sender_name text;

-- Cor (#rrggbb) no envio — o leitor vê a cor certa mesmo se o join em profiles falhar
alter table public.messages add column if not exists sender_accent text;

-- Melhora entrega de eventos do Realtime com filtro por project_id
alter table public.messages replica identity full;

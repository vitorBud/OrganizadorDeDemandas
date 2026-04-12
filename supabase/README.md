# Supabase — colocar o OrgDemandas online

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto (anote a região).
2. No painel: **Project Settings → API**
   - **Project URL** → será o `VITE_SUPABASE_URL`
   - **anon public** → será o `VITE_SUPABASE_ANON_KEY`

## 2. Variáveis no app (local)

Na **raiz** do repositório (mesmo nível que `package.json`):

1. Copie o exemplo:

   ```bash
   copy .env.example .env.local
   ```

   (No PowerShell; no mac/Linux: `cp .env.example .env.local`.)

2. Edite `.env.local` e preencha com os valores do passo 1:

   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Pare e suba de novo o dev server: `npm run dev`  
   (o Vite só lê `.env*` ao iniciar.)

## 3. Banco de dados (SQL)

No Supabase: **SQL Editor**, rode **nesta ordem** (cada arquivo completo, de uma vez):

| Ordem | Arquivo            | O que faz                          |
| ----- | ------------------ | ---------------------------------- |
| 1     | `core_schema.sql`  | `profiles`, `projects`, membros, `blocks`, `messages`, RLS |
| 2     | `collab_setup.sql` | função `join_project_by_code`      |
| 3     | `tasks_schema.sql` | Kanban, comentários, histórico, notificações |

Se algum `CREATE` falhar dizendo que já existe, você pode estar repetindo script em projeto já configurado — ajuste só o que faltar.

## 4. Autenticação

- **Authentication → Providers → Email**: habilitado (padrão).
- Se usar confirmação por e-mail, o usuário precisa clicar no link antes de logar.

## 5. Realtime (chat e quadro ao vivo)

**Database → Publications** → edite `supabase_realtime` e inclua as tabelas:

- `blocks`, `messages`, `projects`
- (opcional, Kanban/notificações) `tasks`, `task_comments`, `task_activity`, `app_notifications`

Ou rode no SQL Editor (pode dar erro se a tabela já estiver na publicação):

```sql
alter publication supabase_realtime add table public.blocks;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.projects;
```

## 6. Deploy (ex.: Vercel)

No painel do host: **Environment Variables** (Production + Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Mesmos valores do `.env.local`. Faça um **novo deploy** depois de salvar.

**Importante:** não commite `.env.local` (deve estar no `.gitignore`).

## 7. Usuários que já existiam antes do `profiles`

Se você criou contas antes de rodar `core_schema.sql`, pode não haver linha em `profiles`. Rode no SQL (substitua o e-mail):

```sql
insert into public.profiles (id, name)
select id, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
```

---

Com URL + anon key corretos e SQL aplicado, o app deixa o modo “só local” e o aviso no console **não aparece** em build de produção; em dev, só aparece `console.info` se ainda não houver `.env.local`.

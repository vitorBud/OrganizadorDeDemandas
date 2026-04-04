import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[OrgDemandas] Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')

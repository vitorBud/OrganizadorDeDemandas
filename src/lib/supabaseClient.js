import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const configured = Boolean(url && anonKey)

if (!configured) {
  console.warn(
    '[OrgDemandas] Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local (dev) ou nas Environment Variables da Vercel (produção). Sem isso o app roda só em modo local.'
  )
}

/** Só existe quando URL + anon key estão definidos; caso contrário `null` (evita crash do SDK). */
export const supabase = configured ? createClient(url, anonKey) : null

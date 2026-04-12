import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const configured = Boolean(url && anonKey)

// Aviso só em desenvolvimento (evita ruído no console em produção).
if (!configured && import.meta.env.DEV) {
  console.info(
    '[OrgDemandas] Modo local: crie .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar Supabase. Veja supabase/README.md.'
  )
}

/** Só existe quando URL + anon key estão definidos; caso contrário `null` (evita crash do SDK). */
export const supabase = configured ? createClient(url, anonKey) : null

import { supabase } from './supabaseClient'
import { normalizeAccentColor } from './userColor'

/** Mensagem quando o pedido falha por a coluna ainda não existir na API (migração ou reload do schema). */
export const ACCENT_COLUMN_MIGRATION_HINT =
  'Confirme que correu supabase/profile_accent_color.sql. No Supabase: Settings → API → reiniciar projeto ou aguarde o schema cache atualizar; depois atualize a página (F5).'

/**
 * Erro PostgREST típico: coluna em falta ou cache desatualizado a referir coluna em falta.
 * Não usar "schema cache" sozinho — evita falsos positivos.
 */
function isMissingAccentColumnError(err) {
  const msg = String(err?.message || err?.details || err?.hint || '')
  if (!/accent_color/i.test(msg)) return false
  return /could not find|schema cache|column|42703|does not exist/i.test(msg)
}

function mapProfileRows(data) {
  return Object.fromEntries(
    (data ?? []).map((p) => [
      p.id,
      {
        name: p.name ?? '',
        accentColor: normalizeAccentColor(p.accent_color) ?? null,
      },
    ])
  )
}

/**
 * Sempre tenta incluir accent_color; se a API ainda não a expuser, repete só com name (sem “memória” entre pedidos).
 * @param {string[]} ids
 * @returns {Promise<Record<string, { name: string, accentColor: string | null }>>}
 */
export async function fetchProfilesDisplayMapByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (unique.length === 0) return {}

  let { data, error } = await supabase
    .from('profiles')
    .select('id, name, accent_color')
    .in('id', unique)

  if (error && isMissingAccentColumnError(error)) {
    ;({ data, error } = await supabase.from('profiles').select('id, name').in('id', unique))
  }

  if (error) throw error
  return mapProfileRows(data)
}

/**
 * @param {string} uid
 * @returns {Promise<{ name?: string, accent_color?: string | null } | null>}
 */
export async function fetchMyProfileRow(uid) {
  let { data, error } = await supabase
    .from('profiles')
    .select('name, accent_color')
    .eq('id', uid)
    .maybeSingle()

  if (error && isMissingAccentColumnError(error)) {
    ;({ data, error } = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle())
  }

  if (error) throw error
  return data
}

/**
 * @param {string} userId
 * @param {string | null} normalizedHex null = limpar
 */
export async function updateProfileAccentColorRemote(userId, normalizedHex) {
  // Só accent_color: muitos projetos não têm profiles.updated_at ou o schema cache falha nessa coluna.
  const patch =
    normalizedHex == null ? { accent_color: null } : { accent_color: normalizedHex }

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)

  if (error && isMissingAccentColumnError(error)) {
    return { ok: false, error: ACCENT_COLUMN_MIGRATION_HINT }
  }

  if (error) return { ok: false, error: error.message || 'Erro ao guardar.' }
  return { ok: true }
}

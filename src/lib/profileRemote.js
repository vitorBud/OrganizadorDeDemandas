import { supabase } from './supabaseClient'
import { normalizeAccentColor } from './userColor'

/** Mensagem quando a coluna ainda não existe na base (rode profile_accent_color.sql). */
export const ACCENT_COLUMN_MIGRATION_HINT =
  'No Supabase, execute o ficheiro supabase/profile_accent_color.sql no SQL Editor (coluna profiles.accent_color).'

let profilesSelectIncludesAccent = true

export function isProfilesAccentColumnAvailable() {
  return profilesSelectIncludesAccent
}

export function markProfilesAccentColumnUnavailable() {
  profilesSelectIncludesAccent = false
}

function isMissingAccentColumnError(err) {
  const msg = String(err?.message || err?.details || err?.hint || '')
  return (
    /accent_color/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /could not find.*column/i.test(msg)
  )
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
 * @param {string[]} ids
 * @returns {Promise<Record<string, { name: string, accentColor: string | null }>>}
 */
export async function fetchProfilesDisplayMapByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  if (unique.length === 0) return {}

  const cols = profilesSelectIncludesAccent ? 'id, name, accent_color' : 'id, name'
  let { data, error } = await supabase.from('profiles').select(cols).in('id', unique)

  if (error && profilesSelectIncludesAccent && isMissingAccentColumnError(error)) {
    markProfilesAccentColumnUnavailable()
    ;({ data, error } = await supabase.from('profiles').select('id, name').in('id', unique))
  }

  if (error) throw error
  return mapProfileRows(data)
}

/**
 * Uma linha de perfil (login / Auth).
 * @param {string} uid
 * @returns {Promise<{ name?: string, accent_color?: string | null } | null>}
 */
export async function fetchMyProfileRow(uid) {
  const cols = profilesSelectIncludesAccent ? 'name, accent_color' : 'name'
  let { data, error } = await supabase.from('profiles').select(cols).eq('id', uid).maybeSingle()

  if (error && profilesSelectIncludesAccent && isMissingAccentColumnError(error)) {
    markProfilesAccentColumnUnavailable()
    ;({ data, error } = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle())
  }

  if (error) throw error
  return data
}

/**
 * Atualiza accent_color no remoto; falha com mensagem clara se a coluna não existir.
 * @param {string} userId
 * @param {string | null} normalizedHex null = limpar
 */
export async function updateProfileAccentColorRemote(userId, normalizedHex) {
  if (!profilesSelectIncludesAccent) {
    if (normalizedHex == null) {
      return { ok: true, skipped: true }
    }
    return { ok: false, error: ACCENT_COLUMN_MIGRATION_HINT }
  }

  const patch =
    normalizedHex == null
      ? { accent_color: null, updated_at: new Date().toISOString() }
      : { accent_color: normalizedHex, updated_at: new Date().toISOString() }

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)

  if (error && isMissingAccentColumnError(error)) {
    markProfilesAccentColumnUnavailable()
    if (normalizedHex == null) return { ok: true, skipped: true }
    return { ok: false, error: ACCENT_COLUMN_MIGRATION_HINT }
  }

  if (error) return { ok: false, error: error.message || 'Erro ao guardar.' }
  return { ok: true }
}

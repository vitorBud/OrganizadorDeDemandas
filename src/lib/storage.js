const KEYS = {
  users: 'orgdemandas_users',
  projects: 'orgdemandas_projects',
  session: 'orgdemandas_session',
}

/** Camada simples de leitura com fallback para quando o localStorage está vazio/corrompido. */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

/** Persiste objetos como JSON no navegador. */
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Usuários locais usados quando o Supabase não está configurado. */
export function getUsers() {
  return read(KEYS.users, [])
}

export function saveUsers(users) {
  write(KEYS.users, users)
}

/** Projetos locais usados no modo offline/local. */
export function getProjects() {
  return read(KEYS.projects, [])
}

export function saveProjects(projects) {
  write(KEYS.projects, projects)
}

export function getSessionUserId() {
  return read(KEYS.session, null)
}

/** Guarda apenas o id da sessão local; no Supabase a sessão fica com o SDK. */
export function setSessionUserId(userId) {
  if (userId == null) localStorage.removeItem(KEYS.session)
  else write(KEYS.session, userId)
}

/** Id curto para entidades locais; no modo remoto normalmente usamos crypto.randomUUID(). */
export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** Código humano para convidar pessoas a uma sala/projeto. */
export function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

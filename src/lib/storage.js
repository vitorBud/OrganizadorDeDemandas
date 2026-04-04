const KEYS = {
  users: 'orgdemandas_users',
  projects: 'orgdemandas_projects',
  session: 'orgdemandas_session',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getUsers() {
  return read(KEYS.users, [])
}

export function saveUsers(users) {
  write(KEYS.users, users)
}

export function getProjects() {
  return read(KEYS.projects, [])
}

export function saveProjects(projects) {
  write(KEYS.projects, projects)
}

export function getSessionUserId() {
  return read(KEYS.session, null)
}

export function setSessionUserId(userId) {
  if (userId == null) localStorage.removeItem(KEYS.session)
  else write(KEYS.session, userId)
}

export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

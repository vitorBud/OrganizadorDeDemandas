import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react'
import {
  getUsers,
  saveUsers,
  getSessionUserId,
  setSessionUserId,
  generateId,
} from '../lib/storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [userId, setUserId] = useState(() => getSessionUserId())

  useEffect(() => {
    setSessionUserId(userId)
  }, [userId])

  const user = useMemo(() => {
    if (!userId) return null
    const users = getUsers()
    return users.find((u) => u.id === userId) ?? null
  }, [userId])

  const login = useCallback((email, password) => {
    const users = getUsers()
    const found = users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    )
    if (!found) return { ok: false, error: 'E-mail ou senha incorretos.' }
    setUserId(found.id)
    return { ok: true }
  }, [])

  const register = useCallback((name, email, password) => {
    const users = getUsers()
    const emailNorm = email.trim().toLowerCase()
    if (users.some((u) => u.email.toLowerCase() === emailNorm)) {
      return { ok: false, error: 'Este e-mail já está cadastrado.' }
    }
    const id = generateId()
    users.push({
      id,
      name: name.trim(),
      email: emailNorm,
      password,
      createdAt: Date.now(),
    })
    saveUsers(users)
    setUserId(id)
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    setUserId(null)
  }, [])

  const value = useMemo(
    () => ({ user, userId, login, register, logout, isAuthenticated: !!user }),
    [user, userId, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API for this context module
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

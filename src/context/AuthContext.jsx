import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabaseClient'
import { isRemoteCollab } from '../lib/collabApi'
import {
  getUsers,
  saveUsers,
  getSessionUserId,
  setSessionUserId,
  generateId,
} from '../lib/storage'
import { normalizeAccentColor } from '../lib/userColor'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  /** Modo Supabase só quando `createClient` foi possível (env no build). */
  const remote = isRemoteCollab()
  const [userId, setUserId] = useState(() => (remote ? null : getSessionUserId()))
  const [remoteUser, setRemoteUser] = useState(null)
  const [authReady, setAuthReady] = useState(!remote)
  const [localProfileTick, setLocalProfileTick] = useState(0)

  useEffect(() => {
    if (!remote) {
      setSessionUserId(userId)
    }
  }, [remote, userId])

  useEffect(() => {
    if (!remote || !supabase) return

    let cancelled = false

    async function loadProfile(uid) {
      let data = null
      const q1 = await supabase
        .from('profiles')
        .select('name, accent_color')
        .eq('id', uid)
        .maybeSingle()
      if (!q1.error) {
        data = q1.data
      } else if (/accent_color|schema cache|column/i.test(String(q1.error?.message || ''))) {
        const q2 = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle()
        if (!q2.error) data = q2.data
      }
      if (cancelled) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setRemoteUser({
        id: user.id,
        email: user.email ?? '',
        name: data?.name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Usuário',
        accentColor: normalizeAccentColor(data?.accent_color) ?? null,
      })
      setUserId(user.id)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setUserId(null)
        setRemoteUser(null)
      }
      setAuthReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setUserId(null)
        setRemoteUser(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [remote])

  const user = useMemo(() => {
    if (remote) return remoteUser
    if (!userId) return null
    void localProfileTick
    const users = getUsers()
    const row = users.find((u) => u.id === userId)
    if (!row) return null
    return {
      ...row,
      accentColor: normalizeAccentColor(row.accentColor) ?? null,
    }
  }, [remote, remoteUser, userId, localProfileTick])

  const login = useCallback(
    async (email, password) => {
      if (remote && supabase) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) return { ok: false, error: error.message || 'Falha ao entrar.' }
        return { ok: true }
      }
      const users = getUsers()
      const found = users.find(
        (u) =>
          u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
      )
      if (!found) return { ok: false, error: 'E-mail ou senha incorretos.' }
      setUserId(found.id)
      return { ok: true }
    },
    [remote]
  )

  const register = useCallback(
    async (name, email, password) => {
      if (remote && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        })
        if (error) return { ok: false, error: error.message || 'Não foi possível cadastrar.' }
        if (data.session) {
          return { ok: true }
        }
        return {
          ok: true,
          needsEmailConfirm: true,
          message:
            'Conta criada. Se o projeto exigir confirmação por e-mail, abra o link enviado antes de entrar.',
        }
      }
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
    },
    [remote]
  )

  const logout = useCallback(async () => {
    if (remote && supabase) {
      await supabase.auth.signOut()
      setRemoteUser(null)
      setUserId(null)
      return
    }
    setUserId(null)
  }, [remote])

  const updateAccentColor = useCallback(
    async (input) => {
      if (!userId) return { ok: false, error: 'Sem sessão.' }
      const clear = input === null || input === ''
      const normalized = clear ? null : normalizeAccentColor(input)
      if (!clear && !normalized) return { ok: false, error: 'Cor inválida.' }

      if (remote && supabase) {
        const { error } = await supabase
          .from('profiles')
          .update({
            accent_color: normalized,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
        if (error) return { ok: false, error: error.message || 'Erro ao guardar.' }
        setRemoteUser((u) => (u ? { ...u, accentColor: normalized } : u))
        return { ok: true }
      }

      const users = getUsers()
      const i = users.findIndex((u) => u.id === userId)
      if (i === -1) return { ok: false, error: 'Utilizador não encontrado.' }
      const next = { ...users[i] }
      if (normalized) next.accentColor = normalized
      else delete next.accentColor
      users[i] = next
      saveUsers(users)
      setLocalProfileTick((t) => t + 1)
      return { ok: true }
    },
    [remote, userId]
  )

  const value = useMemo(
    () => ({
      user,
      userId,
      login,
      register,
      logout,
      updateAccentColor,
      isAuthenticated: remote ? !!remoteUser : !!user,
      authReady,
      remoteCollab: remote,
    }),
    [user, userId, login, register, logout, updateAccentColor, remote, remoteUser, authReady]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API for this context module
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

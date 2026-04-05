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

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const remote = isRemoteCollab()
  const [userId, setUserId] = useState(() => (remote ? null : getSessionUserId()))
  const [remoteUser, setRemoteUser] = useState(null)
  const [authReady, setAuthReady] = useState(!remote)

  useEffect(() => {
    if (!remote) {
      setSessionUserId(userId)
    }
  }, [remote, userId])

  useEffect(() => {
    if (!remote) return

    let cancelled = false

    async function loadProfile(uid) {
      const { data } = await supabase.from('profiles').select('name').eq('id', uid).maybeSingle()
      if (cancelled) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setRemoteUser({
        id: user.id,
        email: user.email ?? '',
        name: data?.name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Usuário',
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
    const users = getUsers()
    return users.find((u) => u.id === userId) ?? null
  }, [remote, remoteUser, userId])

  const login = useCallback(
    async (email, password) => {
      if (remote) {
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
      if (remote) {
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
    if (remote) {
      await supabase.auth.signOut()
      setRemoteUser(null)
      setUserId(null)
      return
    }
    setUserId(null)
  }, [remote])

  const value = useMemo(
    () => ({
      user,
      userId,
      login,
      register,
      logout,
      isAuthenticated: remote ? !!remoteUser : !!user,
      authReady,
      remoteCollab: remote,
    }),
    [user, userId, login, register, logout, remote, remoteUser, authReady]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API for this context module
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

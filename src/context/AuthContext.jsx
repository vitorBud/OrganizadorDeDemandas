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
import {
  fetchMyProfileRow,
  updateProfileAccentColorRemote,
  upsertProfileNameRemote,
} from '../lib/profileRemote'
import { normalizeAccentColor } from '../lib/userColor'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  /** Modo Supabase só quando `createClient` foi possível (env no build). */
  const remote = isRemoteCollab()
  const [userId, setUserId] = useState(() => (remote ? null : getSessionUserId()))
  const [remoteUser, setRemoteUser] = useState(null)
  const [authReady, setAuthReady] = useState(!remote)
  const [localProfileTick, setLocalProfileTick] = useState(0)
  /** Incrementa quando há mudança remota em public.profiles (ex.: cor de outro utilizador). */
  const [profilesRemoteTick, setProfilesRemoteTick] = useState(0)

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
      try {
        data = await fetchMyProfileRow(uid)
      } catch (e) {
        console.warn('[OrgDemandas] Perfil:', e?.message || e)
      }
      if (cancelled) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const metadataName = String(user.user_metadata?.name ?? '').trim()
      const profileName = String(data?.name ?? '').trim()
      const emailName = String(user.email?.split('@')[0] ?? '').trim()
      const resolvedName = profileName || metadataName || emailName || 'Usuário'

      // Backfill para contas antigas com perfil sem nome visível.
      if (!profileName) {
        const r = await upsertProfileNameRemote(user.id, resolvedName)
        if (!r.ok) {
          console.warn('[OrgDemandas] Falha ao sincronizar nome do perfil:', r.error)
        }
      }

      setRemoteUser({
        id: user.id,
        email: user.email ?? '',
        name: resolvedName,
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

  useEffect(() => {
    if (!remote || !supabase || !userId) return
    const channel = supabase
      .channel('orgdemandas-profiles-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          setProfilesRemoteTick((t) => t + 1)
          const row = payload.new
          if (row?.id === userId) {
            setRemoteUser((u) =>
              u
                ? {
                    ...u,
                    name:
                      row.name != null && String(row.name).trim() !== ''
                        ? row.name
                        : u.name,
                    accentColor: normalizeAccentColor(row.accent_color) ?? null,
                  }
                : u
            )
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[OrgDemandas] Realtime (perfis):', status, err?.message ?? err ?? '')
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [remote, userId])

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
        const r = await updateProfileAccentColorRemote(userId, normalized)
        if (!r.ok) return { ok: false, error: r.error }
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

  const updatePassword = useCallback(
    async (password) => {
      if (!userId) return { ok: false, error: 'Sem sessão.' }
      const nextPassword = String(password ?? '')
      if (nextPassword.length < 6) {
        return { ok: false, error: 'Use uma senha com pelo menos 6 caracteres.' }
      }

      if (remote && supabase) {
        const { error } = await supabase.auth.updateUser({ password: nextPassword })
        if (error) return { ok: false, error: error.message || 'Não foi possível alterar a senha.' }
        return { ok: true }
      }

      const users = getUsers()
      const i = users.findIndex((u) => u.id === userId)
      if (i === -1) return { ok: false, error: 'Utilizador não encontrado.' }
      users[i] = { ...users[i], password: nextPassword }
      saveUsers(users)
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
      updatePassword,
      profilesRemoteTick,
      isAuthenticated: remote ? !!remoteUser : !!user,
      authReady,
      remoteCollab: remote,
    }),
    [
      user,
      userId,
      login,
      register,
      logout,
      updateAccentColor,
      updatePassword,
      profilesRemoteTick,
      remote,
      remoteUser,
      authReady,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth is the public API for this context module
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

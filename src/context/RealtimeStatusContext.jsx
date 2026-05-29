import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { isRemoteCollab } from '../lib/collabApi'

const RealtimeStatusContext = createContext(null)

/** Estado de rede do navegador; usado para diferenciar offline real de erro do Supabase. */
function browserOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/** Converte o estado técnico do canal em texto curto para a interface. */
function statusText(state) {
  if (state === 'connected') return 'Conectado'
  if (state === 'connecting') return 'Conectando'
  if (state === 'reconnecting') return 'Reconectando'
  if (state === 'offline') return 'Offline'
  if (state === 'error') return 'Instável'
  return 'Modo local'
}

/** Cria um retrato imutável do status atual da conexão. */
function nextSnapshot(state, detail, remote) {
  const now = Date.now()
  return {
    state,
    label: statusText(state),
    detail,
    remote,
    online: browserOnline(),
    lastChangedAt: now,
    lastEventAt: now,
  }
}

/**
 * Abre um canal Realtime leve só para descobrir se a conexão está saudável.
 * Esse provider não carrega dados do app; ele apenas informa conectado/reconectando/offline.
 */
export function RealtimeStatusProvider({ children }) {
  const [snapshot, setSnapshot] = useState(() =>
    nextSnapshot(
      isRemoteCollab() ? 'connecting' : 'local',
      isRemoteCollab() ? 'Abrindo canal Realtime.' : 'Supabase não configurado neste build.',
      isRemoteCollab()
    )
  )

  useEffect(() => {
    if (!isRemoteCollab() || !supabase) {
      return undefined
    }

    let alive = true
    let channel = null

    const setStatus = (state, detail) => {
      if (!alive) return
      setSnapshot(nextSnapshot(state, detail, true))
    }

    const removeChannel = () => {
      if (!channel) return
      const current = channel
      channel = null
      void supabase.removeChannel(current)
    }

    const subscribe = (state = 'connecting') => {
      if (!browserOnline()) {
        setStatus('offline', 'Navegador sem conexão com a internet.')
        return
      }
      // O nome aleatório evita reutilizar estado interno de canais antigos.
      setStatus(state, state === 'connecting' ? 'Abrindo canal Realtime.' : 'Tentando reconectar ao Realtime.')
      channel = supabase
        .channel(`orgdemandas-status:${Math.random().toString(36).slice(2)}`)
        .subscribe((status, err) => {
          if (!alive) return
          if (!browserOnline()) {
            setStatus('offline', 'Navegador sem conexão com a internet.')
            return
          }
          if (status === 'SUBSCRIBED') {
            setStatus('connected', 'Realtime conectado.')
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setStatus('reconnecting', err?.message || 'Canal Realtime instável.')
            return
          }
          if (status === 'CLOSED') {
            setStatus('reconnecting', 'Canal Realtime fechado.')
          }
        })
    }

    const handleOnline = () => {
      removeChannel()
      subscribe('reconnecting')
    }

    const handleOffline = () => {
      setStatus('offline', 'Navegador sem conexão com a internet.')
    }

    subscribe()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      alive = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      removeChannel()
    }
  }, [])

  const value = useMemo(() => snapshot, [snapshot])

  return <RealtimeStatusContext.Provider value={value}>{children}</RealtimeStatusContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- public hook for connection UI
export function useRealtimeStatus() {
  const ctx = useContext(RealtimeStatusContext)
  if (!ctx) {
    return nextSnapshot('local', 'Status indisponível fora da área logada.', false)
  }
  return ctx
}

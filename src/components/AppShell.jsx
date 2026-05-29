import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { isRemoteCollab } from '../lib/collabApi'
import { listMyNotifications, markNotificationsRead, subscribeNotificationChannel } from '../lib/tasksApi'
import { accentColorForDisplay } from '../lib/userColor'
import './AppShell.css'

export function AppShell() {
  const { user, userId, logout } = useAuth()
  const { preference, setPreference, effective } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const remote = isRemoteCollab()
  const [notifs, setNotifs] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  const wideLayout = location.pathname.includes('/projeto/')

  const refreshNotifs = useCallback(async () => {
    if (!remote || !userId) return
    try {
      const list = await listMyNotifications(userId)
      setNotifs(list)
    } catch (e) {
      console.warn(e)
    }
  }, [remote, userId])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshNotifs()
    })
  }, [refreshNotifs])

  useEffect(() => {
    if (!remote || !userId) return
    return subscribeNotificationChannel(userId, () => {
      void refreshNotifs()
    })
  }, [remote, userId, refreshNotifs])

  useEffect(() => {
    if (!notifOpen) return
    const onDoc = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen])

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  const unread = notifs.filter((n) => !n.readAt).length

  async function toggleNotifs() {
    const willOpen = !notifOpen
    setNotifOpen(willOpen)
    if (!willOpen || !userId) return
    const ids = notifs.filter((n) => !n.readAt).map((n) => n.id)
    if (ids.length === 0) return
    try {
      await markNotificationsRead(userId, ids)
      await refreshNotifs()
    } catch (e) {
      console.warn(e)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link to="/" className="app-shell__brand">
          OrgDemandas
        </Link>
        <nav className="app-shell__nav" aria-label="Principal">
          <NavLink
            to="/app"
            end
            className={({ isActive }) =>
              `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
            }
          >
            Projetos
          </NavLink>
          <NavLink
            to="/app/dashboard"
            className={({ isActive }) =>
              `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/app/perfil"
            className={({ isActive }) =>
              `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
            }
          >
            Configurações
          </NavLink>
        </nav>
        <div className="app-shell__actions">
          {remote ? (
            <div className="app-shell__notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="btn btn--ghost btn--sm app-shell__notif-btn"
                aria-expanded={notifOpen}
                onClick={() => void toggleNotifs()}
              >
                Notificações{unread > 0 ? ` (${unread})` : ''}
              </button>
              {notifOpen ? (
                <div className="app-shell__notif-panel" role="menu">
                  {notifs.length === 0 ? (
                    <p className="app-shell__notif-empty">Nada novo por aqui.</p>
                  ) : (
                    <ul className="app-shell__notif-list">
                      {notifs.map((n) => (
                        <li key={n.id} className={n.readAt ? 'app-shell__notif-item' : 'app-shell__notif-item app-shell__notif-item--unread'}>
                          <strong>{n.title}</strong>
                          <span>{n.body}</span>
                          {n.taskId ? (
                            <Link
                              to={`/app/projeto/${n.projectId}?task=${encodeURIComponent(n.taskId)}`}
                              className="app-shell__notif-link"
                              onClick={() => setNotifOpen(false)}
                            >
                              Abrir tarefa
                            </Link>
                          ) : null}
                          <time dateTime={new Date(n.createdAt).toISOString()}>
                            {new Date(n.createdAt).toLocaleString()}
                          </time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="app-shell__theme">
            <span className="visually-hidden">Tema</span>
            <select
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              className="app-shell__theme-select"
              aria-label="Tema da interface"
            >
              <option value="system">Sistema ({effective === 'dark' ? 'escuro' : 'claro'})</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>

          <span
            className="app-shell__user"
            style={
              user?.id
                ? { color: accentColorForDisplay(user.accentColor, user.id) }
                : undefined
            }
          >
            {user?.name}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleLogout()}>
            Sair
          </button>
        </div>
      </header>
      <div className={`app-shell__body${wideLayout ? ' app-shell__body--wide' : ''}`}>
        <Outlet />
      </div>
    </div>
  )
}

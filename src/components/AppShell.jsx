import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  Settings,
  Sparkles,
  UserCircle,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useRealtimeStatus } from '../context/RealtimeStatusContext'
import { isRemoteCollab } from '../lib/collabApi'
import { THEME_APPEARANCE_PRESETS } from '../lib/themeAppearance'
import { listMyNotifications, markNotificationsRead, subscribeNotificationChannel } from '../lib/tasksApi'
import { accentColorForDisplay } from '../lib/userColor'
import './AppShell.css'

/**
 * Layout principal da área logada: header, navegação, status, notificações e conteúdo das rotas filhas.
 */
export function AppShell() {
  const { user, userId, logout } = useAuth()
  const { preference, setPreference, effective, appearance, setAppearance } = useTheme()
  const realtimeStatus = useRealtimeStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const remote = isRemoteCollab()
  const [notifs, setNotifs] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const notifRef = useRef(null)
  const accountRef = useRef(null)

  const wideLayout = location.pathname.includes('/projeto/')

  const refreshNotifs = useCallback(async () => {
    // Notificações só existem no modo Supabase.
    if (!remote || !userId) return
    try {
      const list = await listMyNotifications(userId)
      setNotifs(list)
    } catch (e) {
      console.warn(e)
    }
  }, [remote, userId])

  useEffect(() => {
    // Primeira carga das notificações depois que o shell monta.
    queueMicrotask(() => {
      void refreshNotifs()
    })
  }, [refreshNotifs])

  useEffect(() => {
    if (!remote || !userId) return
    // Mantém o menu de notificações atualizado quando o banco emite mudança.
    return subscribeNotificationChannel(userId, () => {
      void refreshNotifs()
    })
  }, [remote, userId, refreshNotifs])

  useEffect(() => {
    if (!notifOpen && !accountOpen) return
    // Fecha painéis ao clicar fora deles.
    const onDoc = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen, accountOpen])

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  const unread = notifs.filter((n) => !n.readAt).length
  const pageTitle = location.pathname.includes('/dashboard')
    ? 'Dashboard'
    : location.pathname.includes('/perfil')
      ? 'Configurações'
      : location.pathname.includes('/status')
        ? 'Conexão'
        : location.pathname.includes('/projeto/')
          ? 'Projeto'
          : 'Projetos'

  async function toggleNotifs() {
    // Ao abrir, marca as notificações não lidas como lidas.
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
      <aside className="app-shell__sidebar">
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
            <FolderKanban size={16} strokeWidth={2.1} aria-hidden />
            <span>Projetos</span>
          </NavLink>
          <NavLink
            to="/app/dashboard"
            className={({ isActive }) =>
              `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
            }
          >
            <LayoutDashboard size={16} strokeWidth={2.1} aria-hidden />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/app/perfil"
            className={({ isActive }) =>
              `app-shell__nav-link${isActive ? ' app-shell__nav-link--active' : ''}`
            }
          >
            <Settings size={16} strokeWidth={2.1} aria-hidden />
            <span>Configurações</span>
          </NavLink>
        </nav>
        <div className="app-shell__sidebar-foot">
          <Link
            to="/app/status"
            className={`app-shell__connection app-shell__connection--${realtimeStatus.state}`}
            title={realtimeStatus.detail}
          >
            <span className="app-shell__connection-dot" aria-hidden />
            <span>{realtimeStatus.label}</span>
          </Link>
        </div>
      </aside>

      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <p className="app-shell__section-title">{pageTitle}</p>
          <div id="app-shell-project-tools" className="app-shell__project-tools" />
          <div className="app-shell__actions">
            {remote ? (
              <div className="app-shell__notif-wrap" ref={notifRef}>
                <button
                  type="button"
                  className="app-shell__icon-btn"
                  aria-expanded={notifOpen}
                  aria-label="Notificações"
                  title="Notificações"
                  onClick={() => void toggleNotifs()}
                >
                  <Bell size={17} strokeWidth={2.1} aria-hidden />
                  {unread > 0 ? <span className="app-shell__badge">{unread}</span> : null}
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

            <div className="app-shell__account" ref={accountRef}>
              <button
                type="button"
                className="app-shell__account-btn"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((v) => !v)}
              >
                <UserCircle size={18} strokeWidth={2.1} aria-hidden />
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
                <ChevronDown size={15} strokeWidth={2.1} aria-hidden />
              </button>

              {accountOpen ? (
                <div className="app-shell__account-panel" role="menu">
                  <Link to="/app/status" className="app-shell__account-link" onClick={() => setAccountOpen(false)}>
                    <Wifi size={16} strokeWidth={2.1} aria-hidden />
                    <span>Status: {realtimeStatus.label}</span>
                  </Link>
                  <Link to="/app/perfil" className="app-shell__account-link" onClick={() => setAccountOpen(false)}>
                    <Settings size={16} strokeWidth={2.1} aria-hidden />
                    <span>Configurações</span>
                  </Link>
                  <label className="app-shell__theme">
                    <MonitorCog size={16} strokeWidth={2.1} aria-hidden />
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
                  <label className="app-shell__theme">
                    <Sparkles size={16} strokeWidth={2.1} aria-hidden />
                    <span className="visually-hidden">Estilo visual</span>
                    <select
                      value={appearance}
                      onChange={(e) => setAppearance(e.target.value)}
                      className="app-shell__theme-select"
                      aria-label="Estilo visual"
                    >
                      {THEME_APPEARANCE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="app-shell__account-link" onClick={() => void handleLogout()}>
                    <LogOut size={16} strokeWidth={2.1} aria-hidden />
                    <span>Sair</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className={`app-shell__body${wideLayout ? ' app-shell__body--wide' : ''}`}>
          <Suspense fallback={<div className="app-shell__route-loading">Carregando…</div>}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

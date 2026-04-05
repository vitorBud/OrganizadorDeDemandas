import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AppShell.css'

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link to="/app" className="app-shell__brand">
          OrgDemandas
        </Link>
        <div className="app-shell__actions">
          <span className="app-shell__user">{user?.name}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleLogout()}>
            Sair
          </button>
        </div>
      </header>
      <div className="app-shell__body">
        <Outlet />
      </div>
    </div>
  )
}

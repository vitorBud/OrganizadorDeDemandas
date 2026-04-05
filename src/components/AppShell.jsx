import { Link, Outlet, useNavigate } from 'react-router-dom'
import { LiquidButton } from '@/components/ui/liquid-glass-button'
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
          <LiquidButton
            type="button"
            size="sm"
            variant="outline"
            className="!border-border !bg-background/80 !text-foreground"
            onClick={() => void handleLogout()}
          >
            Sair
          </LiquidButton>
        </div>
      </header>
      <div className="app-shell__body">
        <Outlet />
      </div>
    </div>
  )
}

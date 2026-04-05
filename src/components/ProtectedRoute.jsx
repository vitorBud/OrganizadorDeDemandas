import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, authReady, remoteCollab } = useAuth()
  const location = useLocation()

  if (remoteCollab && !authReady) {
    return (
      <div className="auth-page__main" style={{ minHeight: '40vh' }}>
        <p>Carregando sessão…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

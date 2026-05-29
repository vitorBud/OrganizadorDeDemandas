import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { PublicHeader } from '../components/PublicHeader'
import { useAuth } from '../context/AuthContext'
import './AuthForm.css'

export function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, from, navigate])

  if (isAuthenticated) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const result = await login(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="auth-page">
      <PublicHeader />
      <main className="auth-page__main">
        <div className="auth-card">
          <h1 className="auth-card__title">Entrar</h1>
          <p className="auth-card__subtitle">
            Acesse sua área de trabalho e seus projetos.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            {error ? <p className="auth-form__error">{error}</p> : null}
            <label className="auth-form__label">
              E-mail
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-form__input"
              />
            </label>
            <label className="auth-form__label">
              Senha
              <span className="auth-form__password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-form__input auth-form__input--password"
                />
                <button
                  type="button"
                  className="auth-form__password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <button type="submit" className="btn btn--primary auth-form__submit">
              Entrar
            </button>
          </form>
          <p className="auth-card__footer">
            Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
          </p>
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { PublicHeader } from '../components/PublicHeader'
import { useAuth } from '../context/AuthContext'
import './AuthForm.css'

export function Register() {
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/app', { replace: true })
  }, [isAuthenticated, navigate])

  if (isAuthenticated) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 6) {
      setError('Use uma senha com pelo menos 6 caracteres.')
      return
    }
    const result = await register(name, email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.needsEmailConfirm) {
      setInfo(result.message || 'Verifique seu e-mail para confirmar a conta.')
      return
    }
    navigate('/app', { replace: true })
  }

  return (
    <div className="auth-page">
      <PublicHeader />
      <main className="auth-page__main">
        <div className="auth-card">
          <h1 className="auth-card__title">Cadastrar</h1>
          <p className="auth-card__subtitle">
            Crie sua conta para organizar demandas e convidar colegas por código.
          </p>
          <form onSubmit={handleSubmit} className="auth-form">
            {error ? <p className="auth-form__error">{error}</p> : null}
            {info ? (
              <p className="auth-form__error" style={{ background: 'var(--accent-bg)', color: 'var(--text-h)' }}>
                {info}
              </p>
            ) : null}
            <label className="auth-form__label">
              Nome
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="auth-form__input"
              />
            </label>
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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
              Criar conta
            </button>
          </form>
          <p className="auth-card__footer">
            Já tem conta? <Link to="/login">Entrar</Link>
          </p>
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import { useAuth } from '../context/AuthContext'
import './AuthForm.css'

export function Register() {
  const { register, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) navigate('/app', { replace: true })
  }, [isAuthenticated, navigate])

  if (isAuthenticated) return null

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 4) {
      setError('Use uma senha com pelo menos 4 caracteres.')
      return
    }
    const result = register(name, email, password)
    if (!result.ok) {
      setError(result.error)
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
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
                className="auth-form__input"
              />
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

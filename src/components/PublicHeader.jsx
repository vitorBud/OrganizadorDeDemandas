import { Link } from 'react-router-dom'
import './PublicHeader.css'

/** Header simples usado nas páginas públicas, antes do usuário entrar no app. */
export function PublicHeader() {
  return (
    <header className="public-header">
      <Link to="/" className="public-header__brand">
        OrgDemandas
      </Link>
      <nav className="public-header__nav" aria-label="Conta">
        <Link to="/login" className="btn btn--ghost btn--header">
          Entrar
        </Link>
        <Link to="/cadastro" className="btn btn--primary btn--header">
          Cadastrar
        </Link>
      </nav>
    </header>
  )
}

import { Link } from 'react-router-dom'
import './PublicHeader.css'

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link to="/" className="public-header__brand">
        OrgDemandas
      </Link>
      <nav className="public-header__nav">
        <Link to="/login" className="btn btn--ghost">
          Entrar
        </Link>
        <Link to="/cadastro" className="btn btn--primary">
          Cadastrar
        </Link>
      </nav>
    </header>
  )
}

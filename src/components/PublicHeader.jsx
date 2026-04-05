import { Link, useNavigate } from 'react-router-dom'
import { LiquidButton } from '@/components/ui/liquid-glass-button'
import './PublicHeader.css'

export function PublicHeader() {
  const navigate = useNavigate()

  return (
    <header className="public-header">
      <Link to="/" className="public-header__brand">
        OrgDemandas
      </Link>
      <nav className="public-header__nav" aria-label="Conta">
        <LiquidButton
          type="button"
          size="sm"
          variant="outline"
          className="public-header__glass !border-border !bg-background/80 !text-foreground shadow-sm"
          onClick={() => navigate('/login')}
        >
          Entrar
        </LiquidButton>
        <LiquidButton
          type="button"
          size="sm"
          className="public-header__glass !min-w-[7.5rem] !border-primary/30 !bg-primary/90 !text-primary-foreground"
          onClick={() => navigate('/cadastro')}
        >
          Cadastrar
        </LiquidButton>
      </nav>
    </header>
  )
}

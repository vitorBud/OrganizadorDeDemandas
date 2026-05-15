import { Link } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import './Landing.css'

export function Landing() {
  return (
    <div className="landing">
      <PublicHeader />
      <main className="landing__main">
        <section className="landing__hero">
          <p className="landing__badge">Kanban · tempo real · equipes</p>
          <h1 className="landing__title">Demandas claras. Time alinhado. Menos ruído.</h1>
          <p className="landing__lead">
            Projetos com código de sala, quadro Kanban com prazos e responsáveis, mural de avisos e
            chat no mesmo lugar — o fluxo que você esperaria de uma ferramenta profissional, sem
            excesso de complexidade.
          </p>
          <div className="landing__cta">
            <Link to="/cadastro" className="btn btn--primary btn--lg">
              Criar conta
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              Entrar
            </Link>
          </div>
        </section>

        <section className="landing__features" aria-label="Resumo">
          <h2 className="landing__features-title">Em poucas palavras</h2>
          <ul className="landing__list">
            <li>
              <span className="landing__bullet" aria-hidden />
              Sala por código — compartilhe o código com quem for trabalhar contigo no projeto.
            </li>
            <li>
              <span className="landing__bullet" aria-hidden />
              Mural do grupo — publique avisos e decisões; edite quando precisar atualizar o time.
            </li>
            <li>
              <span className="landing__bullet" aria-hidden />
              Chat no mesmo lugar — alinhamento rápido sem sair do quadro.
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}

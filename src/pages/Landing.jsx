import { Link } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import './Landing.css'

export function Landing() {
  return (
    <div className="landing">
      <PublicHeader />
      <main className="landing__main">
        <section className="landing__hero">
          <h1 className="landing__title">Um quadro para demandas e conversa com o time</h1>
          <p className="landing__lead">
            Você cria um projeto, recebe um código e quem precisar entra no mesmo painel:
            blocos de texto, imagem ou código, mais um chat que fica junto — sem troca de aba
            nem planilha solta.
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
              Quadro simples — blocos que você adiciona e reorganiza conforme a demanda muda.
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

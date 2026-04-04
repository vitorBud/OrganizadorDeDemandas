import { Link } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import './Landing.css'

export function Landing() {
  return (
    <div className="landing">
      <PublicHeader />
      <main className="landing__main">
        <section className="landing__hero">
          <p className="landing__eyebrow">Organização de demandas no trabalho</p>
          <h1 className="landing__title">
            Centralize tarefas, anotações e conversas com sua equipe
          </h1>
          <p className="landing__lead">
            O OrgDemandas é um espaço online para organizar as demandas do dia a dia
            profissional: crie projetos, compartilhe um código de entrada com colegas e
            editem juntos blocos de texto, imagens e trechos de código — com chat integrado
            para alinhar tudo em tempo real no mesmo painel.
          </p>
          <div className="landing__cta">
            <Link to="/cadastro" className="btn btn--primary btn--lg">
              Criar conta grátis
            </Link>
            <Link to="/login" className="btn btn--ghost btn--lg">
              Já tenho conta
            </Link>
          </div>
        </section>

        <section className="landing__features">
          <article className="landing__card">
            <h2>Projetos com código</h2>
            <p>
              Crie um projeto e receba um código. Quem tiver o código entra no mesmo
              ambiente e vê as mesmas atualizações que você.
            </p>
          </article>
          <article className="landing__card">
            <h2>Blocos flexíveis</h2>
            <p>
              Texto com alinhamento e tamanho, imagens e blocos de código com destaque
              de sintaxe visual — adicione ou remova blocos quando precisar.
            </p>
          </article>
          <article className="landing__card">
            <h2>Chat no projeto</h2>
            <p>
              Comunique-se com quem está no projeto sem sair da página: mensagens ficam
              salvas junto ao quadro de demandas.
            </p>
          </article>
        </section>
      </main>
    </div>
  )
}

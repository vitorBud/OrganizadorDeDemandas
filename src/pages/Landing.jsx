import { useNavigate } from 'react-router-dom'
import { LiquidButton } from '@/components/ui/liquid-glass-button'
import { PublicHeader } from '../components/PublicHeader'
import './Landing.css'

export function Landing() {
  const navigate = useNavigate()

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

          <div className="landing__cta landing__cta--primary">
            <LiquidButton
              type="button"
              size="xl"
              className="landing__liquid-main !border-primary/40 !bg-primary/15 !text-foreground shadow-md"
              onClick={() => navigate('/login')}
            >
              Entrar na minha conta
            </LiquidButton>
          </div>

          <div className="landing__cta">
            <LiquidButton
              type="button"
              size="lg"
              className="!min-w-[11rem] !border-primary/35 !bg-primary !text-primary-foreground"
              onClick={() => navigate('/cadastro')}
            >
              Criar conta grátis
            </LiquidButton>
            <LiquidButton
              type="button"
              size="lg"
              variant="outline"
              className="!min-w-[11rem] !border-border !bg-background/70 !text-foreground"
              onClick={() => navigate('/demo/liquid')}
            >
              Ver demo glass
            </LiquidButton>
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

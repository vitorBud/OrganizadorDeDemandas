import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LiquidButton } from '@/components/ui/liquid-glass-button'
import { useAuth } from '../context/AuthContext'
import {
  createProjectRemote,
  isRemoteCollab,
  joinProjectByCode,
  listProjects,
} from '../lib/collabApi'
import './Workspace.css'

export function Workspace() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const remote = isRemoteCollab()

  const refresh = useCallback(async () => {
    if (!userId) return
    try {
      const list = await listProjects(userId)
      setProjects(list)
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Erro ao carregar projetos.')
    }
  }, [userId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      await refresh()
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  const sorted = useMemo(
    () => [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [projects]
  )

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    const name = newName.trim()
    if (!name) {
      setError('Digite um nome para o projeto.')
      return
    }
    try {
      const project = await createProjectRemote(userId, name)
      setNewName('')
      await refresh()
      navigate(`/app/projeto/${project.id}`)
    } catch (err) {
      setError(err?.message || 'Não foi possível criar o projeto.')
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) {
      setError('Informe o código de entrada.')
      return
    }
    try {
      const project = await joinProjectByCode(userId, code)
      setJoinCode('')
      await refresh()
      navigate(`/app/projeto/${project.id}`)
    } catch (err) {
      setError(err?.message || 'Não foi possível entrar com esse código.')
    }
  }

  return (
    <div className="workspace">
      <h1 className="workspace__title">Área de trabalho</h1>
      <p className="workspace__intro">
        {remote ? (
          <>
            Crie uma sala ou entre com o <strong>código</strong> que o colega passou. Com o Supabase
            ativo, várias pessoas editam o mesmo quadro e o chat em <strong>tempo real</strong>{' '}
            (ative Realtime nas tabelas <code>blocks</code> e <code>messages</code> no painel).
          </>
        ) : (
          <>
            Modo <strong>local</strong> (sem variáveis do Supabase): dados só neste navegador. Para
            sala compartilhada de verdade, configure <code>VITE_SUPABASE_URL</code> e{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> e rode o SQL em <code>supabase/collab_setup.sql</code>.
          </>
        )}
      </p>

      {error ? <p className="workspace__error">{error}</p> : null}

      <div className="workspace__grid">
        <section className="workspace__panel">
          <h2>Novo projeto</h2>
          <form onSubmit={handleCreate} className="workspace__form">
            <label>
              Nome do projeto
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Sprint marketing"
                className="workspace__input"
              />
            </label>
            <LiquidButton
              type="submit"
              size="default"
              className="!border-primary/35 !bg-primary !text-primary-foreground"
              disabled={loading}
            >
              Criar e abrir
            </LiquidButton>
          </form>
        </section>

        <section className="workspace__panel">
          <h2>Entrar com código</h2>
          <form onSubmit={handleJoin} className="workspace__form">
            <label>
              Código de entrada
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Ex.: ABC123"
                className="workspace__input workspace__input--code"
                maxLength={8}
              />
            </label>
            <LiquidButton
              type="submit"
              size="default"
              className="!border-primary/35 !bg-primary !text-primary-foreground"
              disabled={loading}
            >
              Entrar na sala
            </LiquidButton>
          </form>
        </section>
      </div>

      <section className="workspace__list-section">
        <h2>Meus projetos</h2>
        {loading ? (
          <p className="workspace__empty">Carregando…</p>
        ) : sorted.length === 0 ? (
          <p className="workspace__empty">Nenhum projeto ainda. Crie um ou entre com um código.</p>
        ) : (
          <ul className="workspace__list">
            {sorted.map((p) => (
              <li key={p.id}>
                <Link to={`/app/projeto/${p.id}`} className="workspace__link">
                  <span className="workspace__link-name">{p.name}</span>
                  <span className="workspace__link-code">Código: {p.joinCode}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

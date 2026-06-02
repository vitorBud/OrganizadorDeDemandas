import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getProjectIfMember,
  isRemoteCollab,
  persistProjectState,
  leaveProject,
  deleteProject,
  removeProjectMember,
  sendMessageRemote,
  subscribeProjectChannels,
} from '../lib/collabApi'
import { REMOTE_POLL_INTERVAL_MS } from '../lib/remoteSync'
import { accentColorForDisplay } from '../lib/userColor'
import { listProjectMembers } from '../lib/tasksApi'
import { KanbanBoard } from '../components/KanbanBoard'
import { ProjectPosts } from '../components/ProjectPosts'
import './ProjectBoard.css'

/**
 * Tela de um projeto aberto.
 * Ela coordena Kanban, mural, chat, membros e sincronização Realtime da sala.
 */
export function ProjectBoard() {
  const { projectId } = useParams()
  const { user, userId, profilesRemoteTick } = useAuth()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [chatDraft, setChatDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const lastWriteRef = useRef(0)
  const projectRef = useRef(null)
  const pollBusyRef = useRef(false)
  const postsEditingRef = useRef(false)
  const remote = isRemoteCollab()
  const [params, setParams] = useSearchParams()
  const [workspaceTab, setWorkspaceTab] = useState('demandas')
  const [members, setMembers] = useState([])
  const [groupActionBusy, setGroupActionBusy] = useState(false)
  const [groupError, setGroupError] = useState('')
  const openTaskId = params.get('task')

  const setOpenTaskId = useCallback(
    (id) => {
      // A tarefa aberta fica na URL para permitir compartilhar link direto.
      const next = new URLSearchParams(params)
      if (id) next.set('task', id)
      else next.delete('task')
      setParams(next, { replace: true })
    },
    [params, setParams]
  )

  const displayTab = openTaskId ? 'demandas' : workspaceTab

  useEffect(() => {
    // Ref mantém a versão atual do projeto disponível sem disparar render.
    projectRef.current = project
  }, [project])

  const reload = useCallback(async () => {
    // Recarrega o projeto validando se o usuário ainda é membro.
    if (!projectId || !userId) return
    const p = await getProjectIfMember(projectId, userId)
    if (!p) {
      navigate('/app', { replace: true })
      return
    }
    setProject(p)
  }, [projectId, userId, navigate])

  useEffect(() => {
    // Carga inicial da sala.
    if (!projectId || !userId) {
      navigate('/app', { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      const p = await getProjectIfMember(projectId, userId)
      if (cancelled) return
      if (!p) {
        navigate('/app', { replace: true })
        return
      }
      setProject(p)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, userId, navigate])

  useEffect(() => {
    if (!remote || !projectId) return
    // Realtime atualiza chat/mural/projeto, com cuidados para não sobrescrever edição em andamento.
    return subscribeProjectChannels(projectId, (payload) => {
      if (payload?.blocks && postsEditingRef.current && displayTab === 'mural') {
        return
      }
      if (payload?.messages) {
        void reload()
        return
      }
      if (Date.now() - lastWriteRef.current < 780) return
      void reload()
    })
  }, [remote, projectId, reload, displayTab])

  useEffect(() => {
    if (!remote || !projectId || !userId) return
    // Polling de segurança quando Realtime atrasa ou o navegador volta a ficar visível.
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (postsEditingRef.current && displayTab === 'mural') return
      if (pollBusyRef.current) return
      pollBusyRef.current = true
      void reload().finally(() => {
        pollBusyRef.current = false
      })
    }
    const id = setInterval(tick, REMOTE_POLL_INTERVAL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [remote, projectId, userId, reload, displayTab])

  useEffect(() => {
    if (profilesRemoteTick === 0) return
    if (!remote || !projectId || !userId) return
    queueMicrotask(() => {
      void reload()
    })
  }, [profilesRemoteTick, remote, projectId, userId, reload])

  useEffect(() => {
    if (!projectId || !userId) return
    // Lista de membros alimenta filtros, gerenciamento do grupo e autores do mural.
    let alive = true
    ;(async () => {
      try {
        const list = await listProjectMembers(projectId, userId)
        if (alive) setMembers(list)
      } catch (e) {
        if (alive) setGroupError(e?.message || 'Erro ao carregar membros do grupo.')
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId, userId, profilesRemoteTick])

  const persistBlocks = useCallback(
    async (blocks) => {
      // Usado pelo mural para salvar a nova lista de blocos.
      if (!projectId) return
      try {
        lastWriteRef.current = Date.now()
        await persistProjectState(projectId, { blocks })
      } catch (e) {
        console.error(e)
        throw e
      }
    },
    [projectId]
  )

  const handlePostsEditingChange = useCallback((editing) => {
    // Enquanto edita post, pausamos reloads de blocks para preservar o formulário.
    postsEditingRef.current = editing
  }, [])

  const sendChat = async (e) => {
    // Chat é append-only: envia uma mensagem nova e recarrega a lista.
    e.preventDefault()
    const text = chatDraft.trim()
    if (!text || !user || !projectId) return
    try {
      await sendMessageRemote(projectId, {
        userId,
        userName: user.name,
        accentColor: accentColorForDisplay(user?.accentColor, userId),
        text,
      })
      setChatDraft('')
      await reload()
    } catch (err) {
      console.error(err)
    }
  }

  const copyCode = () => {
    if (!project?.joinCode) return
    navigator.clipboard.writeText(project.joinCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleLeaveGroup = async () => {
    if (!project || !userId) return
    if (project.ownerId === userId) {
      setGroupError('Você é líder deste grupo. Use "Excluir grupo".')
      return
    }
    if (!window.confirm('Sair deste grupo? Você perderá acesso ao quadro.')) return
    setGroupActionBusy(true)
    setGroupError('')
    try {
      await leaveProject(project.id, userId)
      navigate('/app', { replace: true })
    } catch (e) {
      setGroupError(e?.message || 'Não foi possível sair do grupo.')
    } finally {
      setGroupActionBusy(false)
    }
  }

  const handleDeleteGroup = async () => {
    if (!project || !userId) return
    if (project.ownerId !== userId) {
      setGroupError('Somente o líder pode excluir o grupo.')
      return
    }
    if (!window.confirm('Excluir este grupo permanentemente? Esta ação não pode ser desfeita.')) return
    setGroupActionBusy(true)
    setGroupError('')
    try {
      await deleteProject(project.id, userId)
      navigate('/app', { replace: true })
    } catch (e) {
      setGroupError(e?.message || 'Não foi possível excluir o grupo.')
    } finally {
      setGroupActionBusy(false)
    }
  }

  const handleKickMember = async (targetUserId, targetName) => {
    if (!project || !userId) return
    if (!window.confirm(`Expulsar ${targetName} do grupo?`)) return
    setGroupActionBusy(true)
    setGroupError('')
    try {
      await removeProjectMember(project.id, userId, targetUserId)
      const list = await listProjectMembers(project.id, userId)
      setMembers(list)
      await reload()
    } catch (e) {
      setGroupError(e?.message || 'Não foi possível expulsar o membro.')
    } finally {
      setGroupActionBusy(false)
    }
  }

  const messages = useMemo(
    () => [...(project?.messages || [])].sort((a, b) => a.createdAt - b.createdAt),
    [project]
  )

  const messagesListRef = useRef(null)

  const chatScrollSig = useMemo(() => {
    // Assinatura muda somente quando chega nova mensagem; usada para rolar ao final.
    const arr = project?.messages ?? []
    if (!arr.length) return '0'
    const sorted = [...arr].sort((a, b) => a.createdAt - b.createdAt)
    const last = sorted[sorted.length - 1]
    return `${sorted.length}:${last.id}`
  }, [project])

  useLayoutEffect(() => {
    const el = messagesListRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
  }, [chatScrollSig])

  if (!project) {
    return (
      <div className="project-board project-board--loading">
        <p>Carregando…</p>
      </div>
    )
  }

  return (
    <div className="project-board">
      {remote ? (
        <p className="project-board__live-banner">
          Sala online: alterações e chat sincronizam entre quem está com o mesmo código (Realtime
          ligado no Supabase).
        </p>
      ) : null}

      <div className="project-board__top">
        <Link to="/app" className="project-board__back">
          ← Área de trabalho
        </Link>
        <div className="project-board__head">
          <h1 className="project-board__title">{project.name}</h1>
          <details className="project-board__options">
            <summary>Opções do grupo</summary>
            <div className="project-board__options-panel">
              <div className="project-board__code-row">
                <span className="project-board__code-label">Código da sala</span>
                <code className="project-board__code">{project.joinCode}</code>
                <button type="button" className="btn btn--ghost btn--sm" onClick={copyCode}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <div className="project-board__group-menu">
                {project.ownerId === userId ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    onClick={() => void handleDeleteGroup()}
                    disabled={groupActionBusy}
                  >
                    Excluir grupo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void handleLeaveGroup()}
                    disabled={groupActionBusy}
                  >
                    Sair do grupo
                  </button>
                )}
              </div>
              {groupError ? <p className="project-board__group-error">{groupError}</p> : null}
              {project.ownerId === userId && members.length > 1 ? (
                <div className="project-board__members">
                  <p className="project-board__members-title">Gerenciar membros</p>
                  <ul className="project-board__members-list">
                    {members
                      .filter((m) => m.id !== userId)
                      .map((m) => (
                        <li key={m.id} className="project-board__member-item">
                          <span>{m.name}</span>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm btn--danger"
                            onClick={() => void handleKickMember(m.id, m.name)}
                            disabled={groupActionBusy}
                          >
                            Expulsar
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <div className="project-board__tabs" role="tablist" aria-label="Visualização do projeto">
        <button
          type="button"
          role="tab"
          aria-selected={displayTab === 'demandas'}
          className={`project-board__tab${displayTab === 'demandas' ? ' project-board__tab--active' : ''}`}
          onClick={() => setWorkspaceTab('demandas')}
        >
          Demandas (Kanban)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={displayTab === 'mural'}
          className={`project-board__tab${displayTab === 'mural' ? ' project-board__tab--active' : ''}`}
          onClick={() => {
            setWorkspaceTab('mural')
            if (openTaskId) {
              const next = new URLSearchParams(params)
              next.delete('task')
              setParams(next, { replace: true })
            }
          }}
        >
          Mural
        </button>
      </div>

      <div className="project-board__layout">
        <div className="project-board__main">
          {displayTab === 'demandas' ? (
            <KanbanBoard
              projectId={projectId}
              user={user}
              openTaskId={openTaskId}
              onOpenTaskId={setOpenTaskId}
            />
          ) : (
            <ProjectPosts
              blocks={project.blocks ?? []}
              members={members}
              user={user}
              userId={userId}
              ownerId={project.ownerId}
              onBlocksChange={(blocks) => setProject((prev) => (prev ? { ...prev, blocks } : prev))}
              onPersist={persistBlocks}
              onEditingChange={handlePostsEditingChange}
            />
          )}
        </div>

        <aside className="project-board__chat" aria-label="Chat do projeto">
          <h2 className="project-board__chat-title">Chat</h2>
          <ul ref={messagesListRef} className="project-board__messages">
            {messages.map((m) => (
              <li key={m.id} className="project-board__msg">
                <span
                  className="project-board__msg-author"
                  style={{ color: accentColorForDisplay(m.userAccentColor, m.userId) }}
                >
                  {m.userName}
                </span>
                <span className="project-board__msg-text">{m.text}</span>
                <time className="project-board__msg-time" dateTime={new Date(m.createdAt).toISOString()}>
                  {new Date(m.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
          <form onSubmit={sendChat} className="project-board__chat-form">
            <textarea
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Mensagem para o time…"
              rows={2}
              className="project-board__chat-input"
            />
            <button type="submit" className="btn btn--primary btn--sm">
              Enviar
            </button>
          </form>
        </aside>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getProjectIfMember,
  isRemoteCollab,
  newRemoteId,
  persistProjectState,
  sendMessageRemote,
  subscribeProjectChannels,
} from '../lib/collabApi'
import { generateId } from '../lib/storage'
import { REMOTE_POLL_INTERVAL_MS } from '../lib/remoteSync'
import { accentColorForDisplay } from '../lib/userColor'
import { KanbanBoard } from '../components/KanbanBoard'
import './ProjectBoard.css'

const SAVE_DEBOUNCE_MS = 480

export function ProjectBoard() {
  const { projectId } = useParams()
  const { user, userId, profilesRemoteTick } = useAuth()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [chatDraft, setChatDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const debounceTimerRef = useRef(null)
  const lastWriteRef = useRef(0)
  const projectRef = useRef(null)
  const pollBusyRef = useRef(false)
  const remote = isRemoteCollab()
  const [params, setParams] = useSearchParams()
  const [workspaceTab, setWorkspaceTab] = useState('demandas')
  const openTaskId = params.get('task')

  const setOpenTaskId = useCallback(
    (id) => {
      const next = new URLSearchParams(params)
      if (id) next.set('task', id)
      else next.delete('task')
      setParams(next, { replace: true })
    },
    [params, setParams]
  )

  const displayTab = openTaskId ? 'demandas' : workspaceTab

  useEffect(() => {
    projectRef.current = project
  }, [project])

  const reload = useCallback(async () => {
    if (!projectId || !userId) return
    const p = await getProjectIfMember(projectId, userId)
    if (!p) {
      navigate('/app', { replace: true })
      return
    }
    setProject(p)
  }, [projectId, userId, navigate])

  useEffect(() => {
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
    return subscribeProjectChannels(projectId, (payload) => {
      if (payload?.messages) {
        void reload()
        return
      }
      if (Date.now() - lastWriteRef.current < 780) return
      void reload()
    })
  }, [remote, projectId, reload])

  useEffect(() => {
    if (!remote || !projectId || !userId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
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
  }, [remote, projectId, userId, reload])

  useEffect(() => {
    if (profilesRemoteTick === 0) return
    if (!remote || !projectId || !userId) return
    queueMicrotask(() => {
      void reload()
    })
  }, [profilesRemoteTick, remote, projectId, userId, reload])

  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    },
    []
  )

  const runSave = useCallback(
    async (blocks) => {
      if (!projectId) return
      try {
        lastWriteRef.current = Date.now()
        await persistProjectState(projectId, { blocks })
      } catch (e) {
        console.error(e)
      }
    },
    [projectId]
  )

  const scheduleSave = useCallback(
    (blocks) => {
      if (!remote) {
        void runSave(blocks)
        return
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        void runSave(blocks)
      }, SAVE_DEBOUNCE_MS)
    },
    [remote, runSave]
  )

  const flushSave = useCallback(
    async (blocks) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      await runSave(blocks)
    },
    [runSave]
  )

  const newBlockId = () => (remote ? newRemoteId() : generateId())

  const addBlock = (type) => {
    if (!project) return
    const id = newBlockId()
    const base = { id, type }
    if (type === 'text') Object.assign(base, { content: '', align: 'left', size: 'md' })
    if (type === 'image') Object.assign(base, { content: '' })
    if (type === 'code') Object.assign(base, { content: '', language: '' })
    const blocks = [...(project.blocks || []), base]
    setProject({ ...project, blocks })
    scheduleSave(blocks)
  }

  const updateBlock = (id, patch) => {
    if (!project) return
    const blocks = project.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    setProject({ ...project, blocks })
    scheduleSave(blocks)
  }

  const removeBlock = (id) => {
    if (!project) return
    const blocks = project.blocks.filter((b) => b.id !== id)
    setProject({ ...project, blocks })
    void flushSave(blocks)
  }

  const moveBlock = (id, dir) => {
    if (!project) return
    const blocks = [...project.blocks]
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx < 0) return
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= blocks.length) return
    ;[blocks[idx], blocks[j]] = [blocks[j], blocks[idx]]
    setProject({ ...project, blocks })
    void flushSave(blocks)
  }

  const handleImageFile = (blockId, file) => {
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => updateBlock(blockId, { content: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const sendChat = async (e) => {
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

  const blocks = project?.blocks ?? []
  const messages = useMemo(
    () => [...(project?.messages || [])].sort((a, b) => a.createdAt - b.createdAt),
    [project]
  )

  const messagesListRef = useRef(null)

  const chatScrollSig = useMemo(() => {
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
          <div className="project-board__code-row">
            <span className="project-board__code-label">Código da sala</span>
            <code className="project-board__code">{project.joinCode}</code>
            <button type="button" className="btn btn--ghost btn--sm" onClick={copyCode}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
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
          aria-selected={displayTab === 'documento'}
          className={`project-board__tab${displayTab === 'documento' ? ' project-board__tab--active' : ''}`}
          onClick={() => {
            setWorkspaceTab('documento')
            if (openTaskId) {
              const next = new URLSearchParams(params)
              next.delete('task')
              setParams(next, { replace: true })
            }
          }}
        >
          Documento livre
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
        <section className="project-board__canvas" aria-label="Quadro do projeto">
          <div className="project-board__toolbar">
            <span className="project-board__toolbar-label">Adicionar bloco:</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => addBlock('text')}>
              Texto
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => addBlock('image')}>
              Imagem
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => addBlock('code')}>
              Código
            </button>
          </div>

          {blocks.length === 0 ? (
            <p className="project-board__hint">Nenhum bloco ainda. Adicione texto, imagem ou código acima.</p>
          ) : (
            <ul className="project-board__blocks">
              {blocks.map((b, index) => (
                <li key={b.id} className="block-card">
                  <div className="block-card__controls">
                    <span className="block-card__type">
                      {b.type === 'text' ? 'Texto' : b.type === 'image' ? 'Imagem' : 'Código'}
                    </span>
                    <div className="block-card__actions">
                      <button
                        type="button"
                        className="btn btn--icon"
                        aria-label="Mover para cima"
                        disabled={index === 0}
                        onClick={() => moveBlock(b.id, 'up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon"
                        aria-label="Mover para baixo"
                        disabled={index === blocks.length - 1}
                        onClick={() => moveBlock(b.id, 'down')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon btn--danger"
                        aria-label="Remover bloco"
                        onClick={() => removeBlock(b.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {b.type === 'text' && (
                    <>
                      <div className="block-card__format">
                        <label>
                          Alinhamento
                          <select
                            value={b.align || 'left'}
                            onChange={(e) => updateBlock(b.id, { align: e.target.value })}
                            className="block-card__select"
                          >
                            <option value="left">Esquerda</option>
                            <option value="center">Centro</option>
                            <option value="right">Direita</option>
                          </select>
                        </label>
                        <label>
                          Tamanho
                          <select
                            value={b.size || 'md'}
                            onChange={(e) => updateBlock(b.id, { size: e.target.value })}
                            className="block-card__select"
                          >
                            <option value="sm">Pequeno</option>
                            <option value="md">Médio</option>
                            <option value="lg">Grande</option>
                          </select>
                        </label>
                      </div>
                      <textarea
                        className={`block-card__textarea block-card__textarea--${b.size || 'md'}`}
                        style={{ textAlign: b.align || 'left' }}
                        value={b.content || ''}
                        onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                        onBlur={() => void flushSave(projectRef.current?.blocks ?? [])}
                        placeholder="Escreva anotações, demandas ou checklists…"
                        rows={4}
                      />
                    </>
                  )}

                  {b.type === 'image' && (
                    <div className="block-card__image-wrap">
                      {b.content ? (
                        <img src={b.content} alt="" className="block-card__image" />
                      ) : (
                        <label className="block-card__file-label">
                          Escolher imagem
                          <input
                            type="file"
                            accept="image/*"
                            className="block-card__file"
                            onChange={(e) => handleImageFile(b.id, e.target.files?.[0])}
                          />
                        </label>
                      )}
                      {b.content ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm block-card__replace"
                          onClick={() => {
                            const blocks = (projectRef.current?.blocks ?? []).map((x) =>
                              x.id === b.id ? { ...x, content: '' } : x
                            )
                            setProject((prev) => (prev ? { ...prev, blocks } : prev))
                            void flushSave(blocks)
                          }}
                        >
                          Trocar imagem
                        </button>
                      ) : null}
                    </div>
                  )}

                  {b.type === 'code' && (
                    <div className="block-card__code-wrap">
                      <label className="block-card__code-lang">
                        Linguagem (opcional)
                        <input
                          type="text"
                          value={b.language || ''}
                          onChange={(e) => updateBlock(b.id, { language: e.target.value })}
                          placeholder="js, sql, python…"
                          className="block-card__input"
                        />
                      </label>
                      <textarea
                        className="block-card__code"
                        value={b.content || ''}
                        onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                        onBlur={() => void flushSave(projectRef.current?.blocks ?? [])}
                        placeholder="Cole ou digite código aqui…"
                        rows={8}
                        spellCheck={false}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
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

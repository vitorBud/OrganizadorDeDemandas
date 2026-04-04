import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getProjects, saveProjects, generateId } from '../lib/storage'
import './ProjectBoard.css'

function findProject(id) {
  return getProjects().find((p) => p.id === id) ?? null
}

function cloneProject(p) {
  return {
    ...p,
    blocks: [...(p.blocks || [])],
    messages: [...(p.messages || [])],
    memberIds: [...(p.memberIds || [])],
  }
}

export function ProjectBoard() {
  const { projectId } = useParams()
  const { user, userId } = useAuth()
  const navigate = useNavigate()
  const [storageTick, setStorageTick] = useState(0)
  const [chatDraft, setChatDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const project = useMemo(() => {
    if (!projectId) return null
    const p = findProject(projectId)
    if (!p || !p.memberIds?.includes(userId)) return null
    return cloneProject(p)
  }, [projectId, userId, storageTick]) // eslint-disable-line react-hooks/exhaustive-deps -- storageTick invalidates snapshot after localStorage writes

  useEffect(() => {
    if (!projectId) {
      navigate('/app', { replace: true })
      return
    }
    const p = findProject(projectId)
    if (!p || !p.memberIds?.includes(userId)) {
      navigate('/app', { replace: true })
    }
  }, [projectId, userId, navigate, storageTick])

  const persist = useCallback(
    (next) => {
      const all = getProjects()
      const i = all.findIndex((p) => p.id === projectId)
      if (i === -1) return
      all[i] = {
        ...all[i],
        ...next,
        updatedAt: Date.now(),
      }
      saveProjects(all)
      setStorageTick((t) => t + 1)
    },
    [projectId]
  )

  const blocks = project?.blocks ?? []

  const addBlock = (type) => {
    const id = generateId()
    const base = { id, type }
    if (type === 'text') Object.assign(base, { content: '', align: 'left', size: 'md' })
    if (type === 'image') Object.assign(base, { content: '' })
    if (type === 'code') Object.assign(base, { content: '', language: '' })
    persist({ blocks: [...blocks, base] })
  }

  const updateBlock = (id, patch) => {
    persist({
      blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })
  }

  const removeBlock = (id) => {
    persist({ blocks: blocks.filter((b) => b.id !== id) })
  }

  const moveBlock = (id, dir) => {
    const idx = blocks.findIndex((b) => b.id === id)
    if (idx < 0) return
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    persist({ blocks: next })
  }

  const handleImageFile = (blockId, file) => {
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => updateBlock(blockId, { content: String(reader.result) })
    reader.readAsDataURL(file)
  }

  const sendChat = (e) => {
    e.preventDefault()
    const text = chatDraft.trim()
    if (!text || !user) return
    const msg = {
      id: generateId(),
      userId,
      userName: user.name,
      text,
      createdAt: Date.now(),
    }
    persist({ messages: [...(project.messages || []), msg] })
    setChatDraft('')
  }

  const copyCode = () => {
    if (!project?.joinCode) return
    navigator.clipboard.writeText(project.joinCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const messages = useMemo(() => [...(project?.messages || [])].sort((a, b) => a.createdAt - b.createdAt), [project])

  if (!project) {
    return (
      <div className="project-board project-board--loading">
        <p>Carregando…</p>
      </div>
    )
  }

  return (
    <div className="project-board">
      <div className="project-board__top">
        <Link to="/app" className="project-board__back">
          ← Área de trabalho
        </Link>
        <div className="project-board__head">
          <h1 className="project-board__title">{project.name}</h1>
          <div className="project-board__code-row">
            <span className="project-board__code-label">Código de entrada</span>
            <code className="project-board__code">{project.joinCode}</code>
            <button type="button" className="btn btn--ghost btn--sm" onClick={copyCode}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      </div>

      <div className="project-board__layout">
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
                          onClick={() => updateBlock(b.id, { content: '' })}
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

        <aside className="project-board__chat" aria-label="Chat do projeto">
          <h2 className="project-board__chat-title">Chat</h2>
          <ul className="project-board__messages">
            {messages.map((m) => (
              <li key={m.id} className="project-board__msg">
                <span className="project-board__msg-author">{m.userName}</span>
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

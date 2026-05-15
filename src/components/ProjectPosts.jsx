import { useEffect, useMemo, useState } from 'react'
import { isRemoteCollab, newRemoteId } from '../lib/collabApi'
import { generateId } from '../lib/storage'
import { accentColorForDisplay } from '../lib/userColor'
import {
  createPostBlock,
  formatPostDate,
  isPostBlock,
  mergePostsIntoBlocks,
  patchPostBlock,
  postsFromBlocks,
} from '../lib/projectPosts'
import './ProjectPosts.css'

const EMPTY_DRAFT = { title: '', body: '' }

/**
 * @param {object} props
 */
export function ProjectPosts({
  blocks,
  members,
  user,
  userId,
  ownerId,
  onBlocksChange,
  onPersist,
  onEditingChange,
}) {
  const remote = isRemoteCollab()
  const [composing, setComposing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const posts = useMemo(() => postsFromBlocks(blocks), [blocks])
  const isLeader = ownerId === userId

  useEffect(() => {
    onEditingChange?.(composing || !!editingId)
  }, [composing, editingId, onEditingChange])

  const newPostId = () => (remote ? newRemoteId() : generateId())

  const postBlocksOnly = () => (blocks ?? []).filter((b) => isPostBlock(b))

  async function applyPostBlocks(nextPostBlocks) {
    const merged = mergePostsIntoBlocks(blocks, nextPostBlocks)
    onBlocksChange(merged)
    await onPersist(merged)
  }

  function canModifyPost(post) {
    if (post.legacy) return false
    return post.authorId === userId || isLeader
  }

  function startCompose() {
    setError('')
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setComposing(true)
  }

  function startEdit(post) {
    if (!canModifyPost(post)) return
    setError('')
    setComposing(false)
    setEditingId(post.id)
    setDraft({ title: post.title, body: post.content })
  }

  function cancelForm() {
    setComposing(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const title = draft.title.trim()
    const body = draft.body.trim()
    if (!title) {
      setError('Informe um título para a postagem.')
      return
    }
    if (!body) {
      setError('Escreva o conteúdo da postagem.')
      return
    }

    setBusy(true)
    try {
      if (editingId) {
        const next = postBlocksOnly().map((b) =>
          b.id === editingId ? patchPostBlock(b, { title, body }) : b
        )
        await applyPostBlocks(next)
        cancelForm()
      } else {
        const block = createPostBlock({
          id: newPostId(),
          userId,
          userName: user?.name ?? 'Usuário',
          title,
          body,
        })
        await applyPostBlocks([block, ...postBlocksOnly()])
        cancelForm()
      }
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Não foi possível salvar a postagem.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(post) {
    if (!canModifyPost(post)) return
    if (!window.confirm(`Excluir a postagem "${post.title}"?`)) return
    setBusy(true)
    setError('')
    try {
      const next = postBlocksOnly().filter((b) => b.id !== post.id)
      await applyPostBlocks(next)
      if (editingId === post.id) cancelForm()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Não foi possível excluir.')
    } finally {
      setBusy(false)
    }
  }

  const showForm = composing || editingId

  return (
    <section className="project-posts" aria-label="Mural de postagens">
      <div className="project-posts__head">
        <div className="project-posts__intro">
          <h2 className="project-posts__title">Mural do grupo</h2>
          <p className="project-posts__lead">
            Publique avisos, decisões e contexto para o time. Só quem publicou ou o líder do grupo
            pode editar e excluir.
          </p>
        </div>
        {!showForm ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={startCompose} disabled={busy}>
            Nova postagem
          </button>
        ) : null}
      </div>

      {error ? <p className="project-posts__error">{error}</p> : null}

      {showForm ? (
        <form className="project-posts__composer card-block" onSubmit={(e) => void handleSubmit(e)}>
          <h3 className="project-posts__composer-title">
            {editingId ? 'Editar postagem' : 'Nova postagem'}
          </h3>
          <label className="project-posts__field">
            <span>Título</span>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Ex.: Prazo da entrega, reunião de alinhamento…"
              maxLength={160}
              disabled={busy}
              autoFocus
            />
          </label>
          <label className="project-posts__field">
            <span>Conteúdo</span>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Detalhes, links, próximos passos…"
              rows={6}
              disabled={busy}
            />
          </label>
          <div className="project-posts__composer-actions">
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              {busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Publicar'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelForm} disabled={busy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {posts.length === 0 && !showForm ? (
        <p className="project-posts__empty">
          Nenhuma postagem ainda. Use <strong>Nova postagem</strong> para avisar o grupo.
        </p>
      ) : (
        <ul className="project-posts__list">
          {posts.map((post) => {
            const member = members.find((m) => m.id === post.authorId)
            const authorColor = accentColorForDisplay(
              member?.accentColor,
              post.authorId ?? post.id
            )
            const edited =
              post.updatedAt && post.createdAt && post.updatedAt > post.createdAt + 1000

            return (
              <li key={post.id} className="project-posts__item card-block">
                <header className="project-posts__item-head">
                  <div>
                    <h3 className="project-posts__item-title">{post.title}</h3>
                    <p className="project-posts__meta">
                      <span style={{ color: authorColor }}>{post.authorName}</span>
                      {post.createdAt ? (
                        <>
                          {' · '}
                          <time dateTime={new Date(post.createdAt).toISOString()}>
                            {formatPostDate(post.createdAt)}
                          </time>
                        </>
                      ) : null}
                      {edited ? (
                        <span className="project-posts__edited">
                          {' '}
                          · editado {formatPostDate(post.updatedAt)}
                        </span>
                      ) : null}
                      {post.legacy ? (
                        <span className="project-posts__legacy"> · documento antigo (somente leitura)</span>
                      ) : null}
                    </p>
                  </div>
                  {canModifyPost(post) ? (
                    <div className="project-posts__item-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => startEdit(post)}
                        disabled={busy || editingId === post.id}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--danger"
                        onClick={() => void handleDelete(post)}
                        disabled={busy}
                      >
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </header>
                <div className="project-posts__body">{post.content}</div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

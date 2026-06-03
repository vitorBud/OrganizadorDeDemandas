import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2, List, ListOrdered, MoreHorizontal, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
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

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g
const LIST_MARKER_RE = /^\s*(?:[-*]|\d+[.)])\s+/

function normalizeHref(rawUrl) {
  const trimmed = String(rawUrl ?? '').trim()
  if (!trimmed) return ''
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return ''
    return url.href
  } catch {
    return ''
  }
}

function renderInlineContent(text, keyPrefix) {
  const pieces = []
  let lastIndex = 0
  let match
  MARKDOWN_LINK_RE.lastIndex = 0

  while ((match = MARKDOWN_LINK_RE.exec(text)) !== null) {
    const [raw, label, href] = match
    const safeHref = normalizeHref(href)
    if (match.index > lastIndex) {
      pieces.push(text.slice(lastIndex, match.index))
    }
    pieces.push(
      safeHref ? (
        <a
          key={`${keyPrefix}-link-${match.index}`}
          href={safeHref}
          target="_blank"
          rel="noreferrer"
        >
          {label}
        </a>
      ) : (
        raw
      )
    )
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) pieces.push(text.slice(lastIndex))
  return pieces.length ? pieces : text
}

function renderTextLines(lines, keyPrefix) {
  return lines.map((line, index) => (
    <span key={`${keyPrefix}-line-${index}`}>
      {index > 0 ? <br /> : null}
      {renderInlineContent(line, `${keyPrefix}-${index}`)}
    </span>
  ))
}

function renderPostContent(content) {
  const nodes = []
  const paragraphLines = []
  let listType = null
  let listItems = []

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    const key = `p-${nodes.length}`
    nodes.push(<p key={key}>{renderTextLines(paragraphLines, key)}</p>)
    paragraphLines.length = 0
  }

  const flushList = () => {
    if (!listItems.length) return
    const key = `list-${nodes.length}`
    const Tag = listType === 'numbered' ? 'ol' : 'ul'
    nodes.push(
      <Tag key={key}>
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInlineContent(item, `${key}-${index}`)}</li>
        ))}
      </Tag>
    )
    listType = null
    listItems = []
  }

  String(content ?? '')
    .split(/\r?\n/)
    .forEach((line) => {
      const bullet = line.match(/^\s*[-*]\s+(.+)$/)
      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)

      if (!line.trim()) {
        flushParagraph()
        flushList()
        return
      }

      if (bullet || numbered) {
        const nextType = numbered ? 'numbered' : 'bullet'
        flushParagraph()
        if (listType && listType !== nextType) flushList()
        listType = nextType
        listItems.push((bullet?.[1] ?? numbered?.[1] ?? '').trim())
        return
      }

      flushList()
      paragraphLines.push(line)
    })

  flushParagraph()
  flushList()

  return nodes.length ? nodes : <p>{renderInlineContent(content, 'empty')}</p>
}

/**
 * Mural de postagens do projeto.
 * Recebe os blocos do ProjectBoard, transforma em posts e devolve a lista atualizada para persistir.
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
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  const posts = useMemo(() => postsFromBlocks(blocks), [blocks])
  const isLeader = ownerId === userId

  useEffect(() => {
    // Enquanto alguém edita, o ProjectBoard pausa reloads de blocks para não apagar o rascunho.
    onEditingChange?.(composing || !!editingId)
  }, [composing, editingId, onEditingChange])

  const newPostId = () => (remote ? newRemoteId() : generateId())

  const postBlocksOnly = () => (blocks ?? []).filter((b) => isPostBlock(b))

  async function applyPostBlocks(nextPostBlocks) {
    // Atualização otimista: mostra imediatamente e desfaz se o Supabase recusar.
    const previousBlocks = blocks ?? []
    const merged = mergePostsIntoBlocks(blocks, nextPostBlocks)
    onBlocksChange(merged)
    try {
      await onPersist(merged)
    } catch (err) {
      onBlocksChange(previousBlocks)
      throw err
    }
  }

  function canModifyPost(post) {
    // O autor ou o líder pode editar/excluir; posts legados ficam somente leitura.
    if (post.legacy) return false
    return post.authorId === userId || isLeader
  }

  function startCompose() {
    setError('')
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setLinkText('')
    setLinkUrl('')
    setComposing(true)
  }

  function startEdit(post) {
    if (!canModifyPost(post)) return
    setError('')
    setComposing(false)
    setEditingId(post.id)
    setLinkText('')
    setLinkUrl('')
    setDraft({ title: post.title, body: post.content })
  }

  function cancelForm() {
    setComposing(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setLinkText('')
    setLinkUrl('')
    setError('')
  }

  function replaceSelection(replacement) {
    const el = textareaRef.current
    const body = draft.body
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const next = `${body.slice(0, start)}${replacement}${body.slice(end)}`
    setDraft((d) => ({ ...d, body: next }))

    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(start + replacement.length, start + replacement.length)
    })
  }

  function selectedBodyText() {
    const el = textareaRef.current
    if (!el) return ''
    return draft.body.slice(el.selectionStart, el.selectionEnd)
  }

  function applyList(kind) {
    const selected = selectedBodyText()
    let count = 0
    const fallback = kind === 'numbered' ? '1. Primeiro item\n2. Segundo item' : '- Primeiro item\n- Segundo item'
    const replacement = selected.trim()
      ? selected
          .split(/\r?\n/)
          .map((line) => {
            const clean = line.replace(LIST_MARKER_RE, '').trim()
            if (!clean) return ''
            if (kind === 'numbered') {
              count += 1
              return `${count}. ${clean}`
            }
            return `- ${clean}`
          })
          .join('\n')
      : fallback

    replaceSelection(replacement)
  }

  function insertLink() {
    const href = normalizeHref(linkUrl)
    if (!href) {
      setError('Informe um link válido.')
      return
    }
    const selected = selectedBodyText().trim()
    const label = (linkText.trim() || selected || 'link').replace(/\]/g, ')')
    replaceSelection(`[${label}](${href})`)
    setLinkText('')
    setLinkUrl('')
    setError('')
  }

  async function handleSubmit(e) {
    // Mesmo formulário cria e edita; editingId decide o caminho.
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
    // Remove só o post selecionado e preserva outros blocos do projeto.
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
              ref={textareaRef}
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Detalhes, links, próximos passos…"
              rows={6}
              disabled={busy}
            />
          </label>
          <details className="project-posts__tools">
            <summary>
              <SlidersHorizontal size={15} strokeWidth={2.1} aria-hidden />
              Ferramentas
            </summary>
            <div className="project-posts__tools-panel">
              <div className="project-posts__tools-row" aria-label="Formatar como lista">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => applyList('bullet')}
                  disabled={busy}
                  title="Tópicos"
                >
                  <List size={15} strokeWidth={2.1} aria-hidden />
                  Tópicos
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => applyList('numbered')}
                  disabled={busy}
                  title="Numeração"
                >
                  <ListOrdered size={15} strokeWidth={2.1} aria-hidden />
                  Numeração
                </button>
              </div>
              <div className="project-posts__link-tools">
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Palavra"
                  aria-label="Texto do link"
                  disabled={busy}
                />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  aria-label="Endereço do link"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={insertLink}
                  disabled={busy}
                  title="Inserir link"
                >
                  <Link2 size={15} strokeWidth={2.1} aria-hidden />
                  Link
                </button>
              </div>
            </div>
          </details>
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
                    <details className="project-posts__item-actions">
                      <summary aria-label="Ações da postagem" title="Ações">
                        <MoreHorizontal size={17} strokeWidth={2.1} aria-hidden />
                      </summary>
                      <div className="project-posts__item-menu">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => startEdit(post)}
                          disabled={busy || editingId === post.id}
                        >
                          <Pencil size={14} strokeWidth={2.1} aria-hidden />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm btn--danger"
                          onClick={() => void handleDelete(post)}
                          disabled={busy}
                        >
                          <Trash2 size={14} strokeWidth={2.1} aria-hidden />
                          Excluir
                        </button>
                      </div>
                    </details>
                  ) : null}
                </header>
                <div className="project-posts__body">{renderPostContent(post.content)}</div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

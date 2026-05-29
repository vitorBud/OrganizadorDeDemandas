export const POST_BLOCK_TYPE = 'post'
export const POST_BLOCK_DB_TYPE = 'text'
export const POST_BLOCK_KIND = 'post'

/**
 * Identifica blocos que pertencem ao mural.
 * No banco eles podem ser salvos como type="text" para respeitar constraints antigas.
 * @param {object} block
 */
export function isPostBlock(block) {
  if (!block) return false
  if (block.type === POST_BLOCK_TYPE) return true
  if (block.type !== POST_BLOCK_DB_TYPE) return false
  if (block.kind === POST_BLOCK_KIND || block.meta?.kind === POST_BLOCK_KIND) return true
  return Boolean(block.title && (block.authorId || block.authorName || block.createdAt))
}

/**
 * Normaliza formatos antigos/novos para uma estrutura única que o componente entende.
 * @param {object} block
 */
export function normalizePostBlock(block) {
  if (!block) return null
  if (isPostBlock(block)) {
    return {
      id: block.id,
      type: POST_BLOCK_TYPE,
      kind: POST_BLOCK_KIND,
      title: String(block.title ?? '').trim(),
      content: String(block.content ?? ''),
      authorId: block.authorId ?? null,
      authorName: String(block.authorName ?? 'Usuário').trim() || 'Usuário',
      createdAt: block.createdAt ?? Date.now(),
      updatedAt: block.updatedAt ?? block.createdAt ?? Date.now(),
    }
  }
  if (block.type === 'text' && String(block.content ?? '').trim()) {
    return {
      id: block.id,
      type: POST_BLOCK_TYPE,
      title: 'Anotação (documento antigo)',
      content: String(block.content ?? ''),
      authorId: null,
      authorName: 'Documento anterior',
      createdAt: 0,
      updatedAt: 0,
      legacy: true,
    }
  }
  return null
}

/**
 * Separa posts reais e ordena do mais recente para o mais antigo.
 * @param {object[]} blocks
 */
export function postsFromBlocks(blocks) {
  return (blocks ?? [])
    .map(normalizePostBlock)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

/**
 * Preserva blocos que não são do mural quando salvamos uma lista nova de posts.
 * @param {object[]} blocks
 */
export function nonPostBlocks(blocks) {
  return (blocks ?? []).filter((b) => !isPostBlock(b) && b.type !== 'text')
}

/**
 * Junta postagens atualizadas com outros blocos do projeto.
 * @param {object[]} allBlocks
 * @param {object[]} postBlocks
 */
export function mergePostsIntoBlocks(allBlocks, postBlocks) {
  return [...nonPostBlocks(allBlocks), ...postBlocks]
}

/**
 * Cria uma postagem nova no formato aceito pelo app e pelo banco.
 * @param {object} params
 */
export function createPostBlock({ id, userId, userName, title, body }) {
  const now = Date.now()
  return {
    id,
    type: POST_BLOCK_DB_TYPE,
    kind: POST_BLOCK_KIND,
    title: title.trim(),
    content: body.trim(),
    authorId: userId,
    authorName: userName.trim() || 'Usuário',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Aplica edição sem perder metadados como autor e data de criação.
 * @param {object} post
 * @param {{ title: string, body: string }} patch
 */
export function patchPostBlock(post, { title, body }) {
  return {
    ...post,
    type: POST_BLOCK_DB_TYPE,
    kind: POST_BLOCK_KIND,
    title: title.trim(),
    content: body.trim(),
    updatedAt: Date.now(),
  }
}

/**
 * @param {number} ts
 */
export function formatPostDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

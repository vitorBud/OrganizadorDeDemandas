import { supabase } from './supabaseClient'
import {
  getProjects,
  saveProjects,
  generateId,
  generateJoinCode,
} from './storage'

/** Verdadeiro só quando o cliente Supabase foi criado (URL + anon key no build). */
export function isRemoteCollab() {
  return !!supabase
}

/** UUID para blocos/mensagens no modo Supabase */
export function newRemoteId() {
  return crypto.randomUUID()
}

function mapProjectRow(p) {
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    joinCode: p.join_code,
    ownerId: p.owner_id,
    updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
  }
}

function mapBlockRow(row) {
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {}
  return {
    id: row.id,
    type: row.type,
    content: row.content ?? '',
    align: meta.align ?? 'left',
    size: meta.size ?? 'md',
    language: meta.language ?? '',
  }
}

function blockToDb(projectId, block, sortOrder) {
  return {
    id: block.id,
    project_id: projectId,
    type: block.type,
    content: block.content ?? '',
    meta: {
      align: block.align,
      size: block.size,
      language: block.language,
    },
    sort_order: sortOrder,
  }
}

/** @param {string} userId */
export async function listProjects(userId) {
  if (!isRemoteCollab()) {
    return getProjects().filter((p) => p.memberIds?.includes(userId))
  }
  const { data: mems, error: mErr } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  if (mErr) throw mErr
  const ids = [...new Set((mems ?? []).map((m) => m.project_id))]
  if (ids.length === 0) return []

  const { data: projs, error: pErr } = await supabase
    .from('projects')
    .select('id, name, join_code, owner_id, updated_at, created_at')
    .in('id', ids)

  if (pErr) throw pErr
  return (projs ?? [])
    .map(mapProjectRow)
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * @param {string} userId
 * @param {string} name
 */
export async function createProjectRemote(userId, name) {
  if (!isRemoteCollab()) {
    const all = getProjects()
    let code = generateJoinCode()
    while (all.some((p) => p.joinCode === code)) code = generateJoinCode()
    const project = {
      id: generateId(),
      name,
      joinCode: code,
      ownerId: userId,
      memberIds: [userId],
      blocks: [],
      messages: [],
      tasks: [],
      taskComments: [],
      taskActivity: [],
      appNotifications: [],
      updatedAt: Date.now(),
    }
    all.push(project)
    saveProjects(all)
    return project
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_project', {
    p_name: name,
  })

  if (!rpcError && rpcData != null) {
    let row = rpcData
    if (typeof row === 'string') {
      try {
        row = JSON.parse(row)
      } catch {
        row = null
      }
    }
    if (row && typeof row === 'object' && row.id) {
      return mapProjectRow(row)
    }
  }

  const rpcMissing =
    rpcError &&
    (rpcError.code === '42883' ||
      String(rpcError.message || '').toLowerCase().includes('create_project'))
  if (rpcError && !rpcMissing) {
    throw rpcError
  }

  let joinCode = generateJoinCode()
  for (let i = 0; i < 8; i++) {
    const { data: exists } = await supabase
      .from('projects')
      .select('id')
      .eq('join_code', joinCode)
      .maybeSingle()
    if (!exists) break
    joinCode = generateJoinCode()
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name,
      join_code: joinCode,
      owner_id: userId,
    })
    .select('id, name, join_code, owner_id, updated_at')
    .single()

  if (error) throw error
  return mapProjectRow(data)
}

/**
 * @param {string} userId
 * @param {string} code
 */
export async function joinProjectByCode(userId, code) {
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) throw new Error('Informe o código.')

  if (!isRemoteCollab()) {
    const all = getProjects()
    const project = all.find((p) => p.joinCode?.toUpperCase() === trimmed)
    if (!project) throw new Error('Nenhum projeto encontrado com esse código.')
    if (!project.memberIds.includes(userId)) {
      project.memberIds = [...project.memberIds, userId]
      project.updatedAt = Date.now()
      saveProjects(all)
    }
    return project
  }

  const { data, error } = await supabase.rpc('join_project_by_code', {
    invite_code: trimmed,
  })

  if (error) {
    const msg = error.message || ''
    const code = error.code || ''
    if (code === '42883' || msg.includes('join_project_by_code')) {
      throw new Error(
        'Função de entrada não encontrada no Supabase. Rode o SQL em supabase/collab_setup.sql no painel.'
      )
    }
    if (msg.includes('Código') || code === 'P0001') {
      throw new Error('Código inválido ou sala não encontrada.')
    }
    throw new Error(msg || 'Não foi possível entrar na sala.')
  }

  let row = data
  if (typeof row === 'string') {
    try {
      row = JSON.parse(row)
    } catch {
      throw new Error('Resposta inválida do servidor.')
    }
  }
  if (!row || typeof row !== 'object' || !row.id) {
    throw new Error('Não foi possível obter os dados do projeto após entrar na sala.')
  }
  return mapProjectRow(row)
}

/**
 * @param {string} projectId
 * @param {string} userId
 */
export async function getProjectIfMember(projectId, userId) {
  if (!isRemoteCollab()) {
    const p = getProjects().find((x) => x.id === projectId)
    if (!p || !p.memberIds?.includes(userId)) return null
    return {
      ...p,
      blocks: [...(p.blocks || [])],
      messages: [...(p.messages || [])],
    }
  }

  const { data: member, error: mErr } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (mErr || !member) return null

  const { data: proj, error: pErr } = await supabase
    .from('projects')
    .select('id, name, join_code, owner_id, updated_at')
    .eq('id', projectId)
    .single()

  if (pErr || !proj) return null

  const { data: blockRows } = await supabase
    .from('blocks')
    .select('id, type, content, meta, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  const { data: msgRows } = await supabase
    .from('messages')
    .select('id, text, created_at, user_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const userIds = [...new Set((msgRows ?? []).map((m) => m.user_id).filter(Boolean))]
  let nameMap = {}
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, name').in('id', userIds)
    nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.name]))
  }

  const blocks = (blockRows ?? []).map(mapBlockRow)
  const messages = (msgRows ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    userName: nameMap[m.user_id] ?? 'Colega',
    text: m.text,
    createdAt: new Date(m.created_at).getTime(),
  }))

  const base = mapProjectRow(proj)
  return { ...base, blocks, messages }
}

/**
 * @param {string} projectId
 * @param {{ blocks?: object[], messages?: object[] }} payload
 */
export async function persistProjectState(projectId, { blocks, messages }) {
  if (!isRemoteCollab()) {
    const all = getProjects()
    const i = all.findIndex((p) => p.id === projectId)
    if (i === -1) return
    const next = { ...all[i], updatedAt: Date.now() }
    if (blocks !== undefined) next.blocks = blocks
    if (messages !== undefined) next.messages = messages
    all[i] = next
    saveProjects(all)
    return
  }

  if (blocks === undefined) return

  // Remote: blocks are row-per-block; messages appended separately in sendMessageRemote
  const rows = blocks.map((b, o) => blockToDb(projectId, b, o))
  if (rows.length === 0) {
    const { error: emptyErr } = await supabase.from('blocks').delete().eq('project_id', projectId)
    if (emptyErr) throw emptyErr
  } else {
    const { error } = await supabase.from('blocks').upsert(rows, { onConflict: 'id' })
    if (error) throw error
    const { data: existing } = await supabase.from('blocks').select('id').eq('project_id', projectId)
    const keep = new Set(blocks.map((b) => b.id))
    const toDelete = (existing ?? []).filter((r) => !keep.has(r.id)).map((r) => r.id)
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('blocks').delete().in('id', toDelete)
      if (delErr) throw delErr
    }
  }

  await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId)
}

/**
 * @param {string} projectId
 * @param {object} msg { id, userId, userName, text, createdAt }
 */
/**
 * @param {string} projectId
 * @param {{ userId: string, userName: string, text: string }} msg
 */
export async function sendMessageRemote(projectId, msg) {
  if (!isRemoteCollab()) {
    const all = getProjects()
    const i = all.findIndex((p) => p.id === projectId)
    if (i === -1) return
    const row = {
      id: generateId(),
      userId: msg.userId,
      userName: msg.userName,
      text: msg.text,
      createdAt: Date.now(),
    }
    all[i].messages = [...(all[i].messages || []), row]
    all[i].updatedAt = Date.now()
    saveProjects(all)
    return
  }

  const { error } = await supabase.from('messages').insert({
    project_id: projectId,
    user_id: msg.userId,
    text: msg.text,
  })
  if (error) throw error
}

/**
 * @param {string} projectId
 * @param {(payload: { blocks?: boolean, messages?: boolean }) => void} onChange
 */
export function subscribeProjectChannels(projectId, onChange) {
  if (!isRemoteCollab() || !supabase) return () => {}

  const channel = supabase
    .channel(`room:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'blocks', filter: `project_id=eq.${projectId}` },
      () => onChange({ blocks: true })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
      () => onChange({ messages: true })
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
      () => onChange({ project: true })
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

import { supabase } from './supabaseClient'
import { isRemoteCollab } from './collabApi'
import { fetchProfilesDisplayMapByIds } from './profileRemote'
import { normalizeAccentColor } from './userColor'
import { getProjects, saveProjects, generateId, getUsers } from './storage'

/**
 * API de tarefas/Kanban.
 * Assim como collabApi, ela esconde a diferença entre modo local e Supabase.
 */

export const TASK_STATUSES = [
  { id: 'todo', label: 'A fazer' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'review', label: 'Em revisão' },
  { id: 'done', label: 'Concluído' },
]

export const PRIORITIES = [
  { id: 'high', label: 'Alta', emoji: '🔴' },
  { id: 'medium', label: 'Média', emoji: '🟡' },
  { id: 'low', label: 'Baixa', emoji: '🟢' },
]

/** Gera id adequado para o ambiente atual. */
function newId(remote) {
  return remote && typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : generateId()
}

/** Localiza um projeto dentro do array salvo no navegador. */
function findLocalProject(projectId) {
  const all = getProjects()
  const i = all.findIndex((p) => p.id === projectId)
  return { all, i, project: i === -1 ? null : all[i] }
}

/** Garante que projetos antigos tenham as coleções usadas pelo Kanban. */
function ensureLocalKanban(project) {
  return {
    tasks: project.tasks ?? [],
    taskComments: project.taskComments ?? [],
    taskActivity: project.taskActivity ?? [],
    appNotifications: project.appNotifications ?? [],
  }
}

/** Aplica uma alteração local no projeto e salva de volta no localStorage. */
function saveLocalProjectPatch(projectId, patchFn) {
  const { all, i, project } = findLocalProject(projectId)
  if (i === -1 || !project) return null
  const next = patchFn({ ...project, ...ensureLocalKanban(project) })
  all[i] = { ...next, updatedAt: Date.now() }
  saveProjects(all)
  return all[i]
}

/** Converte uma linha da tabela tasks para o formato consumido pela UI. */
function mapTaskRow(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    assigneeId: row.assignee_id ?? null,
    dueDate: row.due_date ?? null,
    priority: row.priority,
    sortOrder: row.sort_order ?? 0,
    meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }
}

/** Nome visível com fallback consistente para usuários sem perfil completo. */
function resolveDisplayName(value, fallback = 'Usuário') {
  const trimmed = String(value ?? '').trim()
  return trimmed || fallback
}

/** Busca nomes em mensagens antigas quando profiles ainda não tem todos os dados. */
async function fetchMemberNameHintsFromMessages(projectId, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length || !isRemoteCollab() || !supabase) return {}
  const { data, error } = await supabase
    .from('messages')
    .select('user_id, sender_name, created_at')
    .eq('project_id', projectId)
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(500)

  // Banco sem coluna sender_name (migração antiga): apenas ignora esse fallback.
  if (error && /sender_name|column|schema cache/i.test(String(error.message || ''))) return {}
  if (error) throw error

  const out = {}
  for (const row of data ?? []) {
    if (out[row.user_id]) continue
    const name = String(row.sender_name ?? '').trim()
    if (name) out[row.user_id] = name
  }
  return out
}

function mapCommentRow(row, displayMap) {
  const meta = displayMap[row.user_id]
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    userId: row.user_id,
    userName: resolveDisplayName(meta?.name, 'Colega'),
    userAccentColor: meta?.accentColor ?? null,
    body: row.body,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

/** Une atividade de tarefas com dados de exibição do autor. */
function mapActivityRow(row, displayMap) {
  const meta = row.actor_id ? displayMap[row.actor_id] : null
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    actorId: row.actor_id,
    actorName: row.actor_id ? resolveDisplayName(meta?.name, 'Alguém') : 'Sistema',
    actorAccentColor: row.actor_id ? meta?.accentColor ?? null : null,
    action: row.action,
    detail: row.detail && typeof row.detail === 'object' ? row.detail : {},
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

/** Formata notificação vinda do banco para o padrão camelCase. */
function mapNotifRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    taskId: row.task_id ?? null,
    kind: row.kind,
    title: row.title,
    body: row.body ?? '',
    readAt: row.read_at ? new Date(row.read_at).getTime() : null,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

async function profileDisplayMap(userIds) {
  return fetchProfilesDisplayMapByIds(userIds)
}

function localUserAccent(userId) {
  const u = getUsers().find((x) => x.id === userId)
  return normalizeAccentColor(u?.accentColor) ?? null
}

/**
 * Verifica se o usuário pode acessar o projeto antes de ler/escrever tarefas.
 * @param {string} projectId
 * @param {string} userId
 */
export async function assertProjectMember(projectId, userId) {
  if (!isRemoteCollab()) {
    const { project } = findLocalProject(projectId)
    if (!project?.memberIds?.includes(userId)) throw new Error('Sem acesso ao projeto.')
    return
  }
  const { data, error } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Sem acesso ao projeto.')
}

/**
 * Lista membros para filtros, responsáveis e permissões visuais.
 * @param {string} projectId
 * @param {string} userId
 */
export async function listProjectMembers(projectId, userId) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()

  if (!remote) {
    const { project } = findLocalProject(projectId)
    if (!project) return []
    const users = getUsers()
    return (project.memberIds || []).map((id) => {
      const u = users.find((x) => x.id === id)
      return {
        id,
        name: resolveDisplayName(u?.name),
        email: u?.email ?? '',
        accentColor: normalizeAccentColor(u?.accentColor) ?? null,
      }
    })
  }

  const { data: mems, error: mErr } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
  if (mErr) throw mErr
  const ids = [...new Set((mems ?? []).map((m) => m.user_id))]
  const map = await fetchProfilesDisplayMapByIds(ids)
  const messageHints = await fetchMemberNameHintsFromMessages(projectId, ids)
  return ids.map((id) => {
    const row = map[id]
    return {
      id,
      name: resolveDisplayName(row?.name || messageHints[id]),
      email: '',
      accentColor: row?.accentColor ?? null,
    }
  })
}

/**
 * Carrega tarefas, comentários e atividades do projeto.
 * É o "bundle" principal que alimenta o Kanban.
 * @param {string} projectId
 * @param {string} userId
 */
export async function loadKanbanBundle(projectId, userId) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()

  if (!remote) {
    const { project } = findLocalProject(projectId)
    if (!project) return { tasks: [], comments: [], activity: [] }
    const k = ensureLocalKanban(project)
    return {
      tasks: [...k.tasks],
      comments: [...k.taskComments].map((c) => ({
        ...c,
        userAccentColor: c.userAccentColor ?? localUserAccent(c.userId),
      })),
      activity: [...k.taskActivity]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((a) => ({
          ...a,
          actorAccentColor: a.actorAccentColor ?? (a.actorId ? localUserAccent(a.actorId) : null),
        })),
    }
  }

  const { data: taskRows, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
  if (tErr) throw tErr
  const tasks = (taskRows ?? []).map(mapTaskRow).filter(Boolean)
  const taskIds = tasks.map((t) => t.id)
  let comments = []
  if (taskIds.length > 0) {
    const { data: cRows, error: cErr } = await supabase
      .from('task_comments')
      .select('*')
      .eq('project_id', projectId)
      .in('task_id', taskIds)
      .order('created_at', { ascending: true })
    if (cErr) throw cErr
    const uids = [...new Set((cRows ?? []).map((r) => r.user_id))]
    const dm = await profileDisplayMap(uids)
    comments = (cRows ?? []).map((r) => mapCommentRow(r, dm))
  }

  const { data: aRows, error: aErr } = await supabase
    .from('task_activity')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (aErr) throw aErr
  const actorIds = [...new Set((aRows ?? []).map((r) => r.actor_id).filter(Boolean))]
  const adm = await profileDisplayMap(actorIds)
  const activity = (aRows ?? []).map((r) => mapActivityRow(r, adm))

  return { tasks, comments, activity }
}

/** Reconhece quando a instalação ainda não tem tabelas opcionais do Kanban. */
function isMissingTableError(error) {
  if (!error) return false
  const msg = String(error.message || '')
  const code = error.code || ''
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /could not find the table|schema cache|does not exist|404/i.test(msg)
  )
}

function isMissingRpcError(error, fnName) {
  if (!error) return false
  const msg = String(error.message || '')
  const code = error.code || ''
  return code === 'PGRST202' || (msg.includes(fnName) && /function|schema cache|not find/i.test(msg))
}

/** Busca notificações do usuário logado; tabela ausente não quebra o app. */
export async function listMyNotifications(userId, limit = 40) {
  if (!isRemoteCollab() || !supabase) return []
  const { data, error } = await supabase
    .from('app_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []).map(mapNotifRow)
}

/**
 * Marca notificações como lidas após o usuário abrir o menu.
 * @param {string} userId
 * @param {string[]} ids
 */
export async function markNotificationsRead(userId, ids) {
  if (!ids?.length) return
  if (!isRemoteCollab() || !supabase) return
  const { error } = await supabase
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids)
  if (error && !isMissingTableError(error)) throw error
}

async function insertNotificationRemote({ userId, projectId, taskId, kind, title, body }) {
  if (!isRemoteCollab() || !supabase) return
  const { error } = await supabase.from('app_notifications').insert({
    user_id: userId,
    project_id: projectId,
    task_id: taskId,
    kind,
    title,
    body: body ?? '',
  })
  if (error) console.warn('notif insert', error)
}

/** Escreve histórico da tarefa no Supabase. */
async function logActivityRemote(projectId, taskId, actorId, action, detail) {
  if (!isRemoteCollab() || !supabase) return
  const { error } = await supabase.from('task_activity').insert({
    project_id: projectId,
    task_id: taskId,
    actor_id: actorId,
    action,
    detail: detail ?? {},
  })
  if (error) console.warn('activity insert', error)
}

/** Escreve histórico da tarefa no modo local. */
function logActivityLocal(projectId, taskId, actorId, actorName, action, detail) {
  saveLocalProjectPatch(projectId, (p) => {
    const row = {
      id: newId(false),
      taskId,
      projectId,
      actorId,
      actorName: actorName ?? 'Eu',
      action,
      detail: detail ?? {},
      createdAt: Date.now(),
    }
    return { ...p, taskActivity: [row, ...(p.taskActivity || [])].slice(0, 300) }
  })
}

/**
 * Cria uma tarefa nova na primeira coluna do Kanban.
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {string} opts.userId
 * @param {string} opts.userName
 * @param {string} opts.title
 */
export async function createTask({ projectId, userId, userName, title }) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Título obrigatório.')

  if (!remote) {
    const task = {
      id: newId(false),
      projectId,
      title: trimmed,
      description: '',
      status: 'todo',
      assigneeId: null,
      dueDate: null,
      priority: 'medium',
      sortOrder: Date.now(),
      meta: {},
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    saveLocalProjectPatch(projectId, (p) => ({
      ...p,
      tasks: [...(p.tasks || []), task],
    }))
    logActivityLocal(projectId, task.id, userId, userName, 'task_created', { title: trimmed })
    return task
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      title: trimmed,
      description: '',
      status: 'todo',
      priority: 'medium',
      sort_order: Date.now() % 100000,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const task = mapTaskRow(data)
  await logActivityRemote(projectId, task.id, userId, 'task_created', { title: trimmed })
  return task
}

/**
 * Atualiza uma tarefa e registra mudanças importantes no histórico.
 * @param {object} patch
 */
export async function updateTask(projectId, userId, userName, prevTask, patch) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()

  const next = { ...prevTask, ...patch, updatedAt: Date.now() }

  if (!remote) {
    saveLocalProjectPatch(projectId, (p) => ({
      ...p,
      tasks: (p.tasks || []).map((t) => (t.id === prevTask.id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    }))
    if (patch.status != null && patch.status !== prevTask.status) {
      logActivityLocal(projectId, prevTask.id, userId, userName, 'status_change', {
        from: prevTask.status,
        to: patch.status,
      })
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== prevTask.assigneeId) {
      logActivityLocal(projectId, prevTask.id, userId, userName, 'assignee_change', {
        from: prevTask.assigneeId,
        to: patch.assigneeId,
      })
    }
    if (patch.priority != null && patch.priority !== prevTask.priority) {
      logActivityLocal(projectId, prevTask.id, userId, userName, 'priority_change', {
        from: prevTask.priority,
        to: patch.priority,
      })
    }
    if (patch.dueDate !== undefined && patch.dueDate !== prevTask.dueDate) {
      logActivityLocal(projectId, prevTask.id, userId, userName, 'due_change', {
        from: prevTask.dueDate,
        to: patch.dueDate,
      })
    }
    if (patch.status === 'done' && prevTask.status !== 'done') {
      logActivityLocal(projectId, prevTask.id, userId, userName, 'completed', {})
    }
    return next
  }

  // Converte nomes camelCase do React para nomes snake_case usados nas tabelas.
  const dbPatch = {}
  if (patch.title != null) dbPatch.title = patch.title
  if (patch.description != null) dbPatch.description = patch.description
  if (patch.status != null) dbPatch.status = patch.status
  if (patch.assigneeId !== undefined) dbPatch.assignee_id = patch.assigneeId
  if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate
  if (patch.priority != null) dbPatch.priority = patch.priority
  if (patch.sortOrder != null) dbPatch.sort_order = patch.sortOrder
  if (patch.meta != null) dbPatch.meta = patch.meta

  const { data, error } = await supabase
    .from('tasks')
    .update({ ...dbPatch, updated_at: new Date().toISOString() })
    .eq('id', prevTask.id)
    .eq('project_id', projectId)
    .select('*')
    .single()
  if (error) throw error
  const updated = mapTaskRow(data)

  if (patch.status != null && patch.status !== prevTask.status) {
    await logActivityRemote(projectId, prevTask.id, userId, 'status_change', {
      from: prevTask.status,
      to: patch.status,
    })
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== prevTask.assigneeId) {
    await logActivityRemote(projectId, prevTask.id, userId, 'assignee_change', {
      from: prevTask.assigneeId,
      to: patch.assigneeId,
    })
    if (patch.assigneeId) {
      // Atribuição nova vira notificação para o responsável.
      await insertNotificationRemote({
        userId: patch.assigneeId,
        projectId,
        taskId: prevTask.id,
        kind: 'assigned',
        title: 'Nova atribuição',
        body: `${userName} atribuiu a tarefa "${prevTask.title}" a você.`,
      })
    }
  }
  if (patch.priority != null && patch.priority !== prevTask.priority) {
    await logActivityRemote(projectId, prevTask.id, userId, 'priority_change', {
      from: prevTask.priority,
      to: patch.priority,
    })
  }
  if (patch.dueDate !== undefined && patch.dueDate !== prevTask.dueDate) {
    await logActivityRemote(projectId, prevTask.id, userId, 'due_change', {
      from: prevTask.dueDate,
      to: patch.dueDate,
    })
  }
  if (patch.status === 'done' && prevTask.status !== 'done') {
    await logActivityRemote(projectId, prevTask.id, userId, 'completed', {})
  }

  return updated
}

/**
 * Reordena e move tarefas em lote (Kanban DnD).
 * @param {string} projectId
 * @param {string} userId
 * @param {{ id: string, status: string, sortOrder: number }[]} ordered
 */
export async function reorderTasks(projectId, userId, ordered) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()
  if (!ordered?.length) return

  if (!remote) {
    saveLocalProjectPatch(projectId, (p) => {
      const map = new Map(ordered.map((o) => [o.id, o]))
      const tasks = (p.tasks || []).map((t) => {
        const o = map.get(t.id)
        return o ? { ...t, status: o.status, sortOrder: o.sortOrder, updatedAt: Date.now() } : t
      })
      return { ...p, tasks }
    })
    return
  }

  const stamp = new Date().toISOString()
  // RPC reduz o risco de delay: várias linhas são atualizadas em uma chamada só.
  const { error: rpcError } = await supabase.rpc('reorder_project_tasks', {
    p_project_id: projectId,
    p_items: ordered.map((o) => ({
      id: o.id,
      status: o.status,
      sortOrder: o.sortOrder,
    })),
  })

  if (!rpcError) return
  if (!isMissingRpcError(rpcError, 'reorder_project_tasks')) throw rpcError

  // Fallback para bancos que ainda não receberam a RPC.
  for (const o of ordered) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: o.status, sort_order: o.sortOrder, updated_at: stamp })
      .eq('id', o.id)
      .eq('project_id', projectId)
    if (error) throw error
  }
}

/**
 * Remove tarefa e seus comentários/atividades no modo local.
 * @param {string} projectId
 * @param {string} userId
 * @param {string} userName
 * @param {object} task
 */
export async function deleteTask(projectId, userId, userName, task) {
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()

  if (!remote) {
    saveLocalProjectPatch(projectId, (p) => ({
      ...p,
      tasks: (p.tasks || []).filter((t) => t.id !== task.id),
      taskComments: (p.taskComments || []).filter((c) => c.taskId !== task.id),
      taskActivity: (p.taskActivity || []).filter((a) => a.taskId !== task.id),
    }))
    logActivityLocal(projectId, task.id, userId, userName, 'task_deleted', { title: task.title })
    return
  }

  await logActivityRemote(projectId, task.id, userId, 'task_deleted', { title: task.title })
  const { error } = await supabase.from('tasks').delete().eq('id', task.id).eq('project_id', projectId)
  if (error) throw error
}

/**
 * Adiciona comentário e, se houver responsável diferente, gera notificação.
 * @param {object} opts
 */
export async function addTaskComment({ projectId, userId, userName, task, body }) {
  await assertProjectMember(projectId, userId)
  const text = body.trim()
  if (!text) throw new Error('Comentário vazio.')
  const remote = isRemoteCollab()

  if (!remote) {
    const row = {
      id: newId(false),
      taskId: task.id,
      projectId,
      userId,
      userName,
      body: text,
      createdAt: Date.now(),
    }
    saveLocalProjectPatch(projectId, (p) => ({
      ...p,
      taskComments: [...(p.taskComments || []), row],
    }))
    logActivityLocal(projectId, task.id, userId, userName, 'comment_added', { preview: text.slice(0, 120) })
    return row
  }

  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      project_id: projectId,
      task_id: task.id,
      user_id: userId,
      body: text,
    })
    .select('*')
    .single()
  if (error) throw error
  const dm = await profileDisplayMap([userId])
  const comment = mapCommentRow(data, dm)
  await logActivityRemote(projectId, task.id, userId, 'comment_added', { preview: text.slice(0, 120) })

  if (task.assigneeId && task.assigneeId !== userId) {
    await insertNotificationRemote({
      userId: task.assigneeId,
      projectId,
      taskId: task.id,
      kind: 'comment',
      title: 'Novo comentário',
      body: `${userName} comentou em "${task.title}".`,
    })
  }

  return comment
}

/** Registra mudança de coluna no Kanban (histórico). */
export async function recordTaskStatusChange(projectId, userId, userName, taskId, from, to) {
  if (from === to) return
  await assertProjectMember(projectId, userId)
  const remote = isRemoteCollab()
  if (!remote) {
    logActivityLocal(projectId, taskId, userId, userName, 'status_change', { from, to })
    return
  }
  await logActivityRemote(projectId, taskId, userId, 'status_change', { from, to })
}

/**
 * Assina mudanças de tarefas/comentários/histórico para manter o Kanban atualizado.
 * @param {string} projectId
 * @param {(payload: { tasks?: boolean }) => void} onChange
 */
export function subscribeTaskChannels(projectId, onChange) {
  if (!isRemoteCollab() || !supabase) return () => {}

  const channel = supabase
    .channel(`kanban:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      () => onChange({ tasks: true })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'task_comments', filter: `project_id=eq.${projectId}` },
      () => onChange({ tasks: true })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'task_activity', filter: `project_id=eq.${projectId}` },
      () => onChange({ tasks: true })
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') return
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[OrgDemandas] Realtime (Kanban):', status, err?.message ?? err ?? '')
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Canal de Realtime separado para o menu de notificações. */
export function subscribeNotificationChannel(userId, onChange) {
  if (!isRemoteCollab() || !supabase || !userId) return () => {}
  const channel = supabase
    .channel(`notif:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

/** @param {string} isoDate yyyy-mm-dd */
export function isTaskOverdue(task) {
  if (!task?.dueDate || task.status === 'done') return false
  const d = new Date(task.dueDate + 'T23:59:59')
  return d.getTime() < Date.now()
}

/**
 * Exporta CSV das tarefas do projeto (após load).
 * @param {object[]} tasks
 * @param {Map<string,string>} assigneeNames
 */
export function tasksToCsv(tasks, assigneeNames) {
  const header = ['id', 'titulo', 'status', 'prioridade', 'responsavel', 'prazo', 'descricao']
  const rows = tasks.map((t) => [
    t.id,
    csvEscape(t.title),
    t.status,
    t.priority,
    csvEscape(assigneeNames.get(t.assigneeId) ?? ''),
    t.dueDate ?? '',
    csvEscape(t.description ?? ''),
  ])
  return [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
}

function csvEscape(s) {
  const x = String(s ?? '').replace(/"/g, '""')
  if (/[;\n"]/.test(x)) return `"${x}"`
  return x
}

/** Insights simples a partir de tarefas + atividade (sem ML). */
export function computeInsights(tasks, activity, userId) {
  const overdue = tasks.filter((t) => isTaskOverdue(t))
  const unassigned = tasks.filter((t) => !t.assigneeId && t.status !== 'done')
  const byStatus = TASK_STATUSES.map((s) => ({
    id: s.id,
    label: s.label,
    count: tasks.filter((t) => t.status === s.id).length,
  }))

  const myOpen = tasks.filter(
    (t) => t.assigneeId === userId && t.status !== 'done'
  ).length

  const weekAgo = Date.now() - 7 * 86400000
  const completionsWeek = (activity || []).filter(
    (a) => a.action === 'completed' && a.createdAt >= weekAgo
  ).length

  const suggestions = []
  if (unassigned.length >= 2) {
    suggestions.push(`Há ${unassigned.length} tarefas sem responsável — defina um dono para destravar o fluxo.`)
  }
  if (overdue.length >= 1) {
    suggestions.push(`${overdue.length} tarefa(s) com prazo vencido precisam de atenção.`)
  }
  if (tasks.length >= 5 && byStatus.find((b) => b.id === 'review')?.count >= 3) {
    suggestions.push('Muitas tarefas em revisão: combine critérios de aceite com o time.')
  }
  if (suggestions.length === 0 && tasks.length >= 3) {
    suggestions.push('Bom ritmo! Que tal revisar prioridades altas na segunda coluna?')
  }

  const hourBuckets = Array(24).fill(0)
  for (const a of activity || []) {
    if (a.action !== 'completed' || !a.createdAt) continue
    const h = new Date(a.createdAt).getHours()
    hourBuckets[h] += 1
  }
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets))
  const productivityHint =
    Math.max(...hourBuckets) > 0
      ? `Conclusões registradas costumam concentrar-se por volta das ${peakHour}h (ajuste fino com mais dados).`
      : 'Ainda poucas conclusões registradas — ao mover para Concluído, o histórico fica mais rico.'

  const fridayLate = (activity || []).filter((a) => {
    if (a.action !== 'status_change' || !a.detail?.to) return false
    const d = new Date(a.createdAt)
    return d.getDay() === 5 && a.detail.to === 'done'
  }).length

  return {
    byStatus,
    overdueCount: overdue.length,
    unassignedCount: unassigned.length,
    myOpen,
    completionsWeek,
    suggestions,
    productivityHint,
    fridayDoneHint:
      fridayLate > 0
        ? 'Várias entregas foram concluídas às sextas — monitore carga nesse dia.'
        : null,
  }
}

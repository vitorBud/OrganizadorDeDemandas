import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, ExternalLink, GripVertical, MessageSquare, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isRemoteCollab } from '../lib/collabApi'
import { REMOTE_POLL_INTERVAL_MS } from '../lib/remoteSync'
import { accentColorForDisplay } from '../lib/userColor'
import {
  TASK_STATUSES,
  PRIORITIES,
  loadKanbanBundle,
  listProjectMembers,
  createTask,
  reorderTasks,
  recordTaskStatusChange,
  subscribeTaskChannels,
  isTaskOverdue,
} from '../lib/tasksApi'
import { TaskDetailModal } from './TaskDetailModal'
import './KanbanBoard.css'

const STATUS_IDS = TASK_STATUSES.map((s) => s.id)

/** Metadados visuais da prioridade, com fallback para média. */
function priorityMeta(id) {
  return PRIORITIES.find((p) => p.id === id) ?? PRIORITIES[1]
}

/** Cor fixa da borda lateral que permite escanear prioridade rapidamente. */
function priorityBorderColor(id) {
  if (id === 'high') return '#ef4444'
  if (id === 'low') return '#22c55e'
  return '#eab308'
}

/** Card arrastável de uma tarefa. O dnd-kit injeta refs/listeners para o drag funcionar. */
function SortableTaskCard({ task, members, commentCount, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const assignee = members.find((m) => m.id === task.assigneeId)
  const creator = members.find((m) => m.id === task.createdBy)
  const overdue = isTaskOverdue(task)
  const pr = priorityMeta(task.priority)
  const priorityColor = priorityBorderColor(task.priority)
  const description = task.description?.trim()
  const shortDescription =
    description && description.length > 96 ? `${description.slice(0, 96)}...` : description
  const creatorName = creator?.name || '—'
  const dueText = task.dueDate ? (overdue ? `Atrasada ${task.dueDate}` : task.dueDate) : 'Sem prazo'

  const assigneeColor = assignee
    ? accentColorForDisplay(assignee.accentColor, assignee.id)
    : null
  const creatorColor = creator
    ? accentColorForDisplay(creator.accentColor, creator.id)
    : null
  const barColor = assigneeColor || creatorColor

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    borderColor: priorityColor,
    borderLeftWidth: '4px',
    ...(barColor ? { boxShadow: `inset 0 0 0 1px ${barColor}22, var(--shadow)` } : {}),
  }

  return (
    <article ref={setNodeRef} style={style} className={`kanban-card${overdue ? ' kanban-card--overdue' : ''}`}>
      <div className="kanban-card__topline">
        <button
          type="button"
          className="kanban-card__handle"
          {...attributes}
          {...listeners}
          aria-label="Arrastar tarefa"
          title="Arrastar"
        >
          <GripVertical size={16} strokeWidth={2.35} aria-hidden />
        </button>
        <span className="kanban-card__priority-chip" title={`Prioridade: ${pr.label}`}>
          <span aria-hidden>{pr.emoji}</span>
          <span>{pr.label}</span>
        </span>
        <button
          type="button"
          className="kanban-card__open"
          onClick={() => onOpen(task)}
          aria-label={`Abrir demanda ${task.title}`}
          title="Abrir demanda"
        >
          <ExternalLink size={14} strokeWidth={2.3} aria-hidden />
          <span>Abrir</span>
        </button>
      </div>
      <h3 className="kanban-card__title">{task.title}</h3>
      {shortDescription ? <p className="kanban-card__desc">{shortDescription}</p> : null}
      <div className="kanban-card__quick">
        <span className={`kanban-card__chip${overdue ? ' kanban-card__chip--danger' : ''}`}>
          <CalendarDays size={14} strokeWidth={2.25} aria-hidden />
          {task.dueDate ? <time dateTime={task.dueDate}>{dueText}</time> : <span>{dueText}</span>}
        </span>
        <span className="kanban-card__chip" title="Comentários">
          <MessageSquare size={14} strokeWidth={2.25} aria-hidden />
          <span>{commentCount}</span>
        </span>
      </div>
      <div className="kanban-card__people">
        {assignee ? (
          <span className="kanban-card__person" title={`Responsável: ${assignee.name}`}>
            <span
              className="kanban-card__avatar"
              aria-hidden
              style={{
                background: `${assigneeColor}33`,
                color: assigneeColor,
                borderColor: `${assigneeColor}66`,
              }}
            >
              {(assignee.name || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="kanban-card__person-name" style={{ color: assigneeColor }}>
              {assignee.name}
            </span>
          </span>
        ) : (
          <span className="kanban-card__person kanban-card__person--muted">
            <UserRound size={14} strokeWidth={2.25} aria-hidden />
            <span>Sem responsável</span>
          </span>
        )}
        <span className="kanban-card__creator" title={`Criada por: ${creatorName}`}>
          Criada por {creatorName}
        </span>
      </div>
    </article>
  )
}

/** Coluna do Kanban e também área de destino para soltar cards. */
function KanbanColumn({ statusId, label, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId })
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column${isOver ? ' kanban-column--over' : ''}`}
      aria-label={`${label}, ${count} demandas`}
    >
      <header className="kanban-column__head">
        <h2 className="kanban-column__title">{label}</h2>
        <span className="kanban-column__count">{count}</span>
      </header>
      <div className="kanban-column__body">{children}</div>
    </section>
  )
}

/**
 * Quadro Kanban do projeto.
 * Controla filtros, criação rápida, drag-and-drop e sincronização com outras pessoas.
 * @param {object} props
 * @param {string} props.projectId
 * @param {{ id: string, name: string, accentColor?: string | null }} props.user
 * @param {string | null} props.openTaskId
 * @param {(id: string | null) => void} props.onOpenTaskId
 */
export function KanbanBoard({ projectId, user, openTaskId, onOpenTaskId }) {
  const { profilesRemoteTick } = useAuth()
  const { id: userId, name: userName } = user
  const [tasks, setTasks] = useState([])
  const [comments, setComments] = useState([])
  const [activity, setActivity] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterText, setFilterText] = useState('')
  const pollBusyRef = useRef(false)
  const draggingRef = useRef(false)
  const reorderBusyRef = useRef(false)
  const deferredReloadRef = useRef(false)

  const remote = isRemoteCollab()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const reload = useCallback(async () => {
    // Carrega tarefas, comentários, histórico e membros em uma rodada.
    if (!projectId || !userId) return
    try {
      const bundle = await loadKanbanBundle(projectId, userId)
      let mems = null
      let memberError = null
      try {
        mems = await listProjectMembers(projectId, userId)
      } catch (e) {
        memberError = e
      }
      if (draggingRef.current || reorderBusyRef.current) {
        // Se chegar atualização remota durante o drag, espera terminar para evitar "voltar card".
        deferredReloadRef.current = true
        return
      }
      setTasks(bundle.tasks)
      setComments(bundle.comments)
      setActivity(bundle.activity)
      if (mems) setMembers(mems)
      if (memberError) throw memberError
      setError('')
    } catch (e) {
      console.error(e)
      setError(
        e?.message?.includes('tasks')
          ? 'Tabelas de tarefas não encontradas. Rode supabase/tasks_schema.sql no painel.'
          : e?.message || 'Erro ao carregar o Kanban.'
      )
    } finally {
      setLoading(false)
    }
  }, [projectId, userId])

  const requestReload = useCallback(() => {
    // Realtime chama isto; pode executar agora ou deixar pendente durante drag/reorder.
    if (draggingRef.current || reorderBusyRef.current) {
      deferredReloadRef.current = true
      return
    }
    void reload()
  }, [reload])

  const flushDeferredReload = useCallback(() => {
    // Depois de salvar uma movimentação, aplica qualquer reload que ficou pendente.
    if (!deferredReloadRef.current || reorderBusyRef.current) return
    deferredReloadRef.current = false
    void reload()
  }, [reload])

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      await reload()
      if (!alive) return
    })()
    return () => {
      alive = false
    }
  }, [reload])

  useEffect(() => {
    if (!remote || !projectId) return
    // Realtime avisa quando outra pessoa mexe no Kanban.
    return subscribeTaskChannels(projectId, () => {
      requestReload()
    })
  }, [remote, projectId, requestReload])

  useEffect(() => {
    if (profilesRemoteTick === 0) return
    if (!remote || !projectId || !userId) return
    queueMicrotask(() => {
      requestReload()
    })
  }, [profilesRemoteTick, remote, projectId, userId, requestReload])

  useEffect(() => {
    if (!remote || !projectId) return
    // Polling serve como rede de segurança caso algum evento Realtime atrase.
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (draggingRef.current) return
      if (reorderBusyRef.current) {
        deferredReloadRef.current = true
        return
      }
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
  }, [remote, projectId, reload])

  const grouped = useMemo(() => {
    // Aplica filtros e monta as quatro colunas do Kanban.
    const g = { todo: [], in_progress: [], review: [], done: [] }
    const ft = filterText.trim().toLowerCase()
    for (const t of tasks) {
      if (filterAssignee && t.assigneeId !== filterAssignee) continue
      if (filterPriority && t.priority !== filterPriority) continue
      if (ft && !(t.title + (t.description || '')).toLowerCase().includes(ft)) continue
      g[t.status]?.push(t)
    }
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    }
    return g
  }, [tasks, filterAssignee, filterPriority, filterText])

  const commentCountByTask = useMemo(() => {
    const map = new Map()
    for (const c of comments) {
      map.set(c.taskId, (map.get(c.taskId) ?? 0) + 1)
    }
    return map
  }, [comments])

  const activeTask = useMemo(() => tasks.find((t) => t.id === activeId), [tasks, activeId])

  const applyReorder = async (nextTasks, statusChange) => {
    // Atualização otimista: primeiro move na tela, depois persiste no backend.
    setTasks(nextTasks)
    const ordered = nextTasks.map((t) => ({ id: t.id, status: t.status, sortOrder: t.sortOrder }))
    reorderBusyRef.current = true
    try {
      await reorderTasks(projectId, userId, ordered)
      if (
        statusChange &&
        statusChange.from &&
        statusChange.to &&
        statusChange.from !== statusChange.to &&
        statusChange.taskId
      ) {
        await recordTaskStatusChange(
          projectId,
          userId,
          userName,
          statusChange.taskId,
          statusChange.from,
          statusChange.to
        )
      }
      deferredReloadRef.current = true
    } catch (e) {
      console.error(e)
      deferredReloadRef.current = true
    } finally {
      reorderBusyRef.current = false
      flushDeferredReload()
    }
  }

  const handleDragStart = (event) => {
    draggingRef.current = true
    setActiveId(String(event.active.id))
  }

  const handleDragCancel = () => {
    draggingRef.current = false
    setActiveId(null)
    flushDeferredReload()
  }

  const handleDragEnd = (event) => {
    // Calcula se foi reordenação na mesma coluna ou mudança entre colunas.
    const { active, over } = event
    draggingRef.current = false
    setActiveId(null)
    if (!over) {
      flushDeferredReload()
      return
    }

    const aId = String(active.id)
    const oId = String(over.id)
    if (aId === oId) {
      flushDeferredReload()
      return
    }

    const activeTaskRow = tasks.find((t) => t.id === aId)
    if (!activeTaskRow) {
      flushDeferredReload()
      return
    }

    const containerOf = (id) => {
      if (STATUS_IDS.includes(id)) return id
      return tasks.find((t) => t.id === id)?.status
    }

    const from = activeTaskRow.status
    const to = containerOf(oId)
    if (!to) {
      flushDeferredReload()
      return
    }

    const base = tasks.filter((t) => t.id !== aId)

    if (from === to) {
      const col = tasks.filter((t) => t.status === from).sort((a, b) => a.sortOrder - b.sortOrder)
      const oldIndex = col.findIndex((t) => t.id === aId)
      const newIndex = col.findIndex((t) => t.id === oId)
      if (oldIndex < 0 || newIndex < 0) {
        flushDeferredReload()
        return
      }
      const reordered = arrayMove(col, oldIndex, newIndex).map((t, i) => ({ ...t, sortOrder: i }))
      const next = [...base.filter((t) => t.status !== from), ...reordered]
      void applyReorder(next)
      return
    }

    const fromCol = base.filter((t) => t.status === from).sort((a, b) => a.sortOrder - b.sortOrder)
    const toCol = base.filter((t) => t.status === to).sort((a, b) => a.sortOrder - b.sortOrder)
    const moving = { ...activeTaskRow, status: to }
    let insertAt = toCol.length
    if (!STATUS_IDS.includes(oId)) {
      const j = toCol.findIndex((t) => t.id === oId)
      if (j >= 0) insertAt = j
    }
    const newTo = [...toCol.slice(0, insertAt), moving, ...toCol.slice(insertAt)].map((t, i) => ({
      ...t,
      sortOrder: i,
    }))
    const newFrom = fromCol.map((t, i) => ({ ...t, sortOrder: i }))
    const rest = base.filter((t) => t.status !== from && t.status !== to)
    const next = [...rest, ...newFrom, ...newTo]
    void applyReorder(next, { taskId: aId, from, to })
  }

  const handleCreate = async (e) => {
    // Criação rápida sempre nasce em "A fazer"; detalhes ficam no modal.
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    try {
      await createTask({ projectId, userId, userName, title: t })
      setNewTitle('')
      await reload()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Não foi possível criar a tarefa.')
    }
  }

  const selectedTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : null

  if (loading) {
    return (
      <div className="kanban-root kanban-root--loading">
        <p>Carregando demandas…</p>
      </div>
    )
  }

  return (
    <div className="kanban-root">
      {error ? <p className="kanban-root__error">{error}</p> : null}

      <div className="kanban-toolbar">
        <form onSubmit={handleCreate} className="kanban-new">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nova tarefa…"
            className="kanban-new__input"
            aria-label="Título da nova tarefa"
          />
          <button type="submit" className="btn btn--primary btn--sm">
            Adicionar
          </button>
        </form>

        <div className="kanban-filters">
          <label className="kanban-filters__field">
            <span>Busca</span>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Título ou descrição"
            />
          </label>
          <label className="kanban-filters__field">
            <span>Responsável</span>
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
              <option value="">Todos</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="kanban-filters__field">
            <span>Prioridade</span>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              <option value="">Todas</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns">
          {TASK_STATUSES.map(({ id: colId, label }) => (
            <KanbanColumn key={colId} statusId={colId} label={label} count={grouped[colId].length}>
              <SortableContext items={grouped[colId].map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul className="kanban-column__list">
                  {grouped[colId].map((task) => (
                    <li key={task.id}>
                      <SortableTaskCard
                        task={task}
                        members={members}
                        commentCount={commentCountByTask.get(task.id) ?? 0}
                        onOpen={(t) => onOpenTaskId(t.id)}
                      />
                    </li>
                  ))}
                </ul>
              </SortableContext>
              {grouped[colId].length === 0 ? <p className="kanban-column__empty">Arraste tarefas aqui</p> : null}
            </KanbanColumn>
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="kanban-card kanban-card--overlay">
              <div className="kanban-card__topline">
                <span className="kanban-card__priority-chip">
                  <span aria-hidden>{priorityMeta(activeTask.priority).emoji}</span>
                  <span>{priorityMeta(activeTask.priority).label}</span>
                </span>
              </div>
              <h3 className="kanban-card__title">{activeTask.title}</h3>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTask ? (
        <TaskDetailModal
          projectId={projectId}
          user={{ id: userId, name: userName }}
          task={selectedTask}
          members={members}
          comments={comments.filter((c) => c.taskId === selectedTask.id)}
          activity={activity.filter((a) => a.taskId === selectedTask.id)}
          onClose={() => onOpenTaskId(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  )
}

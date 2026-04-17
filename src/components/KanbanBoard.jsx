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

function priorityMeta(id) {
  return PRIORITIES.find((p) => p.id === id) ?? PRIORITIES[1]
}

function priorityBorderColor(id) {
  if (id === 'high') return '#ef4444'
  if (id === 'low') return '#22c55e'
  return '#eab308'
}

function statusLabel(id) {
  return TASK_STATUSES.find((s) => s.id === id)?.label ?? id
}

function SortableTaskCard({ task, members, commentCount, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const assignee = members.find((m) => m.id === task.assigneeId)
  const creator = members.find((m) => m.id === task.createdBy)
  const overdue = isTaskOverdue(task)
  const pr = priorityMeta(task.priority)
  const priorityColor = priorityBorderColor(task.priority)

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
      <div className="kanban-card__row">
        <button
          type="button"
          className="kanban-card__handle"
          {...attributes}
          {...listeners}
          aria-label="Arrastar tarefa"
          title="Arrastar"
        >
          ⠿
        </button>
        <button type="button" className="kanban-card__open" onClick={() => onOpen(task)}>
          Abrir
        </button>
      </div>
      <div className="kanban-card__head">
        <span className="kanban-card__priority" title={pr.label}>
          {pr.emoji}
        </span>
        <h3 className="kanban-card__title">{task.title}</h3>
      </div>
      <div className="kanban-card__meta">
        <span>Status: {statusLabel(task.status)}</span>
        <span>Prioridade: {pr.label}</span>
      </div>
      {task.description ? <p className="kanban-card__desc">{task.description.slice(0, 120)}</p> : null}
      {task.dueDate ? (
        <time className="kanban-card__due" dateTime={task.dueDate}>
          Prazo: {task.dueDate}
          {overdue ? ' · atrasada' : ''}
        </time>
      ) : null}
      {assignee ? (
        <div className="kanban-card__assignee">
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
          <span className="kanban-card__assignee-name" style={{ color: assigneeColor }}>
            Responsável: {assignee.name}
          </span>
        </div>
      ) : (
        <p className="kanban-card__unassigned">Sem responsável</p>
      )}
      <div className="kanban-card__foot">
        <span>Criada por: {creator?.name || '—'}</span>
        <span>Comentários: {commentCount}</span>
      </div>
    </article>
  )
}

function KanbanColumn({ statusId, label, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: statusId })
  return (
    <section
      ref={setNodeRef}
      className={`kanban-column${isOver ? ' kanban-column--over' : ''}`}
      aria-label={label}
    >
      <header className="kanban-column__head">
        <h2 className="kanban-column__title">{label}</h2>
      </header>
      <div className="kanban-column__body">{children}</div>
    </section>
  )
}

/**
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

  const remote = isRemoteCollab()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  const reload = useCallback(async () => {
    if (!projectId || !userId) return
    try {
      const bundle = await loadKanbanBundle(projectId, userId)
      setTasks(bundle.tasks)
      setComments(bundle.comments)
      setActivity(bundle.activity)
      const mems = await listProjectMembers(projectId, userId)
      setMembers(mems)
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
    return subscribeTaskChannels(projectId, () => {
      void reload()
    })
  }, [remote, projectId, reload])

  useEffect(() => {
    if (profilesRemoteTick === 0) return
    if (!remote || !projectId || !userId) return
    queueMicrotask(() => {
      void reload()
    })
  }, [profilesRemoteTick, remote, projectId, userId, reload])

  useEffect(() => {
    if (!remote || !projectId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (draggingRef.current) return
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
    setTasks(nextTasks)
    const ordered = nextTasks.map((t) => ({ id: t.id, status: t.status, sortOrder: t.sortOrder }))
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
    } catch (e) {
      console.error(e)
      void reload()
    }
  }

  const handleDragStart = (event) => {
    draggingRef.current = true
    setActiveId(String(event.active.id))
  }

  const handleDragCancel = () => {
    draggingRef.current = false
    setActiveId(null)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    draggingRef.current = false
    setActiveId(null)
    if (!over) return

    const aId = String(active.id)
    const oId = String(over.id)
    if (aId === oId) return

    const activeTaskRow = tasks.find((t) => t.id === aId)
    if (!activeTaskRow) return

    const containerOf = (id) => {
      if (STATUS_IDS.includes(id)) return id
      return tasks.find((t) => t.id === id)?.status
    }

    const from = activeTaskRow.status
    const to = containerOf(oId)
    if (!to) return

    const base = tasks.filter((t) => t.id !== aId)

    if (from === to) {
      const col = tasks.filter((t) => t.status === from).sort((a, b) => a.sortOrder - b.sortOrder)
      const oldIndex = col.findIndex((t) => t.id === aId)
      const newIndex = col.findIndex((t) => t.id === oId)
      if (oldIndex < 0 || newIndex < 0) return
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
            <KanbanColumn key={colId} statusId={colId} label={label}>
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
              <div className="kanban-card__head">
                <span className="kanban-card__priority">{priorityMeta(activeTask.priority).emoji}</span>
                <h3 className="kanban-card__title">{activeTask.title}</h3>
              </div>
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

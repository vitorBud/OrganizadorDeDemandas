import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TASK_STATUSES,
  PRIORITIES,
  updateTask,
  deleteTask,
  addTaskComment,
} from '../lib/tasksApi'
import './TaskDetailModal.css'

function actionLabel(action) {
  switch (action) {
    case 'task_created':
      return 'Tarefa criada'
    case 'status_change':
      return 'Status alterado'
    case 'assignee_change':
      return 'Responsável alterado'
    case 'priority_change':
      return 'Prioridade alterada'
    case 'due_change':
      return 'Prazo alterado'
    case 'completed':
      return 'Concluída'
    case 'comment_added':
      return 'Comentário'
    case 'task_deleted':
      return 'Tarefa removida'
    default:
      return action
  }
}

/**
 * @param {object} props
 */
export function TaskDetailModal({
  projectId,
  user,
  task,
  members,
  comments,
  activity,
  onClose,
  onSaved,
}) {
  const { id: userId, name: userName } = user
  const dialogRef = useRef(null)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [status, setStatus] = useState(task.status)
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '')
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [commentDraft, setCommentDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [pomodoroRunning, setPomodoroRunning] = useState(false)
  const [liveSec, setLiveSec] = useState(0)
  const pomStartRef = useRef(null)
  const pomAccumRef = useRef(task.meta?.pomodoroSeconds ?? 0)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description || '')
    setStatus(task.status)
    setAssigneeId(task.assigneeId ?? '')
    setDueDate(task.dueDate ?? '')
    setPriority(task.priority)
    pomAccumRef.current = task.meta?.pomodoroSeconds ?? 0
    setPomodoroRunning(false)
    pomStartRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sincronizar só ao mudar o id da tarefa
  }, [task.id])

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.createdAt - b.createdAt),
    [comments]
  )
  const sortedActivity = useMemo(
    () => [...activity].sort((a, b) => b.createdAt - a.createdAt),
    [activity]
  )

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!pomodoroRunning || !pomStartRef.current) {
      setLiveSec(0)
      return
    }
    const tick = () => {
      if (pomStartRef.current) {
        setLiveSec(Math.floor((Date.now() - pomStartRef.current) / 1000))
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pomodoroRunning])

  async function persistPomodoro(seconds) {
    const meta = { ...(task.meta || {}), pomodoroSeconds: seconds }
    try {
      await updateTask(projectId, userId, userName, task, { meta })
      pomAccumRef.current = seconds
      await onSaved()
    } catch (e) {
      console.error(e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const patch = {
        title: title.trim(),
        description,
        status,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
        priority,
      }
      await updateTask(projectId, userId, userName, task, patch)
      await onSaved()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Excluir esta tarefa?')) return
    try {
      await deleteTask(projectId, userId, userName, task)
      await onSaved()
      onClose()
    } catch (e) {
      console.error(e)
    }
  }

  const handleComment = async (e) => {
    e.preventDefault()
    const text = commentDraft.trim()
    if (!text) return
    try {
      await addTaskComment({ projectId, userId, userName, task, body: text })
      setCommentDraft('')
      await onSaved()
    } catch (err) {
      console.error(err)
    }
  }

  const togglePomodoro = async () => {
    if (pomodoroRunning && pomStartRef.current) {
      const add = Math.floor((Date.now() - pomStartRef.current) / 1000)
      pomAccumRef.current += add
      pomStartRef.current = null
      setPomodoroRunning(false)
      await persistPomodoro(pomAccumRef.current)
    } else {
      pomStartRef.current = Date.now()
      setPomodoroRunning(true)
    }
  }

  const displaySeconds = pomAccumRef.current + liveSec

  const formatDur = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m ${sec.toString().padStart(2, '0')}s`
  }

  const shareLink = `${window.location.origin}/app/projeto/${projectId}?task=${encodeURIComponent(task.id)}`

  const copyShare = () => {
    navigator.clipboard.writeText(shareLink).catch(() => {})
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="task-modal-overlay" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="task-modal__head">
          <h2 id="task-modal-title" className="task-modal__title">
            Detalhe da tarefa
          </h2>
          <button type="button" className="task-modal__close btn btn--ghost btn--sm" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="task-modal__grid">
          <div className="task-modal__main">
            <label className="task-modal__label">
              Título
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="task-modal__input" />
            </label>
            <label className="task-modal__label">
              Descrição
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="task-modal__textarea"
              />
            </label>

            <div className="task-modal__row">
              <label className="task-modal__label">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="task-modal__select">
                  {TASK_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-modal__label">
                Prioridade
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="task-modal__select"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="task-modal__row">
              <label className="task-modal__label">
                Responsável
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="task-modal__select"
                >
                  <option value="">Ninguém</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-modal__label">
                Prazo
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="task-modal__input"
                />
              </label>
            </div>

            <div className="task-modal__actions">
              <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void handleSave()}>
                Salvar alterações
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={copyShare}>
                Copiar link
              </button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger" onClick={() => void handleDelete()}>
                Excluir
              </button>
            </div>
            <p className="task-modal__hint">Link para compartilhar: {shareLink}</p>

            <section className="task-modal__section" aria-label="Pomodoro">
              <h3 className="task-modal__section-title">Timer (Pomodoro)</h3>
              <p className="task-modal__pomodoro-time">{formatDur(displaySeconds)}</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void togglePomodoro()}>
                {pomodoroRunning ? 'Pausar e salvar' : 'Iniciar'}
              </button>
            </section>
          </div>

          <aside className="task-modal__aside">
            <section className="task-modal__section">
              <h3 className="task-modal__section-title">Comentários</h3>
              <ul className="task-modal__comments">
                {sortedComments.map((c) => (
                  <li key={c.id} className="task-modal__comment">
                    <span className="task-modal__comment-author">{c.userName}</span>
                    <span className="task-modal__comment-body">{c.body}</span>
                    <time className="task-modal__comment-time" dateTime={new Date(c.createdAt).toISOString()}>
                      {new Date(c.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
              <form onSubmit={(e) => void handleComment(e)} className="task-modal__comment-form">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  rows={2}
                  placeholder="Escreva um comentário…"
                  className="task-modal__textarea"
                />
                <button type="submit" className="btn btn--primary btn--sm">
                  Comentar
                </button>
              </form>
            </section>

            <section className="task-modal__section">
              <h3 className="task-modal__section-title">Histórico</h3>
              <ul className="task-modal__activity">
                {sortedActivity.map((a) => (
                  <li key={a.id} className="task-modal__activity-row">
                    <span className="task-modal__activity-who">{a.actorName}</span>
                    <span className="task-modal__activity-what">{actionLabel(a.action)}</span>
                    {a.action === 'status_change' && a.detail?.from && a.detail?.to ? (
                      <span className="task-modal__activity-meta">
                        {TASK_STATUSES.find((s) => s.id === a.detail.from)?.label ?? a.detail.from} →{' '}
                        {TASK_STATUSES.find((s) => s.id === a.detail.to)?.label ?? a.detail.to}
                      </span>
                    ) : null}
                    <time className="task-modal__activity-time" dateTime={new Date(a.createdAt).toISOString()}>
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

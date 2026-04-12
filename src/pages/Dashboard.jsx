import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut, Bar } from 'react-chartjs-2'
import { useAuth } from '../context/AuthContext'
import { listProjects } from '../lib/collabApi'
import { TASK_STATUSES, loadKanbanBundle, computeInsights, isTaskOverdue } from '../lib/tasksApi'
import './Dashboard.css'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export function Dashboard() {
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const projects = await listProjects(userId)
      const bundles = await Promise.all(
        projects.map(async (p) => {
          try {
            const b = await loadKanbanBundle(p.id, userId)
            return { project: p, ...b }
          } catch {
            return { project: p, tasks: [], comments: [], activity: [] }
          }
        })
      )
      const flat = []
      for (const b of bundles) {
        for (const t of b.tasks) {
          flat.push({
            ...t,
            projectId: b.project.id,
            projectName: b.project.name,
            activity: b.activity,
          })
        }
      }
      setRows(flat)
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Erro ao montar o painel.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tasks = useMemo(
    () =>
      rows.map((row) => {
        const { projectName, projectId, activity: _activity, ...t } = row
        return { ...t, projectName, projectId }
      }),
    [rows]
  )

  const mergedActivity = useMemo(() => {
    const list = []
    for (const r of rows) {
      for (const a of r.activity || []) {
        list.push(a)
      }
    }
    return list
  }, [rows])

  const insights = useMemo(
    () => computeInsights(tasks, mergedActivity, userId),
    [tasks, mergedActivity, userId]
  )

  const statusLabels = TASK_STATUSES.map((s) => s.label)
  const statusCounts = TASK_STATUSES.map((s) => tasks.filter((t) => t.status === s.id).length)

  const doughnutData = {
    labels: statusLabels,
    datasets: [
      {
        data: statusCounts,
        backgroundColor: ['#a1a1aa', '#818cf8', '#fbbf24', '#34d399'],
        borderWidth: 1,
        borderColor: 'var(--border)',
      },
    ],
  }

  const doneByAssignee = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (t.status !== 'done' || !t.assigneeId) continue
      map.set(t.assigneeId, (map.get(t.assigneeId) ?? 0) + 1)
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, n]) => ({ label: `${id.slice(0, 8)}…`, value: n }))
  }, [tasks])

  const barData = {
    labels: doneByAssignee.map((x) => x.label),
    datasets: [
      {
        label: 'Concluídas (total)',
        data: doneByAssignee.map((x) => x.value),
        backgroundColor: 'color-mix(in srgb, var(--accent) 55%, var(--surface))',
        borderColor: 'var(--accent-border)',
        borderWidth: 1,
      },
    ],
  }

  const today = new Date().toDateString()
  const summaryLines = useMemo(() => {
    const doneToday = mergedActivity.filter(
      (a) => a.action === 'completed' && new Date(a.createdAt).toDateString() === today
    ).length
    const lines = []
    if (doneToday > 0) {
      lines.push(`Hoje foram concluídas ${doneToday} tarefa(s) registrada(s) no histórico.`)
    }
    lines.push(
      `No total: ${tasks.filter((t) => t.status === 'done').length} concluídas, ${tasks.filter((t) => t.status !== 'done').length} em aberto.`
    )
    if (insights.overdueCount > 0) {
      lines.push(`${insights.overdueCount} com prazo vencido.`)
    }
    return lines
  }, [mergedActivity, tasks, today, insights.overdueCount])

  const exportCsv = () => {
    const esc = (s) => {
      const x = String(s ?? '').replace(/"/g, '""')
      return /[;\n"]/.test(x) ? `"${x}"` : x
    }
    const lines = ['projeto;titulo;status;prioridade;responsavel_id;prazo;descricao']
    for (const t of tasks) {
      lines.push(
        [
          esc(t.projectName),
          esc(t.title),
          t.status,
          t.priority,
          t.assigneeId ?? '',
          t.dueDate ?? '',
          esc(t.description ?? ''),
        ].join(';')
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orgdemandas-relatorio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const overdueList = useMemo(() => tasks.filter((t) => isTaskOverdue(t)).slice(0, 12), [tasks])

  if (loading) {
    return (
      <div className="dashboard dashboard--loading">
        <p>Carregando painel…</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <h1 className="dashboard__title">Dashboard</h1>
        <div className="dashboard__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()}>
            Atualizar
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={exportCsv} disabled={tasks.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>

      <p className="dashboard__back">
        <Link to="/app">← Área de trabalho</Link>
      </p>

      {error ? <p className="dashboard__error">{error}</p> : null}

      <section className="dashboard__summary card-block" aria-label="Resumo automático">
        <h2>Resumo</h2>
        <ul className="dashboard__summary-list">
          {summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="dashboard__hint">{insights.productivityHint}</p>
        {insights.fridayDoneHint ? <p className="dashboard__hint">{insights.fridayDoneHint}</p> : null}
      </section>

      <section className="dashboard__insights card-block" aria-label="Sugestões">
        <h2>Sugestões inteligentes</h2>
        <ul>
          {insights.suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <div className="dashboard__charts">
        <section className="dashboard__chart card-block">
          <h2>Tarefas por status</h2>
          <div className="dashboard__chart-inner">
            {tasks.length === 0 ? (
              <p className="dashboard__empty">Sem tarefas ainda.</p>
            ) : (
              <Doughnut
                data={doughnutData}
                options={{
                  plugins: { legend: { position: 'bottom' } },
                  maintainAspectRatio: false,
                }}
              />
            )}
          </div>
        </section>
        <section className="dashboard__chart card-block">
          <h2>Concluídas por responsável</h2>
          <div className="dashboard__chart-inner dashboard__chart-inner--bar">
            {doneByAssignee.length === 0 ? (
              <p className="dashboard__empty">Nenhuma tarefa concluída com responsável.</p>
            ) : (
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: 'var(--text)' }, grid: { color: 'var(--border)' } },
                    y: { ticks: { color: 'var(--text)' }, grid: { color: 'var(--border)' } },
                  },
                }}
              />
            )}
          </div>
        </section>
      </div>

      <section className="dashboard__kpis card-block">
        <h2>Indicadores rápidos</h2>
        <ul className="dashboard__kpi-grid">
          <li>
            <span className="dashboard__kpi-value">{insights.myOpen}</span>
            <span className="dashboard__kpi-label">Minhas em aberto</span>
          </li>
          <li>
            <span className="dashboard__kpi-value">{insights.completionsWeek}</span>
            <span className="dashboard__kpi-label">Concluídas (7 dias)</span>
          </li>
          <li>
            <span className="dashboard__kpi-value">{insights.overdueCount}</span>
            <span className="dashboard__kpi-label">Atrasadas</span>
          </li>
          <li>
            <span className="dashboard__kpi-value">{insights.unassignedCount}</span>
            <span className="dashboard__kpi-label">Sem responsável</span>
          </li>
        </ul>
      </section>

      {overdueList.length > 0 ? (
        <section className="dashboard__overdue card-block">
          <h2>Alertas de prazo</h2>
          <ul>
            {overdueList.map((t) => (
              <li key={t.id}>
                <Link to={`/app/projeto/${t.projectId}?task=${encodeURIComponent(t.id)}`}>
                  <strong>{t.title}</strong>
                  <span className="dashboard__overdue-meta">
                    {t.projectName} · venceu {t.dueDate}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

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
import { useTheme } from '../context/ThemeContext'
import { listProjects } from '../lib/collabApi'
import {
  TASK_STATUSES,
  loadKanbanBundle,
  listProjectMembers,
  computeInsights,
  isTaskOverdue,
} from '../lib/tasksApi'
import './Dashboard.css'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

/**
 * Consolida tarefas de todos os projetos do usuário em métricas, gráficos e exportação.
 */
export function Dashboard() {
  const { userId } = useAuth()
  const { effective } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [projects, setProjects] = useState([])
  const [memberNames, setMemberNames] = useState({})
  const [selectedProjectIds, setSelectedProjectIds] = useState([])

  const refresh = useCallback(async () => {
    // Busca projetos, carrega o Kanban de cada um e achata tudo em uma lista única.
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const projectList = await listProjects(userId)
      const bundles = await Promise.all(
        projectList.map(async (p) => {
          try {
            const b = await loadKanbanBundle(p.id, userId)
            return { project: p, ...b }
          } catch {
            return { project: p, tasks: [], comments: [], activity: [] }
          }
        })
      )
      const names = {}
      // Nomes dos membros são carregados separadamente para rotular responsáveis nos gráficos.
      await Promise.all(
        projectList.map(async (p) => {
          try {
            const members = await listProjectMembers(p.id, userId)
            for (const m of members) names[m.id] = m.name
          } catch {
            /* membro opcional para o gráfico */
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
      const ids = projectList.map((p) => p.id)
      setProjects(projectList)
      setMemberNames(names)
      setRows(flat)
      setSelectedProjectIds((prev) => {
        const kept = prev.filter((id) => ids.includes(id))
        return kept.length > 0 ? kept : ids
      })
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

  const allProjectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const showingAllProjects =
    projects.length === 0 ||
    selectedProjectIds.length === 0 ||
    selectedProjectIds.length >= projects.length

  const filteredRows = useMemo(() => {
    // Filtro por projetos visíveis no dashboard.
    if (showingAllProjects) return rows
    const set = new Set(selectedProjectIds)
    return rows.filter((r) => set.has(r.projectId))
  }, [rows, selectedProjectIds, showingAllProjects])

  const tasks = useMemo(
    () =>
      // Remove o array de activity de cada linha para deixar a lista de tarefas mais simples.
      filteredRows.map((row) => {
        const { projectName, projectId, activity: _activity, ...t } = row
        return { ...t, projectName, projectId }
      }),
    [filteredRows]
  )

  const mergedActivity = useMemo(() => {
    const list = []
    for (const r of filteredRows) {
      for (const a of r.activity || []) {
        list.push(a)
      }
    }
    return list
  }, [filteredRows])

  const assigneeLabel = useCallback(
    (id) => memberNames[id] || `Usuário ${String(id).slice(0, 6)}…`,
    [memberNames]
  )

  function selectAllProjects() {
    setSelectedProjectIds([...allProjectIds])
  }

  function toggleProject(projectId) {
    // Comportamento de seleção pensado para comparar um projeto ou voltar para todos.
    setSelectedProjectIds((prev) => {
      const all = allProjectIds
      const isAllSelected =
        prev.length === 0 || prev.length >= all.length

      if (isAllSelected) {
        return [projectId]
      }

      const set = new Set(prev)
      if (set.has(projectId)) {
        if (set.size <= 1) return prev
        set.delete(projectId)
        return [...set]
      }
      if (set.size === 1) {
        return [projectId]
      }
      set.add(projectId)
      if (set.size >= all.length) return [...all]
      return [...set]
    })
  }

  const insights = useMemo(
    () => computeInsights(tasks, mergedActivity, userId),
    [tasks, mergedActivity, userId]
  )

  const chartColors = useMemo(() => {
    // Chart.js não lê CSS sozinho, então copiamos as variáveis para opções do gráfico.
    const styles = getComputedStyle(document.documentElement)
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback
    return {
      text: read('--text', effective === 'dark' ? 'rgba(255,255,255,0.7)' : '#4b5563'),
      muted: read('--text-muted', effective === 'dark' ? 'rgba(255,255,255,0.48)' : '#6b7280'),
      border: read('--border', effective === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(17,24,39,0.12)'),
      accent: read('--accent', '#ff8c00'),
      accentHot: read('--accent-hot', '#ffb347'),
      accentCool: read('--accent-cool', '#00d4ff'),
      success: read('--success', '#4ade80'),
      warning: read('--warning', '#facc15'),
      surface: read('--surface', 'rgba(17,19,24,0.86)'),
    }
  }, [effective])

  const statusLabels = TASK_STATUSES.map((s) => s.label)
  const statusCounts = TASK_STATUSES.map((s) => tasks.filter((t) => t.status === s.id).length)

  const doughnutData = {
    labels: statusLabels,
    datasets: [
      {
        data: statusCounts,
        backgroundColor: [
          'rgba(255,255,255,0.32)',
          chartColors.accentCool,
          chartColors.warning,
          chartColors.success,
        ],
        borderWidth: 1,
        borderColor: chartColors.border,
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
      .map(([id, n]) => ({ label: assigneeLabel(id), value: n }))
  }, [tasks, assigneeLabel])

  const barData = {
    labels: doneByAssignee.map((x) => x.label),
    datasets: [
      {
        label: 'Concluídas (total)',
        data: doneByAssignee.map((x) => x.value),
        backgroundColor: chartColors.accent,
        borderColor: chartColors.accentHot,
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
    // Gera arquivo CSV no browser sem depender de backend.
    const esc = (s) => {
      const x = String(s ?? '').replace(/"/g, '""')
      return /[;\n"]/.test(x) ? `"${x}"` : x
    }
    const lines = ['projeto;titulo;status;prioridade;responsavel;prazo;descricao']
    for (const t of tasks) {
      lines.push(
        [
          esc(t.projectName),
          esc(t.title),
          t.status,
          t.priority,
          esc(t.assigneeId ? assigneeLabel(t.assigneeId) : ''),
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

      {projects.length > 1 ? (
        <section className="dashboard__filter card-block" aria-label="Filtrar por grupo">
          <h2>Grupos de demandas</h2>
          <p className="dashboard__filter-hint">
            Escolha um ou mais projetos para atualizar gráficos, indicadores e exportação.
          </p>
          <div className="dashboard__filter-chips" role="group" aria-label="Projetos visíveis">
            <button
              type="button"
              className={`dashboard__filter-chip${showingAllProjects ? ' dashboard__filter-chip--active' : ''}`}
              aria-pressed={showingAllProjects}
              onClick={selectAllProjects}
            >
              Todos os grupos
            </button>
            {projects.map((p) => {
              const active = !showingAllProjects && selectedProjectIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`dashboard__filter-chip${active ? ' dashboard__filter-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleProject(p.id)}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
          {!showingAllProjects ? (
            <p className="dashboard__filter-active">
              Exibindo:{' '}
              {projects
                .filter((p) => selectedProjectIds.includes(p.id))
                .map((p) => p.name)
                .join(', ')}
            </p>
          ) : null}
        </section>
      ) : null}

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
                  plugins: { legend: { position: 'bottom', labels: { color: chartColors.text } } },
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
                    x: { ticks: { color: chartColors.text }, grid: { color: chartColors.border } },
                    y: { ticks: { color: chartColors.text }, grid: { color: chartColors.border } },
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

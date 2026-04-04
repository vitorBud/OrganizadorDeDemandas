import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getProjects,
  saveProjects,
  generateId,
  generateJoinCode,
} from '../lib/storage'
import './Workspace.css'

function loadMyProjects(userId) {
  const all = getProjects()
  return all.filter((p) => p.memberIds?.includes(userId))
}

export function Workspace() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState(() => loadMyProjects(userId))
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  const refresh = () => setProjects(loadMyProjects(userId))

  const sorted = useMemo(
    () => [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [projects]
  )

  function handleCreate(e) {
    e.preventDefault()
    setError('')
    const name = newName.trim()
    if (!name) {
      setError('Digite um nome para o projeto.')
      return
    }
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
      updatedAt: Date.now(),
    }
    all.push(project)
    saveProjects(all)
    setNewName('')
    refresh()
    navigate(`/app/projeto/${project.id}`)
  }

  function handleJoin(e) {
    e.preventDefault()
    setError('')
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) {
      setError('Informe o código de entrada.')
      return
    }
    const all = getProjects()
    const project = all.find((p) => p.joinCode?.toUpperCase() === code)
    if (!project) {
      setError('Nenhum projeto encontrado com esse código.')
      return
    }
    if (!project.memberIds.includes(userId)) {
      project.memberIds = [...project.memberIds, userId]
      project.updatedAt = Date.now()
      saveProjects(all)
    }
    setJoinCode('')
    refresh()
    navigate(`/app/projeto/${project.id}`)
  }

  return (
    <div className="workspace">
      <h1 className="workspace__title">Área de trabalho</h1>
      <p className="workspace__intro">
        Crie um projeto novo ou entre em um existente com o código que seu colega
        compartilhou. Tudo fica salvo neste navegador (demonstração local).
      </p>

      {error ? <p className="workspace__error">{error}</p> : null}

      <div className="workspace__grid">
        <section className="workspace__panel">
          <h2>Novo projeto</h2>
          <form onSubmit={handleCreate} className="workspace__form">
            <label>
              Nome do projeto
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Sprint marketing"
                className="workspace__input"
              />
            </label>
            <button type="submit" className="btn btn--primary">
              Criar e abrir
            </button>
          </form>
        </section>

        <section className="workspace__panel">
          <h2>Entrar com código</h2>
          <form onSubmit={handleJoin} className="workspace__form">
            <label>
              Código de entrada
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Ex.: ABC123"
                className="workspace__input workspace__input--code"
                maxLength={8}
              />
            </label>
            <button type="submit" className="btn btn--primary">
              Entrar no projeto
            </button>
          </form>
        </section>
      </div>

      <section className="workspace__list-section">
        <h2>Meus projetos</h2>
        {sorted.length === 0 ? (
          <p className="workspace__empty">Nenhum projeto ainda. Crie um ou entre com um código.</p>
        ) : (
          <ul className="workspace__list">
            {sorted.map((p) => (
              <li key={p.id}>
                <Link to={`/app/projeto/${p.id}`} className="workspace__link">
                  <span className="workspace__link-name">{p.name}</span>
                  <span className="workspace__link-code">Código: {p.joinCode}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

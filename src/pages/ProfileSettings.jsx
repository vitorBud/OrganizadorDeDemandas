import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ACCENT_PRESETS, accentColorForDisplay, normalizeAccentColor } from '../lib/userColor'
import './ProfileSettings.css'

export function ProfileSettings() {
  const { user, updateAccentColor, authReady } = useAuth()
  const [hex, setHex] = useState('#2563eb')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const n = normalizeAccentColor(user?.accentColor)
    setHex(n || '#2563eb')
  }, [user?.accentColor])

  const preview = accentColorForDisplay(normalizeAccentColor(hex), user.id)

  const onSave = useCallback(async () => {
    setMessage('')
    const normalized = normalizeAccentColor(hex)
    if (!normalized) {
      setMessage('Escolha uma cor válida (#RRGGBB).')
      return
    }
    setSaving(true)
    try {
      const r = await updateAccentColor(normalized)
      if (!r.ok) setMessage(r.error || 'Não foi possível guardar.')
      else setMessage('Cor guardada.')
    } finally {
      setSaving(false)
    }
  }, [hex, updateAccentColor])

  const onClear = useCallback(async () => {
    setMessage('')
    setSaving(true)
    try {
      const r = await updateAccentColor(null)
      if (!r.ok) setMessage(r.error || 'Não foi possível limpar.')
      else {
        setMessage('Cor automática ativada (única por conta).')
        setHex('#2563eb')
      }
    } finally {
      setSaving(false)
    }
  }, [updateAccentColor])

  if (!authReady || !user) {
    return (
      <div className="profile-settings profile-settings--loading">
        <p>Carregando…</p>
      </div>
    )
  }

  return (
    <div className="profile-settings">
      <Link to="/app" className="profile-settings__back">
        ← Área de trabalho
      </Link>
      <h1 className="profile-settings__title">A tua cor</h1>
      <p className="profile-settings__lead">
        Usada no chat, nos nomes do Kanban, comentários e histórico de tarefas. Outros membros veem a mesma cor.
      </p>

      <div className="profile-settings__preview">
        <span
          className="profile-settings__preview-dot"
          style={{ background: preview }}
          aria-hidden
        />
        <span className="profile-settings__preview-name" style={{ color: preview }}>
          {user.name}
        </span>
      </div>

      <div className="profile-settings__presets" role="group" aria-label="Cores sugeridas">
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`profile-settings__swatch${normalizeAccentColor(hex) === c ? ' profile-settings__swatch--active' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`Cor ${c}`}
            onClick={() => setHex(c)}
          />
        ))}
      </div>

      <label className="profile-settings__picker-label">
        Cor personalizada
        <input
          type="color"
          value={normalizeAccentColor(hex) || '#2563eb'}
          onChange={(e) => setHex(e.target.value)}
          className="profile-settings__picker"
        />
      </label>

      <div className="profile-settings__actions">
        <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void onSave()}>
          Guardar
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => void onClear()}>
          Usar cor automática
        </button>
      </div>

      {message ? <p className="profile-settings__msg">{message}</p> : null}
    </div>
  )
}

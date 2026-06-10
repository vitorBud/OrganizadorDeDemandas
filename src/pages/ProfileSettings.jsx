import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { THEME_APPEARANCE_PRESETS } from '../lib/themeAppearance'
import { THEME_ACCENT_PRESETS } from '../lib/themeAccent'
import { ACCENT_PRESETS, accentColorForDisplay, normalizeAccentColor } from '../lib/userColor'
import './ProfileSettings.css'

/**
 * Tela de preferências do usuário: cor pessoal, cor principal do site e senha.
 */
export function ProfileSettings() {
  const { user, updateAccentColor, updatePassword, authReady } = useAuth()
  const {
    accentColor: themeAccentColor,
    setAccentColor: setThemeAccentColor,
    resetAccentColor,
    defaultAccentColor,
    appearance,
    setAppearance,
    resetAppearance,
  } = useTheme()
  const [hex, setHex] = useState('#2563eb')
  const [themeHex, setThemeHex] = useState(defaultAccentColor)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [themeMessage, setThemeMessage] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
    // Sincroniza o formulário com a cor atual do perfil.
    const n = normalizeAccentColor(user?.accentColor)
    setHex(n || '#2563eb')
  }, [user?.accentColor])

  useEffect(() => {
    // Sincroniza o picker de tema com a cor global aplicada.
    setThemeHex(themeAccentColor || defaultAccentColor)
  }, [themeAccentColor, defaultAccentColor])

  const preview = accentColorForDisplay(normalizeAccentColor(hex), user?.id)
  const themePreview = normalizeAccentColor(themeHex) || defaultAccentColor

  const onSave = useCallback(async () => {
    // Salva a cor do usuário, usada para identificação em chat, comentários e cards.
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

  const onThemeSave = useCallback(() => {
    // Aplica a cor principal do site no ThemeContext.
    setThemeMessage('')
    const normalized = normalizeAccentColor(themeHex)
    if (!normalized) {
      setThemeMessage('Escolha uma cor válida (#RRGGBB).')
      return
    }
    const ok = setThemeAccentColor(normalized)
    setThemeMessage(ok ? 'Tema aplicado.' : 'Não foi possível aplicar esta cor.')
  }, [setThemeAccentColor, themeHex])

  const onThemeReset = useCallback(() => {
    resetAccentColor()
    resetAppearance()
    setThemeHex(defaultAccentColor)
    setThemeMessage('Tema padrão Liquid Glass ativado.')
  }, [defaultAccentColor, resetAccentColor, resetAppearance])

  const onPasswordSave = useCallback(async () => {
    // Valida no cliente antes de pedir alteração de senha ao AuthContext.
    setPasswordMessage('')
    if (password.length < 6) {
      setPasswordMessage('Use uma senha com pelo menos 6 caracteres.')
      return
    }
    if (password !== passwordConfirm) {
      setPasswordMessage('As senhas não conferem.')
      return
    }
    setPasswordSaving(true)
    try {
      const r = await updatePassword(password)
      if (!r.ok) setPasswordMessage(r.error || 'Não foi possível alterar a senha.')
      else {
        setPassword('')
        setPasswordConfirm('')
        setShowPassword(false)
        setPasswordMessage('Senha alterada.')
      }
    } finally {
      setPasswordSaving(false)
    }
  }, [password, passwordConfirm, updatePassword])

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
      <h1 className="profile-settings__title">Configurações</h1>
      <p className="profile-settings__lead">
        Ajuste sua identificação visual, o tema da interface e os dados de acesso da conta.
      </p>

      <section className="profile-settings__section">
        <h2 className="profile-settings__section-title">Cor do perfil</h2>
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
      </section>

      <section className="profile-settings__section">
        <h2 className="profile-settings__section-title">Tema do site</h2>
        <div className="profile-settings__theme-preview">
          <span
            className="profile-settings__theme-glow"
            style={{ background: themePreview, boxShadow: `0 0 22px ${themePreview}66` }}
            aria-hidden
          />
          <div>
            <strong style={{ color: themePreview }}>Cor principal</strong>
            <span>{themePreview}</span>
          </div>
        </div>

        <div className="profile-settings__appearance" role="group" aria-label="Estilo visual">
          {THEME_APPEARANCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`profile-settings__appearance-option${appearance === preset.id ? ' profile-settings__appearance-option--active' : ''}`}
              onClick={() => setAppearance(preset.id)}
              aria-pressed={appearance === preset.id}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="profile-settings__presets" role="group" aria-label="Temas sugeridos">
          {THEME_ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`profile-settings__swatch${normalizeAccentColor(themeHex) === c ? ' profile-settings__swatch--active' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`Tema ${c}`}
              onClick={() => setThemeHex(c)}
            />
          ))}
        </div>

        <label className="profile-settings__picker-label">
          Cor principal personalizada
          <input
            type="color"
            value={themePreview}
            onChange={(e) => setThemeHex(e.target.value)}
            className="profile-settings__picker"
          />
        </label>

        <div className="profile-settings__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onThemeSave}>
            Aplicar tema
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onThemeReset}>
            Voltar ao padrão
          </button>
        </div>

        {themeMessage ? <p className="profile-settings__msg">{themeMessage}</p> : null}
      </section>

      <section className="profile-settings__section">
        <h2 className="profile-settings__section-title">Senha</h2>
        <label className="profile-settings__password-label">
          Nova senha
          <span className="profile-settings__password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete="new-password"
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              className="profile-settings__password-input"
            />
            <button
              type="button"
              className="profile-settings__password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        <label className="profile-settings__password-label">
          Confirmar senha
          <input
            type={showPassword ? 'text' : 'password'}
            value={passwordConfirm}
            autoComplete="new-password"
            minLength={6}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="profile-settings__password-input"
          />
        </label>
        <div className="profile-settings__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={passwordSaving || !password || !passwordConfirm}
            onClick={() => void onPasswordSave()}
          >
            Alterar senha
          </button>
        </div>
        {passwordMessage ? <p className="profile-settings__msg">{passwordMessage}</p> : null}
      </section>
    </div>
  )
}

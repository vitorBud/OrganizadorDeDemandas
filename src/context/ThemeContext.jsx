import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  DEFAULT_THEME_ACCENT,
  THEME_ACCENT_STORAGE_KEY,
  applyThemeAccent,
  readStoredThemeAccent,
} from '../lib/themeAccent'
import { normalizeAccentColor } from '../lib/userColor'

const STORAGE_KEY = 'orgdemandas_theme'

const ThemeContext = createContext(null)

/** Lê a preferência claro/escuro salva no navegador. */
function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'dark'
  } catch {
    return 'dark'
  }
}

/** Consulta o tema do sistema operacional quando o usuário escolhe "Sistema". */
function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Guarda tema claro/escuro e a cor principal do site.
 * A cor vira variáveis CSS globais, então os componentes acompanham automaticamente.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference)
  const [accentColor, setAccentColorState] = useState(readStoredThemeAccent)
  const [systemDark, setSystemDark] = useState(() => systemIsDark())

  const setPreference = (value) => {
    setPreferenceState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
  }

  const setAccentColor = (value) => {
    // Retorna boolean para a tela de Configurações poder mostrar erro ou sucesso.
    const normalized = normalizeAccentColor(value)
    if (!normalized) return false
    setAccentColorState(normalized)
    try {
      localStorage.setItem(THEME_ACCENT_STORAGE_KEY, normalized)
    } catch {
      /* ignore */
    }
    return true
  }

  const resetAccentColor = () => {
    setAccentColorState(DEFAULT_THEME_ACCENT)
    try {
      localStorage.removeItem(THEME_ACCENT_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const effective = useMemo(() => {
    if (preference === 'system') return systemDark ? 'dark' : 'light'
    return preference
  }, [preference, systemDark])

  useLayoutEffect(() => {
    // useLayoutEffect aplica antes da pintura final, reduzindo piscar visual.
    document.documentElement.setAttribute('data-theme', effective)
    applyThemeAccent(accentColor, effective)
  }, [effective, accentColor])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const value = useMemo(
    () => ({
      preference,
      setPreference,
      effective,
      accentColor,
      setAccentColor,
      resetAccentColor,
      defaultAccentColor: DEFAULT_THEME_ACCENT,
    }),
    [preference, effective, accentColor]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- public hook
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

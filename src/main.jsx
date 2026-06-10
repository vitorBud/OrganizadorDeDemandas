import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyThemeAccent, readStoredThemeAccent } from './lib/themeAccent'
import { readStoredThemeAppearance } from './lib/themeAppearance'

/**
 * Aplica tema antes do React renderizar.
 * Evita aquele "flash" rápido com a cor/tema padrão ao abrir a página.
 */
;(function initThemeEarly() {
  try {
    const p = localStorage.getItem('orgdemandas_theme') || 'light'
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const e = p === 'system' ? (dark ? 'dark' : 'light') : p
    document.documentElement.setAttribute('data-theme', e)
    document.documentElement.setAttribute('data-appearance', readStoredThemeAppearance())
    applyThemeAccent(readStoredThemeAccent(), e)
  } catch {
    /* ignore */
  }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

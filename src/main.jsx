import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

;(function initThemeEarly() {
  try {
    const p = localStorage.getItem('orgdemandas_theme') || 'dark'
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const e = p === 'system' ? (dark ? 'dark' : 'light') : p
    document.documentElement.setAttribute('data-theme', e)
  } catch {
    /* ignore */
  }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import { normalizeAccentColor } from './userColor'

export const DEFAULT_THEME_ACCENT = '#6d4aff'
export const THEME_ACCENT_STORAGE_KEY = 'orgdemandas_theme_accent'

export const THEME_ACCENT_PRESETS = [
  DEFAULT_THEME_ACCENT,
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#0d9488',
  '#16a34a',
  '#e11d48',
  '#f97316',
  '#ca8a04',
]

/** Converte #rrggbb para canais RGB numéricos. */
function hexToRgb(hex) {
  const normalized = normalizeAccentColor(hex) || DEFAULT_THEME_ACCENT
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** Mistura duas cores; usado para gerar hover, brilho e gradiente do botão principal. */
function mixHex(hex, targetHex, targetWeight) {
  const a = hexToRgb(hex)
  const b = hexToRgb(targetHex)
  const keepWeight = 1 - targetWeight
  return rgbToHex({
    r: a.r * keepWeight + b.r * targetWeight,
    g: a.g * keepWeight + b.g * targetWeight,
    b: a.b * keepWeight + b.b * targetWeight,
  })
}

/** Calcula luminosidade percebida para decidir se o texto deve ser claro ou escuro. */
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const toLinear = (v) => {
    const channel = v / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function readableTextFor(hex) {
  return relativeLuminance(hex) > 0.48 ? '#111827' : '#ffffff'
}

function rgbString(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}

/** Lê a cor principal salva; se algo falhar, volta para o tema padrão. */
export function readStoredThemeAccent() {
  try {
    return normalizeAccentColor(localStorage.getItem(THEME_ACCENT_STORAGE_KEY)) || DEFAULT_THEME_ACCENT
  } catch {
    return DEFAULT_THEME_ACCENT
  }
}

/**
 * Aplica a identidade visual escolhida criando variáveis CSS globais.
 * Qualquer componente que usa var(--accent...) muda de cor sem precisar conhecer essa função.
 */
export function applyThemeAccent(input, mode = 'dark') {
  const accent = normalizeAccentColor(input) || DEFAULT_THEME_ACCENT
  const light = mode === 'light'
  const root = document.documentElement
  const hot = mixHex(accent, '#ffffff', light ? 0.18 : 0.32)
  const cool = mixHex(accent, light ? '#007991' : '#00d4ff', 0.52)
  const start = mixHex(accent, '#ffffff', light ? 0.12 : 0.3)
  const end = mixHex(accent, '#000000', light ? 0.24 : 0.28)

  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-rgb', rgbString(accent))
  root.style.setProperty('--accent-hot', hot)
  root.style.setProperty('--accent-hot-rgb', rgbString(hot))
  root.style.setProperty('--accent-cool', cool)
  root.style.setProperty('--accent-bg', `rgba(${rgbString(accent)}, ${light ? 0.1 : 0.12})`)
  root.style.setProperty('--accent-border', `rgba(${rgbString(accent)}, ${light ? 0.34 : 0.36})`)
  root.style.setProperty('--button-primary-start', start)
  root.style.setProperty('--button-primary-mid', accent)
  root.style.setProperty('--button-primary-end', end)
  root.style.setProperty('--button-primary-text', readableTextFor(accent))
  root.style.setProperty('--button-primary-border', `rgba(${rgbString(hot)}, ${light ? 0.5 : 0.72})`)
  root.style.setProperty('--button-primary-glow', `rgba(${rgbString(accent)}, ${light ? 0.18 : 0.2})`)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', accent)
}

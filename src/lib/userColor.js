/** Cores sugeridas (hex) para escolha rápida no perfil. */
export const ACCENT_PRESETS = [
  '#e11d48',
  '#c026d3',
  '#7c3aed',
  '#2563eb',
  '#0d9488',
  '#059669',
  '#ca8a04',
  '#ea580c',
  '#64748b',
]

/**
 * Normaliza entrada para `#rrggbb` ou `null` (vazio / inválido).
 * @param {string | null | undefined} input
 * @returns {string | null}
 */
export function normalizeAccentColor(input) {
  if (input == null) return null
  const s = String(input).trim()
  if (s === '') return null
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase()
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1]
    const g = s[2]
    const b = s[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

function hslToRgb(h, s, l) {
  // Conversão compacta usada para gerar uma cor automática estável a partir do id.
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  }
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Cor exibida para um utilizador: perfil definido, senão hex estável a partir do id.
 * @param {string | null | undefined} stored
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function accentColorForDisplay(stored, userId) {
  const n = normalizeAccentColor(stored)
  if (n) return n
  if (!userId) return '#64748b'
  let h = 0
  const id = String(userId)
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const hue = h % 360
  const { r, g, b } = hslToRgb(hue, 52, 42)
  return rgbToHex(r, g, b)
}

export const THEME_APPEARANCE_STORAGE_KEY = 'orgdemandas_theme_appearance'
export const DEFAULT_THEME_APPEARANCE = 'liquid'

export const THEME_APPEARANCE_PRESETS = [
  {
    id: 'liquid',
    label: 'Liquid Glass',
    description: 'Vidro leve, blur e profundidade suave.',
  },
  {
    id: 'original',
    label: 'Original',
    description: 'Visual limpo com menos transparência.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Mais compacto e direto ao ponto.',
  },
  {
    id: 'contrast',
    label: 'Alto contraste',
    description: 'Bordas e superfícies mais fortes.',
  },
]

export function normalizeThemeAppearance(value) {
  return THEME_APPEARANCE_PRESETS.some((preset) => preset.id === value)
    ? value
    : DEFAULT_THEME_APPEARANCE
}

export function readStoredThemeAppearance() {
  try {
    return normalizeThemeAppearance(localStorage.getItem(THEME_APPEARANCE_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME_APPEARANCE
  }
}

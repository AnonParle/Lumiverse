export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedMode = 'light' | 'dark'

export type BaseColorKey =
  | 'primary'
  | 'secondary'
  | 'background'
  | 'text'
  | 'danger'
  | 'success'
  | 'warning'
  | 'speech'
  | 'thoughts'

export type BaseColors = Partial<Record<BaseColorKey, string>>

export interface ThemeConfig {
  id: string
  name: string
  mode: ThemeMode
  accent: { h: number; s: number; l: number }
  statusColors?: { danger?: string; success?: string; warning?: string }
  baseColors?: BaseColors
  radiusScale: number
  enableGlass: boolean
  fontScale: number
  /** When true, accent and primary colors are dynamically derived from the active character's avatar. */
  characterAware?: boolean
}

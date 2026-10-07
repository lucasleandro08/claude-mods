export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; label: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type LineKind = 'ctx' | 'del' | 'add'
export type DiffLine = { kind: LineKind; text: string; oldNo?: number; newNo?: number }
export type Hunk = { id: string; path: string; tool: string; isNewFile: boolean; lines: DiffLine[] }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    'live-diff': { active: boolean; hunks: Hunk[]; selected: string | null; chip: Chip | null }
  }
}

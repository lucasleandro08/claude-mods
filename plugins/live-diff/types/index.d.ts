export type LineKind = 'ctx' | 'del' | 'add'
export type DiffLine = { kind: LineKind; text: string; oldNo?: number; newNo?: number }
export type Hunk = { id: string; path: string; tool: string; isNewFile: boolean; lines: DiffLine[] }

declare module 'claude-code' {
  interface PluginState {
    'live-diff': { active: boolean; hunks: Hunk[]; selected: string | null }
  }
}

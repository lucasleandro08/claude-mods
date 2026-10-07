export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type BuildRow = {
  id: string
  number: number
  status: string
  phase: string
  commit: string
  startedAt: number
  endedAt: number
  logGroup: string
  logStream: string
}
export type Project = { name: string; branch: string }
export type ChipKind = 'idle' | 'running' | 'ok' | 'failed' | 'missing'

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    'deploy-watch': {
      chip: Chip | null
      active: boolean
      builds: Record<string, BuildRow[]>
      pushes: Record<string, number>
      errors: Record<string, string>
      isOpen: boolean
      updatedAt: number
    }
  }
}

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
    'deploy-watch': {
      active: boolean
      builds: Record<string, BuildRow[]>
      pushes: Record<string, number>
      errors: Record<string, string>
      isOpen: boolean
      updatedAt: number
    }
  }
}

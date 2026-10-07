export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type ContainerRow = {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: string[]
  createdAt: number
  project: string
  service: string
  workingDir: string
  configFiles: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    'docker-pane': {
      chip: Chip | null
      active: boolean
      containers: ContainerRow[]
      repoRoot: string
      headMovedAt: number
      isOpen: boolean
      isLoading: boolean
      error: string
      updatedAt: number
      busy: string
      hideStopped: boolean
    }
  }
}

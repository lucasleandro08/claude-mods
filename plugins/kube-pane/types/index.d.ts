export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type PodRow = { name: string; ready: string; status: string; restarts: number; ageMs: number; containers: string[] }
export type ContainerChoice = Record<string, string>

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    'kube-pane': {
      chip: Chip | null
      active: boolean
      context: string
      contexts: string[]
      namespace: string
      namespaces: string[]
      pods: PodRow[]
      isOpen: boolean
      isLoading: boolean
      error: string
      updatedAt: number
      filter: string
      page: number
      containers: ContainerChoice
    }
  }
}

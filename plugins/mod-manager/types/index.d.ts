export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; label: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type ModState = 'on' | 'off' | 'missing'
export type ModEntry = { name: string; title: string; summary: string; state: ModState }
export type Notice = { tone: 'ok' | 'error' | 'info'; text: string }
export type Notices = Record<string, Notice>

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': {
      mods: ModEntry[]
      lastError: string
      installing: string[]
      notices: Notices
      marketplace: string
      bar: number
      press: ChipPress | null
    }
    'live-diff': { chip: Chip | null }
    'kube-pane': { chip: Chip | null }
    'pr-pane': { chip: Chip | null }
    'aws-profile': { chip: Chip | null }
    'docker-pane': { chip: Chip | null }
    'deploy-watch': { chip: Chip | null }
    worktrees: { chip: Chip | null }
  }
}

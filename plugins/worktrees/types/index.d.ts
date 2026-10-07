export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; label: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type Worktree = {
  path: string
  head: string
  branch: string
  isMain: boolean
  isLocked: boolean
  isPrunable: boolean
}

export type PullRequest = {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  headRefName: string
  url: string
}

export type WorktreeRow = Worktree & { changes: number; pr?: PullRequest; isMerged: boolean }
export type RepoRow = { main: string; branch: string; worktrees: WorktreeRow[] }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    worktrees: {
      chip: Chip | null
      active: boolean
      repos: RepoRow[]
      isOpen: boolean
      isLoading: boolean
      error: string
      updatedAt: number
      busy: string
    }
  }
}

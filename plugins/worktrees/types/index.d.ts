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
    worktrees: {
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

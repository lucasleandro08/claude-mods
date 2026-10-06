export type CheckState = 'pass' | 'fail' | 'pending' | 'none'
export type CodexState = 'clean' | 'findings' | 'reviewing' | 'none'
export type BranchState = 'in' | 'out' | 'n/a'
export type PrRow = {
  repo: string
  number: number
  title: string
  url: string
  isDraft: boolean
  checks: CheckState
  codex: CodexState
  codexReviews: number
  integration: BranchState
}

declare module 'claude-code' {
  interface PluginState {
    'pr-pane': { rows: PrRow[]; isOpen: boolean; isLoading: boolean; updatedAt: number; error: string }
  }
}

export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

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
    'mod-manager': { bar: number; press: ChipPress | null }
    'pr-pane': { active: boolean; rows: PrRow[]; isOpen: boolean; isLoading: boolean; updatedAt: number; error: string; chip: Chip | null }
  }
}

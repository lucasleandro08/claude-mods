export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; label: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type GoalStatus = 'queued' | 'working' | 'waiting' | 'done'
export type Goal = {
  id: string
  title: string
  status: GoalStatus
  notes: string[]
  question: string
  createdAt: number
  updatedAt: number
}
export type Profile = { name: string; emoji: string; paused: boolean; scheduled: boolean; everyMinutes: number; briefing: string; seenAt: number }
export type RoundStatus = { state: 'idle' | 'running'; goal: string; summary: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    dot: {
      active: boolean
      chip: Chip | null
      profile: Profile
      goals: Goal[]
      round: RoundStatus
      isOpen: boolean
      notice: { tone: 'ok' | 'error' | 'info'; text: string } | null
      showSettings: boolean
      chained: number
      memory: { bullets: number; chars: number }
    }
  }
}

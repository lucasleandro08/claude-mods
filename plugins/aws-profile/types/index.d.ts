export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export type AwsProfile = string
export type SessionState = 'checking' | 'valid' | 'expired' | 'error'
export type SessionStatus = { name: string; state: SessionState }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { bar: number; press: ChipPress | null }
    'aws-profile': { active: boolean; profile: AwsProfile; sessions: SessionStatus[]; pending: string[]; chip: Chip | null }
  }
}

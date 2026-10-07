export type AwsProfile = string
export type SessionState = 'checking' | 'valid' | 'expired' | 'error'
export type SessionStatus = { name: string; state: SessionState }

declare module 'claude-code' {
  interface PluginState {
    'aws-profile': { active: boolean; profile: AwsProfile; sessions: SessionStatus[]; pending: string[] }
  }
}

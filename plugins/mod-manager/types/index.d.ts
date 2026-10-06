export type ModState = 'on' | 'off' | 'missing' | 'locked'
export type ModEntry = { name: string; title: string; summary: string; state: ModState }
export type Notice = { tone: 'ok' | 'error' | 'info'; text: string }
export type Notices = Record<string, Notice>

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { revision: number; lastError: string; installing: string[]; notices: Notices }
  }
}

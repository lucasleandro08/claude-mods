export type ModState = 'on' | 'off' | 'missing' | 'locked'
export type ModEntry = { name: string; title: string; summary: string; state: ModState }

declare module 'claude-code' {
  interface PluginState {
    'mod-manager': { revision: number; lastError: string }
  }
}

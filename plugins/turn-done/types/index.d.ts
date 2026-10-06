export type ModActive = boolean

declare module 'claude-code' {
  interface PluginState {
    'turn-done': { active: ModActive }
  }
}

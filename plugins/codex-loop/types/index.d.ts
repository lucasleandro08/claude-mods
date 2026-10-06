export type ModActive = boolean

declare module 'claude-code' {
  interface PluginState {
    'codex-loop': { active: ModActive }
  }
}

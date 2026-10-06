export type ModActive = boolean

declare module 'claude-code' {
  interface PluginState {
    'promote-branch': { active: ModActive }
  }
}

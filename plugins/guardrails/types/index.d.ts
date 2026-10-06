export type ModActive = boolean

declare module 'claude-code' {
  interface PluginState {
    'guardrails': { active: ModActive }
  }
}

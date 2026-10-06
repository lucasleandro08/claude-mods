export const MARKETPLACE = 'dracula-mods'
export const STATE_FILE = '.claude/dracula-mods.json'
export const OFF_TEXT = 'This mod is off. Turn it on in /mods.'

export type ModsState = { enabled: Record<string, boolean> }

export function statePath(home: string | undefined) {
  return `${home ?? ''}/${STATE_FILE}`
}

export function parseState(text: string): ModsState {
  try {
    const parsed = JSON.parse(text) as Partial<ModsState>
    return { enabled: typeof parsed.enabled === 'object' && parsed.enabled !== null ? parsed.enabled : {} }
  } catch {
    return { enabled: {} }
  }
}

export function isOn(state: ModsState, name: string) {
  return state.enabled[name] === true
}

export function withToggle(state: ModsState, name: string, on: boolean): ModsState {
  return { enabled: { ...state.enabled, [name]: on } }
}

export function serializeState(state: ModsState) {
  return `${JSON.stringify(state, null, 2)}\n`
}

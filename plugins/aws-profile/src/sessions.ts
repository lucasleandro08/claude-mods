import type { SessionState, SessionStatus } from '../types'

export function pickProfiles(listed: string, option: string, current: string): string[] {
  const chosen = option.split(/[,\s]+/).map(p => p.trim()).filter(Boolean)
  const profiles = chosen.length > 0 ? chosen : listed.split('\n').map(p => p.trim()).filter(Boolean)
  return [...new Set(current === '' ? profiles : [...profiles, current])]
}

export function classify(exitCode: number, stderr: string): SessionState {
  if (exitCode === 0) return 'valid'
  return /expired|sso|token|login|refresh/i.test(stderr) ? 'expired' : 'error'
}

export function withStatus(statuses: SessionStatus[], name: string, state: SessionState): SessionStatus[] {
  const known = statuses.some(s => s.name === name)
  return known ? statuses.map(s => (s.name === name ? { name, state } : s)) : [...statuses, { name, state }]
}

export const LOGIN_PATTERN = /\baws\s+sso\s+(login|logout)\b/

export function loginCommand(profile: string) {
  return `aws sso login --profile ${/^[\w.-]+$/.test(profile) ? profile : `'${profile.replace(/'/g, `'\\''`)}'`}`
}

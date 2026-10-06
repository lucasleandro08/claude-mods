import type { CheckState, CodexState } from '../types'

export type Check = { status: string | null; conclusion: string | null; state: string | null }
export type SearchItem = { number: number; title: string; url: string; isDraft: boolean; repository: { nameWithOwner: string } }

const FAILED = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED']
const WAITING = ['PENDING', 'EXPECTED', '']

export function summarizeChecks(checks: readonly Check[]): CheckState {
  if (checks.length === 0) return 'none'
  const outcome = (c: Check) => (c.conclusion ?? c.state ?? '').toUpperCase()
  if (checks.some(c => FAILED.includes(outcome(c)))) return 'fail'
  if (checks.some(c => (c.status !== null && c.status !== 'COMPLETED') || WAITING.includes(outcome(c)))) return 'pending'
  return 'pass'
}

export function codexState(reactions: readonly string[], reviews: number): CodexState {
  if (reactions.includes('+1')) return 'clean'
  if (reviews > 0) return 'findings'
  if (reactions.includes('eyes')) return 'reviewing'
  return 'none'
}

export function isContained(compareStatus: string) {
  return ['behind', 'identical'].includes(compareStatus.trim())
}

import type { Chip } from '../src/shared/chip'
import type { Goal, Profile } from '../types'
import { activityOf, byStatus } from '../src/dot'

// Its tile in the mods bar: one word of status, a press opens its own pane
export function dotChip(profile: Profile, goals: Goal[]): Chip {
  const { waiting } = byStatus(goals)
  const { status } = activityOf(profile, goals)
  const tone = waiting.length > 0 ? 'warn' : status === 'working' ? 'ok' : 'accent'
  const text = waiting.length > 0 ? `${waiting.length} waiting on you` : status
  return { icon: profile.emoji, label: profile.name.toLowerCase(), tone, parts: [{ text, tone: 'text', action: 'open' }] }
}

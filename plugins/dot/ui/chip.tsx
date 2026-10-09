import type { Chip } from '../src/shared/chip'
import type { Goal, Profile, RoundStatus } from '../types'
import { byStatus, moodOf, unreadGoals } from '../src/dot'

// Its tile in the mods bar: what it needs from you first, then whether it is working or has news
export function dotChip(profile: Profile, goals: Goal[], round: RoundStatus): Chip {
  const mood = moodOf(profile, goals, round)
  const waiting = byStatus(goals).waiting.length
  const unread = unreadGoals(goals, profile.seenAt).length
  const part = mood === 'paused'
    ? { text: 'paused', tone: 'muted' as const }
    : waiting > 0
      ? { text: `⚠ needs you (${waiting})`, tone: 'warn' as const }
      : mood === 'working'
        ? { text: '● working…', tone: 'ok' as const }
        : unread > 0
          ? { text: `✓ ${unread} new ${unread === 1 ? 'reply' : 'replies'}`, tone: 'info' as const }
          : { text: 'idle', tone: 'muted' as const }
  return { icon: profile.emoji, label: profile.name.toLowerCase(), tone: part.tone, parts: [{ ...part, bold: part.tone !== 'muted', action: 'open' }] }
}

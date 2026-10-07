import { DRACULA } from './theme'

// The mod-manager draws every mod's chip in one bar; each mod publishes its chip as data
export type ChipTone = 'text' | 'muted' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'
export type ChipPart = { text: string; tone: ChipTone; bold?: boolean; action?: string }
export type Chip = { icon: string; label: string; tone: ChipTone; parts: ChipPart[] }
export type ChipPress = { plugin: string; action: string; at: number }

export const TONE_COLOR: Record<ChipTone, string> = {
  text: DRACULA.foreground,
  muted: DRACULA.comment,
  ok: DRACULA.green,
  warn: DRACULA.orange,
  bad: DRACULA.red,
  info: DRACULA.cyan,
  accent: DRACULA.purple,
}

export function sameChip(a: Chip | null, b: Chip | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const BAR_STALE_MS = 30_000

export function barIsLive(beat: number | undefined, now: number) {
  return typeof beat === 'number' && now - beat < BAR_STALE_MS
}

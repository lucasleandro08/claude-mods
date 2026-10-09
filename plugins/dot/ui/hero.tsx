import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile } from '../types'
import { avatarSvg } from '../src/avatar'
import { activityOf, moodOf } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const STATUS_COLOR: Record<string, string> = {
  working: DRACULA.green,
  'waiting on you': DRACULA.orange,
  paused: DRACULA.comment,
  'up next': DRACULA.purple,
  queued: DRACULA.purple,
  idle: DRACULA.comment,
}

// Centered above the prompt: the animated avatar, its name and what it is doing right now
export function DotHero({ ui, profile, goals, width, onOpen }: { ui: Ui; profile: Profile; goals: Goal[]; width: number; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui
  const { status, detail } = activityOf(profile, goals)
  const color = STATUS_COLOR[status] ?? DRACULA.comment

  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      {'Svg' in ui
        ? <ui.Svg source={avatarSvg(moodOf(profile, goals), 72)} alt={`${profile.name}, ${status}`} width={72} height={72} isInteractive />
        : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button key="open-dot" label={profile.name} dimColor plain onPress={onOpen} />
        <Text color={color}>{status}</Text>
      </Box>
      <Box width={Math.min(width, 72)} justifyContent="center">
        <Text color={DRACULA.comment} wrap="truncate-end">{detail}</Text>
      </Box>
    </Box>
  )
}

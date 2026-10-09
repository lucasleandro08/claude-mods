import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile } from '../types'
import { avatarSvg } from '../src/avatar'
import { activityOf, moodOf } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const AVATAR_PX = 56

const STATUS_COLOR: Record<string, string> = {
  working: DRACULA.green,
  'waiting on you': DRACULA.orange,
  paused: DRACULA.comment,
  'up next': DRACULA.purple,
  queued: DRACULA.purple,
  idle: DRACULA.comment,
}

// A full-width row above the prompt: the animated avatar, then who it is and what it is doing, wrapping instead of cutting
export function DotHero({ ui, profile, goals, onOpen, onRunNow }: { ui: Ui; profile: Profile; goals: Goal[]; onOpen: () => unknown; onRunNow: () => unknown }) {
  const { Box, Text, Button } = ui
  const { status, detail } = activityOf(profile, goals)
  const color = STATUS_COLOR[status] ?? DRACULA.comment

  return (
    <Box flexDirection="row" alignItems="center" gap={2} paddingX={1} marginBottom={1}>
      {'Svg' in ui
        ? <ui.Svg source={avatarSvg(moodOf(profile, goals), AVATAR_PX)} alt={`${profile.name}, ${status}`} width={AVATAR_PX} height={AVATAR_PX} isInteractive />
        : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text color={DRACULA.foreground} bold>{profile.name}</Text>
          <Text color={color}>{status}</Text>
        </Box>
        <Text color={DRACULA.comment} wrap="wrap">{detail}</Text>
      </Box>
      <Box flexDirection="row" gap={1}>
        {profile.scheduled && !profile.paused && <Button key="hero-run" label="Run now" dimColor onPress={onRunNow} />}
        <Button key="open-dot" label="Open" dimColor onPress={onOpen} />
      </Box>
    </Box>
  )
}

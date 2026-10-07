import type { Elements, RenderSurface } from 'claude-code'

import type { Chip } from '../src/shared/chip'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

type ChipProps = { ui: Ui; running: number; stale: number; unhealthy: number; isDown: boolean; onOpen: () => unknown }

export function DockerChip({ ui, running, stale, unhealthy, isDown, onOpen }: ChipProps) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.cyan}>🐳</Text>
      <Button key="open-docker" label={isDown ? 'Docker off' : `Docker · ${running} up`} dimColor onPress={onOpen} />
      {unhealthy > 0 && <Text color={DRACULA.red}>✗ {unhealthy} unhealthy</Text>}
      {stale > 0 && <Text color={DRACULA.orange}>⚠ {stale} older than checkout</Text>}
    </Box>
  )
}

export function dockerChip(running: number, stale: number, unhealthy: number, isDown: boolean): Chip {
  return {
    icon: '🐳',
    label: 'docker',
    tone: 'info',
    parts: [
      { text: isDown ? 'docker off' : `${running} up`, tone: 'text', action: 'open' },
      ...(unhealthy > 0 ? [{ text: `✗ ${unhealthy} unhealthy`, tone: 'bad' as const }] : []),
      ...(stale > 0 ? [{ text: `⚠ ${stale} stale`, tone: 'warn' as const }] : []),
    ],
  }
}

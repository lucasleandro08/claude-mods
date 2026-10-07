import type { Elements, RenderSurface } from 'claude-code'

import { TONE_COLOR, type Chip } from '../src/shared/chip'

type Ui = Elements[RenderSurface]

export type BarEntry = { plugin: string; chip: Chip }

export function modsChip(on: number, total: number): Chip {
  return { icon: '⚙', tone: 'accent', parts: [{ text: `${on}/${total}`, tone: 'text', action: 'open' }] }
}

// One wrapping row: each mod's chip is a unit, so a line breaks between chips, never inside one
export function ModsBar({ ui, entries, onPress }: { ui: Ui; entries: BarEntry[]; onPress: (plugin: string, action: string) => unknown }) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={3} marginBottom={1}>
      {entries.map(({ plugin, chip }) => (
        <Box key={`chip-${plugin}`} flexDirection="row" gap={1} alignItems="center">
          <Text color={TONE_COLOR[chip.tone]} bold>{chip.icon}</Text>
          {chip.parts.map((part, index) =>
            part.action !== undefined
              ? <Button key={`${plugin}-${part.action}`} label={part.text} dimColor onPress={() => onPress(plugin, part.action ?? '')} />
              : <Text key={`${plugin}-text-${index}`} color={TONE_COLOR[part.tone]} bold={part.bold}>{part.text}</Text>,
          )}
        </Box>
      ))}
    </Box>
  )
}

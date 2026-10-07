import type { Elements, RenderSurface } from 'claude-code'

import { TONE_COLOR, type Chip } from '../src/shared/chip'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type BarEntry = { plugin: string; chip: Chip }

const TILE_MIN_WIDTH = 10

export function modsChip(on: number, total: number): Chip {
  return { icon: '⚙', label: 'mods', tone: 'accent', parts: [{ text: `${on}/${total}`, tone: 'text', action: 'open' }] }
}

// Tiles like the usage band: a dim label over the value, wrapping between tiles with a blank row between lines
export function ModsBar({ ui, entries, onPress }: { ui: Ui; entries: BarEntry[]; onPress: (plugin: string, action: string) => unknown }) {
  const { Box } = ui

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={4} rowGap={1} paddingX={1} marginBottom={1}>
      {entries.map(entry => <Tile ui={ui} entry={entry} onPress={onPress} />)}
    </Box>
  )
}

function Tile({ ui, entry, onPress }: { ui: Ui; entry: BarEntry; onPress: (plugin: string, action: string) => unknown }) {
  const { Box, Text, Button } = ui
  const { plugin, chip } = entry

  return (
    <Box key={`chip-${plugin}`} flexDirection="column" minWidth={TILE_MIN_WIDTH}>
      <Text>
        <Text color={TONE_COLOR[chip.tone]}>{chip.icon} </Text>
        <Text color={DRACULA.comment}>{chip.label}</Text>
      </Text>
      <Box flexDirection="row" gap={1} alignItems="center">
        {chip.parts.map((part, index) =>
          part.action !== undefined
            ? <Button key={`${plugin}-${part.action}`} label={part.text} dimColor onPress={() => onPress(plugin, part.action ?? '')} />
            : <Text key={`${plugin}-text-${index}`} color={TONE_COLOR[part.tone]} bold={part.bold}>{part.text}</Text>,
        )}
      </Box>
    </Box>
  )
}

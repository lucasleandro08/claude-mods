import type { Elements, RenderSurface } from 'claude-code'

import type { ModEntry } from '../types'
import { installCommand } from '../src/catalog'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type ModsPaneProps = { ui: Ui; mods: ModEntry[]; error: string; onToggle: (mod: ModEntry) => unknown }

export function ModsPane({ ui, mods, error, onToggle }: ModsPaneProps) {
  const { Box, Text } = ui
  const on = mods.filter(m => m.state === 'on').length

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={DRACULA.purple} bold>⚙ Mods</Text>
        <Text color={DRACULA.comment}>{on} of {mods.length} on</Text>
      </Box>
      <Text color={DRACULA.comment} italic>Turning a mod on or off reloads it right away.</Text>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {mods.map(mod => <ModRow ui={ui} mod={mod} onToggle={() => onToggle(mod)} />)}
    </Box>
  )
}

function ModRow({ ui, mod, onToggle }: { ui: Ui; mod: ModEntry; onToggle: () => unknown }) {
  const { Box, Text, Button } = ui
  const isOn = mod.state === 'on'

  return (
    <Box key={`mod-${mod.name}`} flexDirection="column" marginTop={1} paddingX={1}
      backgroundColor={isOn ? DRACULA.currentLine : undefined}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={isOn ? DRACULA.green : DRACULA.comment}>{isOn ? '●' : '○'}</Text>
        <Text color={isOn ? DRACULA.pink : DRACULA.foreground} bold={isOn}>{mod.title}</Text>
        <Box flexGrow={1} />
        <Toggle ui={ui} mod={mod} onToggle={onToggle} />
      </Box>
      <Box paddingLeft={2}>
        <Text color={DRACULA.comment} wrap="truncate-end">{mod.summary}</Text>
      </Box>
      {mod.state === 'missing' && (
        <Box paddingLeft={2}>
          <Text color={DRACULA.orange}>Not installed: {installCommand(mod.name)}</Text>
        </Box>
      )}
    </Box>
  )
}

function Toggle({ ui, mod, onToggle }: { ui: Ui; mod: ModEntry; onToggle: () => unknown }) {
  const { Text, Button } = ui
  if (mod.state === 'missing') return undefined
  if (mod.state === 'locked') return <Text color={DRACULA.comment}>managed</Text>
  return <Button key={`toggle-${mod.name}`} label={mod.state === 'on' ? 'Turn off' : 'Turn on'} dimColor onPress={onToggle} />
}

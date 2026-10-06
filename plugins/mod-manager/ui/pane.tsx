import type { Elements, RenderSurface } from 'claude-code'

import type { ModEntry, Notice, Notices } from '../types'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export type ModsPaneProps = {
  ui: Ui
  mods: ModEntry[]
  error: string
  installing: string[]
  notices: Notices
  onToggle: (mod: ModEntry) => unknown
  onInstall: (mod: ModEntry) => unknown
  onInstallAll: (names: string[]) => unknown
}

export function ModsPane({ ui, mods, error, installing, notices, onToggle, onInstall, onInstallAll }: ModsPaneProps) {
  const { Box, Text, Button } = ui
  const on = mods.filter(m => m.state === 'on').length
  const missing = mods.filter(m => m.state === 'missing' && !installing.includes(m.name)).map(m => m.name)

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={DRACULA.purple} bold>⚙ Mods</Text>
        <Text color={DRACULA.comment}>{on} of {mods.length} on</Text>
        <Box flexGrow={1} />
        {missing.length > 0 && installing.length === 0 && (
          <Button key="install-all" label={`Install all (${missing.length})`} dimColor onPress={() => onInstallAll(missing)} />
        )}
      </Box>
      <Text color={DRACULA.comment} italic>Turning a mod on or off reloads it right away.</Text>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {mods.map(mod => (
        <ModRow ui={ui} mod={mod} isInstalling={installing.includes(mod.name)} notice={notices[mod.name]}
          onToggle={() => onToggle(mod)} onInstall={() => onInstall(mod)} />
      ))}
    </Box>
  )
}

type ModRowProps = { ui: Ui; mod: ModEntry; isInstalling: boolean; notice?: Notice; onToggle: () => unknown; onInstall: () => unknown }

function ModRow({ ui, mod, isInstalling, notice, onToggle, onInstall }: ModRowProps) {
  const { Box, Text } = ui
  const isOn = mod.state === 'on'
  const toneColor = { ok: DRACULA.green, error: DRACULA.red, info: DRACULA.yellow } as const

  return (
    <Box key={`mod-${mod.name}`} flexDirection="column" marginTop={1} paddingX={1}
      backgroundColor={isOn ? DRACULA.currentLine : undefined}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={isOn ? DRACULA.green : mod.state === 'missing' ? DRACULA.orange : DRACULA.comment}>
          {isOn ? '●' : mod.state === 'missing' ? '◌' : '○'}
        </Text>
        <Text color={isOn ? DRACULA.pink : DRACULA.foreground} bold={isOn}>{mod.title}</Text>
        {mod.state === 'missing' && <Text color={DRACULA.orange}>not installed</Text>}
        <Box flexGrow={1} />
        <Action ui={ui} mod={mod} isInstalling={isInstalling} onToggle={onToggle} onInstall={onInstall} />
      </Box>
      <Box paddingLeft={2}>
        <Text color={DRACULA.comment} wrap="truncate-end">{mod.summary}</Text>
      </Box>
      {notice && (
        <Box paddingLeft={2}>
          <Text color={toneColor[notice.tone]}>{notice.text}</Text>
        </Box>
      )}
    </Box>
  )
}

type ActionProps = { ui: Ui; mod: ModEntry; isInstalling: boolean; onToggle: () => unknown; onInstall: () => unknown }

function Action({ ui, mod, isInstalling, onToggle, onInstall }: ActionProps) {
  const { Text, Button } = ui
  if (isInstalling) return <Text color={DRACULA.yellow}>installing…</Text>
  if (mod.state === 'missing') return <Button key={`install-${mod.name}`} label="Install" dimColor onPress={onInstall} />
  if (mod.state === 'locked') return <Text color={DRACULA.comment}>managed</Text>
  return <Button key={`toggle-${mod.name}`} label={mod.state === 'on' ? 'Turn off' : 'Turn on'} dimColor onPress={onToggle} />
}

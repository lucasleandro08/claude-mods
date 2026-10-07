import type { Elements, RenderSurface } from 'claude-code'

import type { ChipKind } from '../types'
import type { ChipState } from '../src/builds'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

export const KIND_STYLE: Record<ChipKind, { icon: string; color: string }> = {
  idle: { icon: '·', color: DRACULA.comment },
  running: { icon: '⟳', color: DRACULA.yellow },
  ok: { icon: '✓', color: DRACULA.green },
  failed: { icon: '✗', color: DRACULA.red },
  missing: { icon: '⚠', color: DRACULA.orange },
}

export function DeployChip({ ui, projects, onOpen }: { ui: Ui; projects: { name: string; state: ChipState }[]; onOpen: () => unknown }) {
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.purple}>🚀</Text>
      <Button key="open-deploys" label={projects.length === 1 ? (projects[0]?.name ?? 'Deploys') : 'Deploys'} dimColor onPress={onOpen} />
      {projects.map(({ name, state }) => {
        const style = KIND_STYLE[state.kind]
        return (
          <Text key={`deploy-${name}`} color={style.color}>
            {projects.length > 1 ? `${name} ` : ''}{style.icon} {state.label}
          </Text>
        )
      })}
    </Box>
  )
}

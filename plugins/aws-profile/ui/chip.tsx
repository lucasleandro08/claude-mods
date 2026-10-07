import type { Elements, RenderSurface } from 'claude-code'

import type { SessionStatus } from '../types'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

type ChipProps = {
  ui: Ui
  profile: string
  sessions: SessionStatus[]
  pending: string[]
  isProduction: (name: string) => boolean
  onLogin: (name: string) => unknown
}

export function ProfileChip({ ui, profile, sessions, pending, isProduction, onLogin }: ChipProps) {
  const { Box, Text, Button } = ui

  if (sessions.length === 0) {
    const prod = isProduction(profile)
    return (
      <Box flexDirection="row" marginBottom={1}>
        <Text>
          <Text color={prod ? DRACULA.red : DRACULA.orange} bold={prod}>☁ </Text>
          <Text color={prod ? DRACULA.red : DRACULA.comment} bold={prod} dimColor={profile === ''}>{profile === '' ? 'no AWS_PROFILE' : profile}</Text>
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center" marginBottom={1}>
      <Text color={DRACULA.orange}>☁</Text>
      {sessions.map(({ name, state }) => {
        const label = `${name === profile ? '● ' : ''}${name}`
        const color = isProduction(name) ? DRACULA.red : DRACULA.foreground
        if (pending.includes(name)) return <Text key={`aws-${name}`} color={DRACULA.yellow}>{label} ⟳</Text>
        if (state === 'valid') return <Text key={`aws-${name}`} color={color}>{label} <Text color={DRACULA.green}>✓</Text></Text>
        if (state === 'checking') return <Text key={`aws-${name}`} color={DRACULA.comment}>{label} …</Text>
        return <Button key={`login-${name}`} label={`${label} ✗ login`} dimColor onPress={() => onLogin(name)} />
      })}
    </Box>
  )
}

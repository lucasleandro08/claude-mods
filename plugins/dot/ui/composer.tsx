import type { ClientModule } from 'claude-code'

// A full-width text field drawn by the pane's Client: the native Input keeps a fixed width
type ComposerProps = { placeholder: string; background: string; text: string; muted: string; accent: string }
type ComposerState = { value: string; focused: boolean; blink: boolean }

const SPECIAL = new Set(['up', 'down', 'left', 'right', 'tab', 'pageup', 'pagedown', 'home', 'end', 'escape', 'delete'])

const Composer: ClientModule<ComposerProps, ComposerState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { value: '', focused: false, blink: true }

  if (surface.state === undefined) {
    surface.every(530, () => {
      const now = surface.state ?? state
      surface.setState({ ...now, blink: !now.blink })
    })
    surface.onPointer(event => {
      if (event.type === 'down') surface.setState({ ...(surface.state ?? state), focused: true })
    })
    surface.onKey(event => {
      const now = surface.state ?? state
      if (event.key === 'return') {
        const text = now.value.trim()
        if (text !== '') surface.post({ submit: text })
        surface.setState({ ...now, value: '', focused: true })
        return
      }
      if (event.key === 'backspace') {
        const value = event.meta || event.ctrl ? '' : now.value.slice(0, -1)
        surface.setState({ ...now, value, focused: true })
        return
      }
      if (event.ctrl || event.meta || SPECIAL.has(event.key)) return
      surface.setState({ ...now, value: now.value + event.key, focused: true, blink: true })
    })
    surface.setState(state)
  }

  const caret = state.focused && state.blink ? '▍' : ' '
  return (
    <Box flexDirection="row" backgroundColor={props.background} paddingX={2} paddingY={1} columnGap={2}>
      <Box flexGrow={1} flexShrink={1}>
        {state.value === ''
          ? <Text color={props.muted} wrap="wrap">{`${state.focused ? caret : ''}${state.focused ? '' : props.placeholder}`}</Text>
          : <Text color={props.text} wrap="wrap">{`${state.value}${caret}`}</Text>}
      </Box>
      <Box flexShrink={0}><Text color={state.value === '' ? props.muted : props.accent}>↵ send</Text></Box>
    </Box>
  )
}

export default Composer

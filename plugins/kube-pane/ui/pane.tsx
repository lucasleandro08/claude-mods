import type { Elements, RenderSurface } from 'claude-code'

import type { ContainerChoice, PodRow } from '../types'
import { formatAge, isHealthy, isSettling, shortContext, visiblePods } from '../src/pods'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]
type Option = { value: string; label?: string }

export type PodsPaneProps = {
  ui: Ui
  width: number
  isProduction: boolean
  context: string
  contexts: string[]
  namespace: string
  namespaces: string[]
  pods: PodRow[]
  isLoading: boolean
  error: string
  updatedAt: number
  filter: string
  page: number
  pageSize: number
  containers: ContainerChoice
  onRefresh: () => unknown
  onContext: (context: string) => unknown
  onNamespace: (namespace: string) => unknown
  onFilter: (query: string) => unknown
  onPage: (page: number) => unknown
  onContainer: (pod: string, container: string) => unknown
  onShell: (pod: PodRow) => unknown
}

export function PodsPane(props: PodsPaneProps) {
  const { ui, width, isProduction, pods, isLoading, error, updatedAt, filter } = props
  const { Box, Text, Button } = ui
  const unhealthy = pods.filter(p => !isHealthy(p.status) && !isSettling(p.status)).length
  const view = visiblePods(pods, filter, props.page, props.pageSize)
  const nameWidth = Math.max(10, Math.min(44, width - 48))

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={isProduction ? DRACULA.red : DRACULA.purple} bold>⎈ Pods</Text>
        <Text color={DRACULA.comment}>{pods.length} pods</Text>
        {unhealthy > 0 && <Text color={DRACULA.red}>✗ {unhealthy} unhealthy</Text>}
        <Box flexGrow={1} />
        <Text color={DRACULA.comment}>
          {isLoading ? 'refreshing…' : updatedAt > 0 ? `updated ${new Date(updatedAt).toTimeString().slice(0, 8)}` : ''}
        </Text>
        <Button key="refresh" label="Refresh" dimColor onPress={props.onRefresh} />
      </Box>

      <Picker ui={ui} id="context" label="Context" value={props.context}
        options={props.contexts.map(name => ({ value: name, label: shortContext(name) }))} onPick={props.onContext} />
      <Picker ui={ui} id="namespace" label="Namespace" value={props.namespace}
        options={props.namespaces.map(name => ({ value: name }))} onPick={props.onNamespace} />
      <FilterField ui={ui} value={filter} onChange={props.onFilter} />

      {isProduction && <Text color={DRACULA.red}>Production context: read-only here; writes still ask for confirmation.</Text>}
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}

      <Box flexDirection="row" marginTop={1} backgroundColor={DRACULA.currentLine} paddingX={1}>
        <Box width={nameWidth}><Text color={DRACULA.comment} bold>NAME</Text></Box>
        <Box width={7}><Text color={DRACULA.comment} bold>READY</Text></Box>
        <Box width={18}><Text color={DRACULA.comment} bold>STATUS</Text></Box>
        <Box width={5}><Text color={DRACULA.comment} bold>RST</Text></Box>
        <Box width={6}><Text color={DRACULA.comment} bold>AGE</Text></Box>
      </Box>
      {view.total === 0 && !isLoading && error === '' && (
        <Text color={DRACULA.comment} italic>{filter === '' ? `No pods in ${props.namespace}.` : `No pods match "${filter}".`}</Text>
      )}
      {view.rows.map(pod => (
        <PodRowView ui={ui} pod={pod} nameWidth={nameWidth}
          container={props.containers[pod.name] ?? pod.containers[0] ?? ''}
          onContainer={name => props.onContainer(pod.name, name)} onShell={() => props.onShell(pod)} />
      ))}

      {view.pages > 1 && (
        <Box flexDirection="row" gap={1} marginTop={1} alignItems="center">
          {view.current > 0 && <Button key="page-prev" label="‹ Prev" dimColor onPress={() => props.onPage(view.current - 1)} />}
          <Text color={DRACULA.comment}>page {view.current + 1}/{view.pages} · {view.total} pods</Text>
          {view.current < view.pages - 1 && <Button key="page-next" label="Next ›" dimColor onPress={() => props.onPage(view.current + 1)} />}
        </Box>
      )}
    </Box>
  )
}

export function PaneError({ ui, message, onRefresh }: { ui: Ui; message: string; onRefresh: () => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={DRACULA.red}>Pods pane failed to draw: {message}</Text>
      <Button key="refresh" label="Refresh" dimColor onPress={onRefresh} />
    </Box>
  )
}

type PodRowProps = {
  ui: Ui
  pod: PodRow
  nameWidth: number
  container: string
  onContainer: (name: string) => unknown
  onShell: () => unknown
}

function PodRowView({ ui, pod, nameWidth, container, onContainer, onShell }: PodRowProps) {
  const { Box, Text, Button } = ui
  const [ready, total] = pod.ready.split('/')
  const statusColor = isHealthy(pod.status) ? DRACULA.green : isSettling(pod.status) ? DRACULA.yellow : DRACULA.red

  return (
    <Box key={`pod-${pod.name}`} flexDirection="column" paddingX={1}>
      <Box flexDirection="row">
        <Box width={nameWidth}><Text color={DRACULA.foreground} wrap="truncate-middle">{pod.name}</Text></Box>
        <Box width={7}><Text color={ready === total ? DRACULA.green : DRACULA.orange}>{pod.ready}</Text></Box>
        <Box width={18}><Text color={statusColor} wrap="truncate-end">{pod.status}</Text></Box>
        <Box width={5}><Text color={pod.restarts > 0 ? DRACULA.orange : DRACULA.comment}>{pod.restarts}</Text></Box>
        <Box width={6}><Text color={DRACULA.comment}>{formatAge(pod.ageMs)}</Text></Box>
        <Button key={`shell-${pod.name}`} label="⌘ Shell" dimColor plain onPress={onShell} />
      </Box>
      {pod.containers.length > 1 && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={2}>
          <Text color={DRACULA.comment}>container:</Text>
          {pod.containers.map(name =>
            name === container
              ? <Text color={DRACULA.pink} bold>{name}</Text>
              : <Button key={`container-${pod.name}-${name}`} label={name} dimColor plain onPress={() => onContainer(name)} />,
          )}
        </Box>
      )}
    </Box>
  )
}

type PickerProps = { ui: Ui; id: string; label: string; value: string; options: Option[]; onPick: (value: string) => unknown }

function Picker({ ui, id, label, value, options, onPick }: PickerProps) {
  const { Box, Text, Button } = ui
  if (options.length === 0) return undefined

  if ('Select' in ui) {
    const { Select } = ui
    return (
      <Box marginTop={1}>
        <Select key={id} label={label} value={value} options={options} onSelect={(picked: string) => void onPick(picked)} />
      </Box>
    )
  }

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
      <Text color={DRACULA.comment}>{label}:</Text>
      {options.map(option =>
        option.value === value
          ? <Text color={DRACULA.pink} bold>{option.label ?? option.value}</Text>
          : <Button key={`${id}-${option.value}`} label={option.label ?? option.value} dimColor plain onPress={() => onPick(option.value)} />,
      )}
    </Box>
  )
}

function FilterField({ ui, value, onChange }: { ui: Ui; value: string; onChange: (query: string) => unknown }) {
  if (!('Input' in ui)) return undefined
  const { Box, Input } = ui

  return (
    <Box marginTop={1}>
      <Input key="filter" label="Filter" placeholder="pod name or status" value={value}
        onInput={(query: string) => void onChange(query)} onSubmit={(query: string) => void onChange(query)} />
    </Box>
  )
}

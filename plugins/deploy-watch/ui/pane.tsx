import type { Elements, RenderSurface } from 'claude-code'

import type { BuildRow, Project } from '../types'
import { chipState, formatAgo } from '../src/builds'
import { DRACULA } from '../src/shared/theme'
import { KIND_STYLE } from './chip'

type Ui = Elements[RenderSurface]

export type DeploysPaneProps = {
  ui: Ui
  projects: Project[]
  builds: Record<string, BuildRow[]>
  pushes: Record<string, number>
  errors: Record<string, string>
  updatedAt: number
  now: number
  missingMs: number
  onRefresh: () => unknown
  onStart: (project: Project) => unknown
  onLogs: (build: BuildRow) => unknown
}

const STATUS_COLOR: Record<string, string> = {
  SUCCEEDED: DRACULA.green,
  IN_PROGRESS: DRACULA.yellow,
  FAILED: DRACULA.red,
  FAULT: DRACULA.red,
  TIMED_OUT: DRACULA.red,
  STOPPED: DRACULA.orange,
}

export function DeploysPane(props: DeploysPaneProps) {
  const { ui, projects, updatedAt } = props
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.purple} bold>🚀 Deploys</Text>
        <Box flexGrow={1} />
        <Text color={DRACULA.comment}>{updatedAt > 0 ? `updated ${new Date(updatedAt).toTimeString().slice(0, 8)}` : 'loading…'}</Text>
        <Button key="refresh" label="Refresh" dimColor onPress={props.onRefresh} />
      </Box>
      {projects.length === 0 && (
        <Text color={DRACULA.comment}>No CodeBuild project set. Add them in /config → deploy-watch → Projects (e.g. my-app-staging=staging).</Text>
      )}
      {projects.map(project => <ProjectView {...props} project={project} />)}
    </Box>
  )
}

function ProjectView(props: DeploysPaneProps & { project: Project }) {
  const { ui, project, now } = props
  const { Box, Text, Button } = ui
  const builds = props.builds[project.name] ?? []
  const state = chipState(builds, props.pushes[project.name] ?? 0, now, props.missingMs)
  const style = KIND_STYLE[state.kind]
  const error = props.errors[project.name] ?? ''

  return (
    <Box key={`project-${project.name}`} flexDirection="column" marginTop={1}>
      <Box flexDirection="row" alignItems="center" gap={1} backgroundColor={DRACULA.currentLine} paddingX={1}>
        <Text color={DRACULA.cyan} bold>{project.name}</Text>
        {project.branch !== '' && <Text color={DRACULA.comment}>⑂ {project.branch}</Text>}
        <Text color={style.color}>{style.icon} {state.label}</Text>
        <Box flexGrow={1} />
        <Button key={`start-${project.name}`} label="Start build" dimColor plain onPress={() => props.onStart(project)} />
      </Box>
      {error !== '' && <Text color={DRACULA.red}>{error}</Text>}
      {builds.map(build => (
        <Box key={`build-${build.id}`} flexDirection="row" paddingX={1} gap={1}>
          <Box width={6}><Text color={DRACULA.comment}>#{build.number}</Text></Box>
          <Box width={12}><Text color={STATUS_COLOR[build.status] ?? DRACULA.comment} wrap="truncate-end">{build.status.toLowerCase().replace('_', ' ')}</Text></Box>
          <Box width={9}><Text color={DRACULA.purple} wrap="truncate-end">{build.commit.slice(0, 8)}</Text></Box>
          <Box width={9}><Text color={DRACULA.comment}>{build.startedAt > 0 ? `${formatAgo(now - build.startedAt)} ago` : ''}</Text></Box>
          <Box width={7}>
            <Text color={DRACULA.comment}>{build.endedAt > 0 ? formatAgo(build.endedAt - build.startedAt) : build.phase.toLowerCase()}</Text>
          </Box>
          {build.logGroup !== '' && <Button key={`logs-${build.id}`} label="Logs" dimColor plain onPress={() => props.onLogs(build)} />}
        </Box>
      ))}
    </Box>
  )
}

export function PaneError({ ui, message, onRefresh }: { ui: Ui; message: string; onRefresh: () => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={DRACULA.red}>Deploys pane failed to draw: {message}</Text>
      <Button key="refresh" label="Refresh" dimColor onPress={onRefresh} />
    </Box>
  )
}

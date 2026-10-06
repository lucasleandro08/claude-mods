import type { Elements, RenderSurface } from 'claude-code'

import type { DiffLine, Hunk } from '../types'
import { countLines, summarizeFiles, type FileSummary } from '../src/diff'
import { commonDir, splitPath, tilde } from '../src/paths'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const LINE_BUDGET = { all: 120, file: 400 } as const
const ROW_TINT = { add: '#2b3b33', del: '#3d2b33' } as const

export type DiffPaneProps = {
  ui: Ui
  width: number
  hunks: Hunk[]
  selected: string | null
  onPick: (path: string | null) => unknown
  onClear: () => unknown
}

export function DiffPane({ ui, width, hunks, selected, onPick, onClear }: DiffPaneProps) {
  const { Box, Text, Button } = ui
  const files = summarizeFiles(hunks)
  const root = commonDir(files.map(f => f.path))
  const current = selected !== null && files.some(f => f.path === selected) ? selected : null
  const shown = budgetLines(current === null ? files : files.filter(f => f.path === current), LINE_BUDGET[current === null ? 'all' : 'file'])
  const rule = <Text color={DRACULA.currentLine}>{'─'.repeat(Math.max(20, width - 2))}</Text>

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={1} paddingY={1}>
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={DRACULA.purple} bold>Δ Changes</Text>
        {files.length > 0 && <Text color={DRACULA.comment}>{files.length} {files.length === 1 ? 'file' : 'files'}</Text>}
        {files.length > 0 && <Counts ui={ui} added={countLines('add', hunks)} removed={countLines('del', hunks)} />}
        <Box flexGrow={1} />
        {hunks.length > 0 && <Button key="clear" label="Clear" dimColor onPress={onClear} />}
      </Box>
      {root !== '' && <Text color={DRACULA.comment} wrap="truncate-start">{tilde(root)}</Text>}

      {hunks.length === 0 && (
        <Box flexDirection="column" marginTop={1} alignItems="center">
          <Text color={DRACULA.purple}>Δ</Text>
          <Text color={DRACULA.comment} italic>No edits yet. Changes show up here as Claude makes them.</Text>
        </Box>
      )}

      {files.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {rule}
          <Box key="file-all" flexDirection="row" gap={1} alignItems="center" paddingX={1}
            backgroundColor={current === null ? DRACULA.currentLine : undefined}>
            <Text color={DRACULA.purple}>{current === null ? '›' : ' '}</Text>
            {current === null
              ? <Text color={DRACULA.foreground} bold>All files</Text>
              : <Button key="pick-all" label="All files" dimColor onPress={() => onPick(null)} />}
          </Box>
          {files.map(file => (
            <FileRow ui={ui} file={file} root={root} isCurrent={file.path === current} onPick={onPick} />
          ))}
          {rule}
        </Box>
      )}

      {shown.files.map(file => <FileDiff ui={ui} file={file} root={root} />)}
      {shown.hiddenLines > 0 && (
        <Box marginTop={1}>
          <Text color={DRACULA.comment} italic>
            ⋯ {shown.hiddenLines} more lines{current === null ? '; pick a file above to see its whole diff' : ''}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function Counts({ ui, added, removed }: { ui: Ui; added: number; removed: number }) {
  const { Text } = ui
  return (
    <Text>
      <Text color={DRACULA.green}>+{added}</Text>
      <Text color={DRACULA.comment}> </Text>
      <Text color={DRACULA.red}>-{removed}</Text>
    </Text>
  )
}

function Status({ ui, isNewFile }: { ui: Ui; isNewFile: boolean }) {
  const { Text } = ui
  return <Text color={isNewFile ? DRACULA.green : DRACULA.orange} bold>{isNewFile ? 'A' : 'M'}</Text>
}

function ChangeBar({ ui, added, removed }: { ui: Ui; added: number; removed: number }) {
  const { Text } = ui
  const total = added + removed
  const plus = total === 0 ? 0 : Math.round((added / total) * 5)
  const minus = total === 0 ? 0 : Math.min(5 - plus, Math.max(removed > 0 ? 1 : 0, 5 - plus))
  return (
    <Text>
      <Text color={DRACULA.green}>{'■'.repeat(plus)}</Text>
      <Text color={DRACULA.red}>{'■'.repeat(minus)}</Text>
      <Text color={DRACULA.currentLine}>{'■'.repeat(5 - plus - minus)}</Text>
    </Text>
  )
}

type FileRowProps = { ui: Ui; file: FileSummary; root: string; isCurrent: boolean; onPick: (path: string) => unknown }

function FileRow({ ui, file, root, isCurrent, onPick }: FileRowProps) {
  const { Box, Text, Button } = ui
  const { dir, name } = splitPath(file.path.slice(root.length))

  return (
    <Box key={`file-${file.path}`} flexDirection="row" gap={1} alignItems="center" paddingX={1}
      backgroundColor={isCurrent ? DRACULA.currentLine : undefined}>
      <Text color={DRACULA.purple}>{isCurrent ? '›' : ' '}</Text>
      <Status ui={ui} isNewFile={file.isNewFile} />
      {isCurrent
        ? <Text color={DRACULA.pink} bold>{name}</Text>
        : <Button key={`pick-${file.path}`} label={name} dimColor onPress={() => onPick(file.path)} />}
      <Box flexShrink={1} flexGrow={1}>
        <Text color={DRACULA.comment} wrap="truncate-start">{dir}</Text>
      </Box>
      <Counts ui={ui} added={file.added} removed={file.removed} />
      <ChangeBar ui={ui} added={file.added} removed={file.removed} />
    </Box>
  )
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return (
    <Box padding={1}>
      <Text color={DRACULA.red}>Diff pane failed to draw: {message}</Text>
    </Box>
  )
}

type ShownHunk = { hunk: Hunk; lines: DiffLine[]; hidden: number }
type ShownFile = FileSummary & { shown: ShownHunk[] }

function budgetLines(files: readonly FileSummary[], budget: number) {
  let left = budget
  let hiddenLines = 0
  const shownFiles: ShownFile[] = []

  for (const file of files) {
    const shown: ShownHunk[] = []
    for (const hunk of file.hunks) {
      const take = Math.max(0, Math.min(left, hunk.lines.length))
      left -= take
      if (take > 0) shown.push({ hunk, lines: hunk.lines.slice(0, take), hidden: hunk.lines.length - take })
      else hiddenLines += hunk.lines.length
    }
    if (shown.length > 0) shownFiles.push({ ...file, shown })
  }

  hiddenLines += shownFiles.reduce((sum, f) => sum + f.shown.reduce((s, h) => s + h.hidden, 0), 0)
  return { files: shownFiles, hiddenLines }
}

function FileDiff({ ui, file, root }: { ui: Ui; file: ShownFile; root: string }) {
  const { Box, Text } = ui
  const { dir, name } = splitPath(file.path.slice(root.length))

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" gap={1} alignItems="center" backgroundColor={DRACULA.currentLine} paddingX={1}>
        <Status ui={ui} isNewFile={file.isNewFile} />
        <Box flexShrink={1} flexGrow={1}>
          <Text wrap="truncate-start">
            <Text color={DRACULA.comment}>{dir}</Text>
            <Text color={DRACULA.pink} bold>{name}</Text>
          </Text>
        </Box>
        <Counts ui={ui} added={file.added} removed={file.removed} />
      </Box>
      {file.shown.map(part => <HunkView ui={ui} part={part} />)}
    </Box>
  )
}

function HunkView({ ui, part }: { ui: Ui; part: ShownHunk }) {
  const { Box, Text } = ui
  const { hunk, lines: shown, hidden } = part
  const oldStart = hunk.lines.find(l => l.oldNo !== undefined)?.oldNo
  const newStart = hunk.lines.find(l => l.newNo !== undefined)?.newNo
  const range = oldStart !== undefined && newStart !== undefined ? `@@ -${oldStart} +${newStart} @@ ` : '@@ '

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={DRACULA.purple} dimColor>{range}{hunk.isNewFile ? 'new file' : hunk.tool.toLowerCase()}</Text>
      {shown.map(line => <LineRow ui={ui} line={line} />)}
      {hidden > 0 && <Text color={DRACULA.comment} italic>  ⋯ {hidden} more lines</Text>}
    </Box>
  )
}

function LineRow({ ui, line }: { ui: Ui; line: DiffLine }) {
  const { Box, Text } = ui
  const marker = line.kind === 'add' ? ' + ' : line.kind === 'del' ? ' - ' : '   '
  const markerColor = line.kind === 'add' ? DRACULA.green : line.kind === 'del' ? DRACULA.red : DRACULA.comment

  return (
    <Box flexDirection="row" backgroundColor={line.kind === 'ctx' ? undefined : ROW_TINT[line.kind]}>
      <Text color={DRACULA.comment} dimColor>{gutter(line.oldNo)} {gutter(line.newNo)}</Text>
      <Text color={markerColor} bold>{marker}</Text>
      <Text wrap="truncate-end" color={line.kind === 'ctx' ? DRACULA.comment : DRACULA.foreground}>
        {line.text === '' ? ' ' : line.text}
      </Text>
    </Box>
  )
}

function gutter(n: number | undefined) {
  return (n === undefined ? '' : String(n)).padStart(4)
}

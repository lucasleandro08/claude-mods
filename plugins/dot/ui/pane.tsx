import type { Elements, RenderSurface } from 'claude-code'

import type { Goal, Profile, RoundStatus } from '../types'
import { avatarSvg } from '../src/avatar'
import { BRIEFING_CHOICES, clock, moodOf, nextRoundAt, ROUND_CHOICES, splitLinks } from '../src/dot'
import { DRACULA } from '../src/shared/theme'

type Ui = Elements[RenderSurface]

const AVATAR_PX = 64
const THREADS_SHOWN = 8
const STUCK_MS = 10 * 60_000
const BUBBLE_WIDTH = '82%'

// Surfaces a step off the pane background, so groups read without borders
const SURFACE = '#21222c'
const MINE = '#44475a'
const QUESTION = '#3b3326'

export const SUGGESTIONS = [
  { label: "Today's agenda", text: 'What is on my calendar today, and what should I prepare?' },
  { label: 'Unanswered Slack', text: 'Who is waiting on a reply from me on Slack?' },
  { label: 'Important emails', text: 'Any important email that needs my answer?' },
]

export type Notice = { tone: 'ok' | 'error' | 'info'; text: string }

export type DotPaneProps = {
  ui: Ui
  profile: Profile
  goals: Goal[]
  round: RoundStatus
  now: number
  notice: Notice | null
  dotDir: string
  showSettings: boolean
  onAdd: (title: string) => unknown
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
  onPause: () => unknown
  onRunNow: () => unknown
  onSchedule: () => unknown
  onEvery: (minutes: number) => unknown
  onBriefing: (time: string) => unknown
  onToggleSettings: () => unknown
}

const NOTICE_COLOR = { ok: DRACULA.green, error: DRACULA.orange, info: DRACULA.cyan } as const

function statusLine(profile: Profile, round: RoundStatus, now: number): { text: string; color: string } {
  if (!profile.scheduled) return { text: '○ Off. Turn it on to let it work on its own.', color: DRACULA.orange }
  if (profile.paused) return { text: '○ Paused', color: DRACULA.comment }
  if (round.state === 'running') {
    const since = round.at > 0 ? ` · since ${clock(round.at)}` : ''
    if (round.at > 0 && now - round.at > STUCK_MS) {
      return { text: `● Stuck${since}. It may be waiting for an approval in "${profile.name} · work".`, color: DRACULA.orange }
    }
    return { text: `● Working${round.goal ? ` on “${round.goal}”` : ''}${since}`, color: DRACULA.green }
  }
  const last = round.at > 0 ? ` · last ${clock(round.at)}` : ''
  return { text: `● Online · next round ${clock(nextRoundAt(profile.everyMinutes, now))}${last}`, color: DRACULA.purple }
}

export function DotPane(props: DotPaneProps) {
  const { ui, profile, goals, round, now, notice } = props
  const { Box, Text, Button } = ui
  const status = statusLine(profile, round, now)
  const threads = [...goals].sort((a, b) => a.createdAt - b.createdAt).slice(-THREADS_SHOWN)
  const canRun = profile.scheduled && !profile.paused && round.state !== 'running'

  return (
    <Box flexDirection="column" backgroundColor={DRACULA.background} paddingX={2} paddingY={1} rowGap={1}>
      <Box flexDirection="row" gap={2} alignItems="center">
        {'Svg' in ui
          ? <ui.Svg source={avatarSvg(moodOf(profile, goals), AVATAR_PX)} alt={profile.name} width={AVATAR_PX} height={AVATAR_PX} />
          : <Text color={DRACULA.purple}>{profile.emoji}</Text>}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} rowGap={0}>
          <Text color={DRACULA.foreground} bold>{profile.name}</Text>
          <Text color={status.color} wrap="wrap">{status.text}</Text>
        </Box>
        <Box flexDirection="row" gap={2} flexShrink={0} alignItems="center">
          {!profile.scheduled && <Button key="schedule" label="Turn on" onPress={props.onSchedule} />}
          {canRun && <Button key="run-now" label="Run now" plain dimColor onPress={props.onRunNow} />}
          <Button key="settings" label={props.showSettings ? 'Close' : 'Settings'} plain dimColor onPress={props.onToggleSettings} />
        </Box>
      </Box>

      {props.showSettings && <Settings {...props} />}
      {notice && <Text color={NOTICE_COLOR[notice.tone]} wrap="wrap">{notice.text}</Text>}

      <Box flexDirection="column" rowGap={2} paddingY={1}>
        {threads.length === 0 && <Empty ui={ui} name={profile.name} />}
        {threads.map(goal => (
          <Thread ui={ui} goal={goal} name={profile.name} emoji={profile.emoji} nextAt={clock(nextRoundAt(profile.everyMinutes, now))}
            running={round.state === 'running' && round.goal === goal.title}
            onAnswer={props.onAnswer} onDone={props.onDone} onRemove={props.onRemove} />
        ))}
      </Box>

      <Composer ui={ui} name={profile.name} count={goals.length} onAdd={props.onAdd} />
    </Box>
  )
}

function Empty({ ui, name }: { ui: Ui; name: string }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" rowGap={0} paddingY={1}>
      <Text color={DRACULA.foreground} bold>{`Hi, I'm ${name}.`}</Text>
      <Text color={DRACULA.comment} wrap="wrap">Ask me anything. I keep working on it in the background, read your Slack, email and calendar, and ask before doing anything risky.</Text>
    </Box>
  )
}

function Settings({ ui, profile, dotDir, onEvery, onBriefing, onPause }: DotPaneProps) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" rowGap={1} backgroundColor={SURFACE} paddingX={2} paddingY={1}>
      {'Select' in ui ? (
        <Box flexDirection="row" gap={3} flexWrap="wrap">
          <ui.Select key="every" label="Rounds" value={String(profile.everyMinutes)}
            options={ROUND_CHOICES.map(m => ({ value: String(m), label: m < 60 ? `every ${m} min` : `every ${m / 60} h` }))}
            onSelect={(v: string) => void onEvery(Number(v))} />
          <ui.Select key="briefing" label="Weekday briefing" value={profile.briefing || 'off'}
            options={BRIEFING_CHOICES.map(t => ({ value: t, label: t === 'off' ? 'off' : `at ${t}` }))}
            onSelect={(v: string) => void onBriefing(v)} />
        </Box>
      ) : (
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text color={DRACULA.comment}>Rounds:</Text>
          {ROUND_CHOICES.map(m => m === profile.everyMinutes
            ? <Text color={DRACULA.purple} bold>{m < 60 ? `${m}m` : `${m / 60}h`}</Text>
            : <Button key={`every-${m}`} label={m < 60 ? `${m}m` : `${m / 60}h`} dimColor plain onPress={() => onEvery(m)} />)}
        </Box>
      )}
      <Box flexDirection="row" gap={2} alignItems="center">
        {profile.scheduled && <Button key="pause" label={profile.paused ? 'Resume rounds' : 'Pause rounds'} plain dimColor onPress={onPause} />}
        <Box flexGrow={1} flexShrink={1}><Text color={DRACULA.comment} wrap="truncate-start">{`Files: ${dotDir}`}</Text></Box>
      </Box>
    </Box>
  )
}

type ThreadProps = {
  ui: Ui
  goal: Goal
  name: string
  emoji: string
  nextAt: string
  running: boolean
  onAnswer: (id: string, answer: string) => unknown
  onDone: (id: string) => unknown
  onRemove: (id: string) => unknown
}

function Mine({ ui, id, text, meta }: { ui: Ui; id: string; text: string; meta?: string }) {
  const { Box, Text } = ui
  return (
    <Box key={id} flexDirection="column" alignItems="flex-end" rowGap={0}>
      <Box width={BUBBLE_WIDTH} flexDirection="row" justifyContent="flex-end">
        <Box flexShrink={1} backgroundColor={MINE} paddingX={2}>
          <Text color={DRACULA.foreground} wrap="wrap">{text}</Text>
        </Box>
      </Box>
      {meta && <Text color={DRACULA.comment}>{meta}</Text>}
    </Box>
  )
}

function Reply({ ui, id, name, emoji, text, tone, background }: { ui: Ui; id: string; name: string; emoji: string; text: string; tone?: string; background?: string }) {
  const { Box, Text, Link } = ui
  if ('Markdown' in ui && !tone) {
    return (
      <Box key={id} flexDirection="row" gap={1} alignItems="flex-start">
        <Box flexShrink={0} width={3}><Text>{emoji}</Text></Box>
        <Box width={BUBBLE_WIDTH} flexDirection="column" rowGap={0}>
          <Text color={DRACULA.purple} bold>{name}</Text>
          <ui.Markdown text={text} />
        </Box>
      </Box>
    )
  }
  const { body, links } = splitLinks(text)
  const lines = body.split('\n').filter(line => line.trim() !== '')
  return (
    <Box key={id} flexDirection="row" gap={1} alignItems="flex-start">
      <Box flexShrink={0} width={3}><Text>{emoji}</Text></Box>
      <Box width={BUBBLE_WIDTH} flexDirection="column" rowGap={0} backgroundColor={background} paddingX={background ? 2 : 0} paddingY={background ? 1 : 0}>
        <Text color={DRACULA.purple} bold>{name}</Text>
        {lines.map((line, index) => <Text key={`${id}-l${index}`} color={tone ?? DRACULA.foreground} wrap="wrap">{line}</Text>)}
        {links.length > 0 && (
          <Box flexDirection="row" gap={2} flexWrap="wrap" marginTop={1}>
            {links.map((link, index) => <Link key={`${id}-k${index}`} href={link.href} label={`${link.label} ↗`} />)}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// One goal as a short conversation; its actions show only while you hover it
function Thread({ ui, goal, name, emoji, nextAt, running, onAnswer, onDone, onRemove }: ThreadProps) {
  const { Box, Text, Button } = ui
  const replies = goal.notes.filter(note => !note.startsWith('You: ')).length
  const state = goal.status === 'done'
    ? (replies === 0 ? { text: `Done, but ${name} left no reply`, color: DRACULA.orange } : { text: `✓ Done · ${clock(goal.updatedAt)}`, color: DRACULA.comment })
    : {
        queued: { text: `${name} starts on this in the next round · ${nextAt}`, color: DRACULA.comment },
        working: { text: running ? `${name} is working on this…` : `${name} continues in the next round · ${nextAt}`, color: DRACULA.green },
        waiting: { text: `${name} needs your answer`, color: DRACULA.orange },
      }[goal.status]

  return (
    <Box key={`thread-${goal.id}`} flexDirection="column" rowGap={1}>
      <Mine ui={ui} id={`ask-${goal.id}`} text={goal.title} meta={clock(goal.createdAt)} />
      {goal.notes.map((note, index) => note.startsWith('You: ')
        ? <Mine ui={ui} id={`note-${goal.id}-${index}`} text={note.slice(5)} />
        : <Reply ui={ui} id={`note-${goal.id}-${index}`} name={name} emoji={emoji} text={note} />)}
      {goal.status === 'waiting' && goal.question !== '' && (
        <Reply ui={ui} id={`question-${goal.id}`} name={name} emoji={emoji} text={goal.question} tone={DRACULA.orange} background={QUESTION} />
      )}
      {goal.status === 'waiting' && 'Input' in ui && (
        <Box flexDirection="row" paddingLeft={4}>
          <Box width={BUBBLE_WIDTH} backgroundColor={MINE} paddingX={2}>
            <ui.Input key={`answer-${goal.id}-${goal.notes.length}`} placeholder={`Reply to ${name}…`} submitLabel="send" value=""
              onSubmit={(text: string) => void onAnswer(goal.id, text)} />
          </Box>
        </Box>
      )}
      <Box key={`actions-${goal.id}`} flexDirection="row" gap={2} paddingLeft={4} alignItems="center">
        <Box flexGrow={1} flexShrink={1}><Text color={state.color} wrap="wrap">{state.text}</Text></Box>
        <Box display="none" hover={{ display: 'flex' }} flexDirection="row" gap={2} flexShrink={0}>
          {goal.status !== 'done' && <Button key={`done-${goal.id}`} label="Mark done" dimColor plain onPress={() => onDone(goal.id)} />}
          <Button key={`remove-${goal.id}`} label="Delete" dimColor plain onPress={() => onRemove(goal.id)} />
        </Box>
      </Box>
    </Box>
  )
}

// Keyed by the goal count so the field comes back empty once a message lands
function Composer({ ui, name, count, onAdd }: { ui: Ui; name: string; count: number; onAdd: (title: string) => unknown }) {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        {SUGGESTIONS.map(s => <Button key={`suggest-${s.label}`} label={s.label} plain dimColor onPress={() => onAdd(s.text)} />)}
      </Box>
      {'Input' in ui && (
        <Box backgroundColor={MINE} paddingX={2} paddingY={1}>
          <ui.Input key={`new-goal-${count}`} placeholder={`Ask ${name}…`} submitLabel="send" autoFocus value=""
            onSubmit={(text: string) => void onAdd(text)} />
        </Box>
      )}
      <Text color={DRACULA.comment} wrap="wrap">{`Long message? Type /dot <message> in the main prompt. ${name} starts right away.`}</Text>
    </Box>
  )
}

export function PaneError({ ui, message }: { ui: Ui; message: string }) {
  const { Box, Text } = ui
  return <Box padding={1}><Text color={DRACULA.red}>{`The pane couldn't draw: ${message}`}</Text></Box>
}

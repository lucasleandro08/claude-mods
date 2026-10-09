import type { Goal, GoalStatus, Profile, RoundStatus } from '../types'

export const DOT_DIR = '.claude-dot'
export const WORK_TASK = 'dot-work'
export const BRIEFING_TASK = 'dot-briefing'
export const DEFAULT_PROFILE: Profile = { name: 'Vlad', emoji: '🧛', paused: false, scheduled: false, everyMinutes: 30, briefing: '09:00', seenAt: 0 }
export const IDLE_ROUND: RoundStatus = { state: 'idle', goal: '', summary: '', at: 0 }
export const ROUND_CHOICES = [15, 30, 60, 120] as const
export const BRIEFING_CHOICES = ['off', '08:00', '09:00', '10:00', '18:00'] as const

export type DotPaths = { dir: string; profile: string; goals: string; round: string; memory: string; rules: string; work: string; briefing: string }

export function dotPaths(home: string): DotPaths {
  const dir = `${home}/${DOT_DIR}`
  return {
    dir,
    profile: `${dir}/profile.json`,
    goals: `${dir}/goals.json`,
    round: `${dir}/round.json`,
    memory: `${dir}/memory.md`,
    rules: `${dir}/rules.md`,
    work: `${dir}/work.md`,
    briefing: `${dir}/briefing.md`,
  }
}

export function parseProfile(text: string): Profile {
  try {
    const parsed = JSON.parse(text) as Partial<Profile>
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name.trim() : DEFAULT_PROFILE.name,
      emoji: typeof parsed.emoji === 'string' && parsed.emoji.trim() !== '' ? parsed.emoji.trim() : DEFAULT_PROFILE.emoji,
      paused: parsed.paused === true,
      scheduled: parsed.scheduled === true,
      everyMinutes: typeof parsed.everyMinutes === 'number' && parsed.everyMinutes >= 5 ? parsed.everyMinutes : DEFAULT_PROFILE.everyMinutes,
      briefing: typeof parsed.briefing === 'string' ? parsed.briefing : DEFAULT_PROFILE.briefing,
      seenAt: typeof parsed.seenAt === 'number' ? parsed.seenAt : 0,
    }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

const STATUSES: readonly GoalStatus[] = ['queued', 'working', 'waiting', 'done']

export function parseGoals(text: string): Goal[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((raw): Goal[] => {
    const g = raw as Partial<Goal>
    if (typeof g.id !== 'string' || typeof g.title !== 'string') return []
    return [{
      id: g.id,
      title: g.title,
      status: STATUSES.includes(g.status as GoalStatus) ? (g.status as GoalStatus) : 'queued',
      notes: Array.isArray(g.notes) ? g.notes.filter((n): n is string => typeof n === 'string') : [],
      question: typeof g.question === 'string' ? g.question : '',
      createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
      updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : 0,
    }]
  })
}

export function parseRound(text: string): RoundStatus {
  try {
    const parsed = JSON.parse(text) as Partial<RoundStatus>
    return {
      state: parsed.state === 'running' ? 'running' : 'idle',
      goal: typeof parsed.goal === 'string' ? parsed.goal : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      at: typeof parsed.at === 'number' ? parsed.at : 0,
    }
  } catch {
    return { ...IDLE_ROUND }
  }
}

// Rounds write their state without a clock; the mod stamps the moment it sees it change
export function stampRound(before: RoundStatus, after: RoundStatus, now: number): { round: RoundStatus; changed: boolean } {
  const moved = before.state !== after.state || before.goal !== after.goal || before.summary !== after.summary
  if (after.at !== 0 && !moved) return { round: after, changed: false }
  return { round: { ...after, at: moved || after.at === 0 ? now : after.at }, changed: true }
}

export function nextRoundAt(everyMinutes: number, now: number) {
  const d = new Date(now)
  d.setSeconds(0, 0)
  if (everyMinutes < 60) {
    const m = d.getMinutes()
    d.setMinutes(m - (m % everyMinutes) + everyMinutes)
  } else {
    const hours = Math.round(everyMinutes / 60)
    const h = d.getHours()
    d.setMinutes(0)
    d.setHours(h - (h % hours) + hours)
  }
  return d.getTime()
}

export function clock(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function serialize(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function addGoal(goals: Goal[], title: string, now: number): Goal[] {
  const text = title.trim()
  if (text === '') return goals
  const id = `g${now.toString(36)}`
  return [...goals, { id, title: text, status: 'queued', notes: [], question: '', createdAt: now, updatedAt: now }]
}

export function answerGoal(goals: Goal[], id: string, answer: string, now: number): Goal[] {
  const text = answer.trim()
  if (text === '') return goals
  return goals.map(g =>
    g.id === id ? { ...g, status: 'queued', notes: [...g.notes, `You: ${text}`], question: '', updatedAt: now } : g,
  )
}

export function setStatus(goals: Goal[], id: string, status: GoalStatus, now: number): Goal[] {
  return goals.map(g => (g.id === id ? { ...g, status, updatedAt: now } : g))
}

export function removeGoal(goals: Goal[], id: string): Goal[] {
  return goals.filter(g => g.id !== id)
}

export function byStatus(goals: Goal[]) {
  const sorted = [...goals].sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    waiting: sorted.filter(g => g.status === 'waiting'),
    active: sorted.filter(g => g.status === 'working' || g.status === 'queued'),
    done: sorted.filter(g => g.status === 'done'),
  }
}

// Rounds edit goals without touching timestamps; a goal whose content changed gets stamped here
export function stampChanged(before: Goal[], after: Goal[], now: number): { goals: Goal[]; changed: boolean } {
  let changed = false
  const goals = after.map(goal => {
    const old = before.find(g => g.id === goal.id)
    const moved = old !== undefined && (old.status !== goal.status || old.notes.length !== goal.notes.length || old.question !== goal.question)
    const fresh = goal.createdAt === 0
    if (!moved && !fresh) return goal
    changed = true
    return { ...goal, createdAt: goal.createdAt || now, updatedAt: now }
  })
  return { goals, changed }
}

export function newlyWaiting(before: Goal[], after: Goal[]): Goal[] {
  const was = new Set(before.filter(g => g.status === 'waiting').map(g => g.id))
  return after.filter(g => g.status === 'waiting' && !was.has(g.id))
}

export function everyMinutesCron(minutes: number) {
  const m = Math.max(5, Math.round(minutes))
  if (m < 60) return `*/${m} * * * *`
  const hours = Math.max(1, Math.round(m / 60))
  return hours >= 24 ? '0 9 * * *' : `0 */${hours} * * *`
}

export function briefingCron(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return `${minute} ${hour} * * 1-5`
}

export function allowRules(): string[] {
  return [`Read(~/${DOT_DIR}/**)`, `Edit(~/${DOT_DIR}/**)`]
}

export const DEFAULT_RULES = `# Rules

Each action falls in one level. When unsure, use the stricter one.

## Act without asking
- Read code, files, docs, logs, dashboards and connected apps.
- Run read-only commands and tests on the local machine.
- Write notes and drafts inside ~/.claude-dot/ and in local branches or worktrees.

## Ask first (set the goal to "waiting" with a question)
- Send a message into another Claude Code session, unless the goal itself asks for exactly that.
- Commit, push, open or comment on pull requests.
- Send any message (Slack, email, PR comments) on the user's behalf.
- Change shared configuration, deploy anything, or write to a staging environment.

## Hand off to the user (never do it, explain what to do)
- Anything in production: writes, restarts, deploys, data changes.
- Passwords, credentials, secrets, payments, purchases, account settings.
- Deleting data permanently.
`

export function workPrompt(name: string, paths: DotPaths, allowedTools: readonly string[] = []) {
  return `You are ${name}, the user's always-on assistant. This is one background work round; nobody is watching it live.

1. Read ${paths.profile}. If "paused" is true, stop now without doing anything.
   Then write ${paths.round} as {"state": "running", "goal": "<title of the goal you pick>", "summary": ""} once you pick a goal (step 3).
2. Read ${paths.goals} (a JSON array of goals), ${paths.rules} and ${paths.memory}.
3. Pick ONE goal: the oldest with status "queued" first (a new question or an answer from the user, so it never waits behind long jobs), else the oldest "working". If none, stop now: do not invent work.
4. Set it to "working" and work on it for this round only. Follow the rules file: "Hand off" is never done. "Ask first" is done only once the user approved it: a "You: ..." note on that goal saying yes, "pode", "pode fazer", "faz" or similar counts as approval for what you proposed. Then do it, in parts across rounds when it is big, without asking again.
5. Before finishing, update that goal in ${paths.goals} (keep every other goal untouched, keep valid JSON):
   - ALWAYS append one note to "notes" written to the user, as a chat reply: the answer itself when the goal is a question, otherwise what you did or found and what is next. Never finish a round without this note;
   - status "done" when the goal is complete;
   - status "waiting" with a one-sentence "question" when you need a decision, an approval or a hand-off, then send a desktop notification (PushNotification) saying "${name}: " and the question;
   - otherwise keep "working".
   Leave "createdAt" and "updatedAt" as they are: the dot stamps them. Edit the file with the Edit or Write tool, not the shell.
6. Add to ${paths.memory} anything durable you learned about the user's preferences or setup (short bullets, no secrets).
7. Last, write ${paths.round} as {"state": "idle", "goal": "<that goal's title>", "summary": "<one short line of what this round did>"}. If there was no goal, leave ${paths.round} untouched.

Nobody can approve anything during this round: any call that asks for approval hangs it forever. So:
- never use the shell (Bash) at all. Use only Read, Grep and Glob, which work anywhere under the home folder without approval;
- for git history, Read <repository>/.git/logs/HEAD: each line is "old new author <email> timestamp timezone<TAB>action: message", the last line is the latest commit; the current branch is in <repository>/.git/HEAD;
- connected apps (Slack, email, calendar…): their read tools (search, read, list, get) are pre-approved. Load tools with ToolSearch first when they are deferred;
- the only other tools that run without approval are these (any tool not listed here or above hangs the round, so never call it): ${allowedTools.length > 0 ? allowedTools.join(', ') : 'none'}. When an approved action needs a tool that is not listed, say in the note exactly which tool name the user should add to permissions.allow in ~/.claude/settings.json;
- your other Claude Code sessions: list_sessions, get_session, list_events and search_session_transcripts (mcp__ccd_session_mgmt__*) show what each one is doing; read them freely. send_message (or SendMessage) delivers a message into one as a user turn, so that session acts on it: only send when the goal itself asks you to, or the user approved that exact message in the thread, and say in the note which session you messaged and what;
- sending a message on the user's behalf (Slack, email): only when the goal itself asks you to send it, or the user approved it in the thread. Write it in the user's voice and language, short, and put the exact text you sent and where (channel or person, with the link) in your note;
- when the app isn't connected (ToolSearch finds no tool for it), say so in the note and tell the user to connect it in the claude.ai connector settings;
- if the goal really needs a shell command or a web request, do not try it: set the goal to "waiting" and ask the user to run it, with the exact command.
Never print or store secrets. Write notes in the user's language (see the memory file), else the goal's language. Keep notes short and scannable: lead with the answer, then a few short lines or a numbered list.`
}

export function briefingPrompt(name: string, paths: DotPaths) {
  return `You are ${name}, the user's always-on assistant. This is the morning briefing.

1. Read ${paths.profile}. If "paused" is true, stop now.
2. Read ${paths.goals}, ${paths.rules} and ${paths.memory}.
3. Look around read-only, following the rules file: goals in progress, what is waiting on the user, and anything in the connected tools that is worth their attention today (open pull requests and CI, failing builds, things the goals depend on). Do not change anything.
4. Send one desktop notification (PushNotification, under 200 characters) with the most important thing, starting with "${name}: ".
5. Append the full briefing (a few bullets) as a note to a goal titled "Briefings" in ${paths.goals}, creating it with status "done" if missing (any unique "id"). Do not touch timestamps; edit the file with the Edit or Write tool.

Write in the language of the user's goals.`
}

export function taskPointer(path: string) {
  return `Read ${path} and follow it exactly.`
}

export type Mood = 'working' | 'waiting' | 'done' | 'idle' | 'paused'

const replies = (goal: Goal) => goal.notes.filter(note => !note.startsWith('You: ')).length

// Goals with a reply you haven't acknowledged yet
export function unreadGoals(goals: Goal[], seenAt: number): Goal[] {
  return goals.filter(goal => goal.status !== 'queued' && goal.status !== 'waiting' && goal.updatedAt > seenAt && replies(goal) > 0)
}

// Goals whose reply count grew between two reads: what a round just answered
export function newlyAnswered(before: Goal[], after: Goal[]): Goal[] {
  return after.filter(goal => {
    const old = before.find(g => g.id === goal.id)
    return old !== undefined && replies(goal) > replies(old)
  })
}

// A running round wins: that is it working right now; then a question for you, then replies you haven't seen
export function moodOf(profile: Profile, goals: Goal[], round?: RoundStatus): Mood {
  if (profile.paused) return 'paused'
  if (round ? round.state === 'running' : goals.some(g => g.status === 'working')) return 'working'
  if (goals.some(g => g.status === 'waiting')) return 'waiting'
  if (unreadGoals(goals, profile.seenAt).length > 0) return 'done'
  return 'idle'
}

export function activityOf(profile: Profile, goals: Goal[]) {
  const { waiting, active } = byStatus(goals)
  if (profile.paused) return { status: 'paused', detail: 'No rounds until you resume' }
  const asking = waiting[0]
  if (asking) return { status: 'waiting on you', detail: asking.question || asking.title }
  const current = active.find(g => g.status === 'working')
  if (current) return { status: 'working', detail: current.notes[current.notes.length - 1] ? `${current.title} · ${current.notes[current.notes.length - 1]}` : current.title }
  const next = active[active.length - 1]
  if (next) return { status: profile.scheduled ? 'up next' : 'queued', detail: next.title }
  return { status: 'idle', detail: 'No goals yet' }
}

export type NoteLink = { href: string; label: string }

const LINK_NAMES: [RegExp, string][] = [
  [/slack\.com/, 'Slack'], [/mail\.google\.com/, 'Gmail'], [/meet\.google\.com/, 'Meet'], [/calendar\.google\.com/, 'Calendar'],
  [/docs\.google\.com/, 'Docs'], [/github\.com/, 'GitHub'], [/notion\.so/, 'Notion'],
]

// Pulls URLs out of a note so the text reads clean and the links become chips under it
export function splitLinks(text: string): { body: string; links: NoteLink[] } {
  const links: NoteLink[] = []
  const body = text
    .replace(/\(?(https?:\/\/[^\s)]+)\)?/g, (_, raw: string) => {
      const trail = /[.,;:!?]+$/.exec(raw)?.[0] ?? ''
      const href = raw.slice(0, raw.length - trail.length)
      const host = href.replace(/^https?:\/\//, '').split('/')[0] ?? href
      const name = LINK_NAMES.find(([pattern]) => pattern.test(host))?.[1] ?? host.replace(/^www\./, '')
      const same = links.filter(link => link.label.startsWith(name)).length
      links.push({ href, label: same === 0 ? name : `${name} ${same + 1}` })
      return trail
    })
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return { body, links }
}

const READ_TOOL = /__(?:[a-z]+_)?(search|read|list|get)[a-z_]*$/

// Write tools the user allowed in settings, so a round knows what it may call without hanging
export function writeToolsAllowed(settingsText: string): string[] {
  try {
    const allow = (JSON.parse(settingsText) as { permissions?: { allow?: unknown } }).permissions?.allow
    return Array.isArray(allow) ? allow.filter((rule): rule is string => typeof rule === 'string' && rule.startsWith('mcp__') && !READ_TOOL.test(rule) && !rule.includes('Claude_Browser') && !rule.includes('claude-in-chrome')) : []
  } catch {
    return []
  }
}

// Session ids of a task's runs still going, from the list_task_runs answer text
export function runningRunIds(text: string): string[] {
  try {
    const runs = (JSON.parse(text) as { runs?: { session_id?: unknown; status?: unknown }[] }).runs ?? []
    return runs.filter(run => run.status === 'running' && typeof run.session_id === 'string').map(run => run.session_id as string)
  } catch {
    return []
  }
}

// The goal a stuck round was on becomes a question, so the next rounds don't walk into the same wall
export function markStuck(goals: Goal[], title: string, minutes: number, now: number): Goal[] {
  return goals.map(goal => goal.title === title && goal.status !== 'done'
    ? { ...goal, status: 'waiting', question: `A round on this stopped after ${minutes} min waiting for an approval nobody could give. Should I try another way, or will you do that step?`, updatedAt: now }
    : goal)
}

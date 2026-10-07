import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { ContainerChoice, PodRow } from '../types'
import { pickNamespace, shellCommand, shortContext, toRows, withContext, type PodJson } from '../src/pods'
import { binaryCandidates } from '../src/shared/bin'
import { ContextChip, contextChip } from '../ui/chip'
import { PaneError, PodsPane } from '../ui/pane'
import { isOn, OFF_TEXT, parseState, statePath } from '../src/shared/toggle'
import { barIsLive, sameChip, type Chip, type ChipPress } from '../src/shared/chip'

const MOD = 'kube-pane'
const CHECK_MS = 5000
const active = atom({ plugin: 'kube-pane', key: 'active' } as const, false)
let checkedAt = 0

async function isActive($: EngineInterface) {
  if (Date.now() - checkedAt > CHECK_MS) {
    checkedAt = Date.now()
    const home = await $.env.get('HOME').catch(() => undefined)
    const text = await $.fs.read(statePath(home)).catch(() => '')
    const on = isOn(parseState(text), MOD)
    await update($, active, prev => (prev === on ? prev : on))
  }
  return read($, active)
}

const chip = atom({ plugin: 'kube-pane', key: 'chip' } as const, null)

async function barOwnsChips($: EngineInterface) {
  const { value } = await $.state.get({ plugin: 'mod-manager', key: 'bar' })
  return barIsLive(value, Date.now())
}

async function setChip($: EngineInterface, next: Chip | null) {
  await update($, chip, prev => (sameChip(prev, next) ? prev : next))
}

const PANE_ID = 'kube-pane'

const context = atom({ plugin: 'kube-pane', key: 'context' } as const, '')
const contexts = atom({ plugin: 'kube-pane', key: 'contexts' } as const, [])
const namespace = atom({ plugin: 'kube-pane', key: 'namespace' } as const, '')
const namespaces = atom({ plugin: 'kube-pane', key: 'namespaces' } as const, [])
const pods = atom({ plugin: 'kube-pane', key: 'pods' } as const, [])
const isOpen = atom({ plugin: 'kube-pane', key: 'isOpen' } as const, false)
const isLoading = atom({ plugin: 'kube-pane', key: 'isLoading' } as const, false)
const lastError = atom({ plugin: 'kube-pane', key: 'error' } as const, '')
const updatedAt = atom({ plugin: 'kube-pane', key: 'updatedAt' } as const, 0)
const filter = atom({ plugin: 'kube-pane', key: 'filter' } as const, '')
const page = atom({ plugin: 'kube-pane', key: 'page' } as const, 0)
const containers = atom({ plugin: 'kube-pane', key: 'containers' } as const, {} as ContainerChoice)

type Settings = { production: RegExp; defaultNamespace: string; kubectlPath: string; refreshMs: number; pageSize: number }

function readSettings(options: PluginOptions): Settings {
  return {
    production: new RegExp(String(options.productionPattern ?? 'prod'), 'i'),
    defaultNamespace: String(options.defaultNamespace ?? 'default') || 'default',
    kubectlPath: String(options.kubectlPath ?? ''),
    refreshMs: Math.max(5, Number(options.refreshSeconds ?? 15)) * 1000,
    pageSize: Math.max(5, Number(options.pageSize ?? 25)),
  }
}

async function kubectl($: EngineInterface, settings: Settings, args: readonly string[]) {
  for (const bin of binaryCandidates('kubectl', await $.env.get('HOME'), settings.kubectlPath)) {
    try {
      return await $.process.run([bin, ...args], { timeoutMs: 15_000 })
    } catch {
      continue
    }
  }
  throw new Error('kubectl not found; set its path in /config')
}

async function setContext($: EngineInterface, name: string) {
  await update($, context, () => name)
  await $.env.set('CLAUDE_KUBE_CONTEXT', name)
}

async function loadContexts($: EngineInterface, settings: Settings) {
  const [list, current] = await Promise.all([
    kubectl($, settings, ['config', 'get-contexts', '-o', 'name']),
    kubectl($, settings, ['config', 'current-context']),
  ])
  await update($, contexts, () => [...new Set(list.stdout.split('\n').map(s => s.trim()).filter(Boolean))])
  if ((await read($, context)) === '' && current.exitCode === 0) await setContext($, current.stdout.trim())
}

async function loadNamespaces($: EngineInterface, settings: Settings) {
  const ran = await kubectl($, settings, ['--context', await read($, context), 'get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}'])
  const names = ran.exitCode === 0 ? ran.stdout.split(/\s+/).filter(Boolean).sort() : []
  await update($, namespaces, () => names)
  await update($, namespace, current => pickNamespace(names, current, settings.defaultNamespace))
}

async function loadPods($: EngineInterface, settings: Settings) {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  try {
    const ran = await kubectl($, settings, ['--context', await read($, context), '-n', await read($, namespace), 'get', 'pods', '-o', 'json'])
    if (ran.exitCode !== 0) throw new Error(ran.stderr.trim().split('\n')[0] || 'kubectl get pods failed')
    const parsed = JSON.parse(ran.stdout) as { items: PodJson[] }
    await update($, pods, () => toRows(parsed.items, Date.now()))
    await update($, lastError, () => '')
    await update($, updatedAt, () => Date.now())
  } catch (err) {
    await update($, lastError, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, isLoading, () => false)
  }
}

async function switchContext($: EngineInterface, settings: Settings, name: string) {
  await setContext($, name)
  await update($, pods, () => [])
  await update($, page, () => 0)
  await loadNamespaces($, settings)
  await loadPods($, settings)
}

async function switchNamespace($: EngineInterface, settings: Settings, name: string) {
  await update($, namespace, () => name)
  await update($, page, () => 0)
  await loadPods($, settings)
}

async function setFilter($: EngineInterface, query: string) {
  await update($, filter, () => query)
  await update($, page, () => 0)
}

async function openPane($: EngineInterface, settings: Settings) {
  const opened = await $.ui.open({ id: PANE_ID, title: 'Pods' })
  if (opened.isPlaced) await update($, isOpen, () => true)
  if ((await read($, contexts)).length === 0) await loadContexts($, settings)
  if ((await read($, namespaces)).length === 0) await loadNamespaces($, settings)
  await loadPods($, settings)
}

async function confirmShell($: EngineInterface, pod: string, container: string | undefined, ctx: string) {
  try {
    const answer = await $.ui.ask(
      `Open a shell in ${pod}${container ? ` (${container})` : ''} on ${shortContext(ctx)}? Avoid heavy work inside production pods.`,
      { header: 'Prod shell', options: ['Open shell', 'Cancel'] },
    )
    return answer === 'Open shell'
  } catch {
    return false
  }
}

async function openShell($: EngineInterface, settings: Settings, pod: PodRow) {
  const ctx = await read($, context)
  const ns = await read($, namespace)
  const container = pod.containers.length > 1 ? ((await read($, containers))[pod.name] ?? pod.containers[0]) : undefined

  if (settings.production.test(ctx) && !(await confirmShell($, pod.name, container, ctx))) return

  try {
    await $.tool.call({ tool: 'mcp__terminal__run_in_terminal', command: shellCommand(ctx, ns, pod.name, container), title: pod.name.slice(0, 40) })
  } catch (err) {
    $.ui.toast(`Could not open the terminal: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function publishChip($: EngineInterface, settings: Settings) {
  const ctx = await read($, context)
  await setChip($, (await read($, active)) ? contextChip(ctx, settings.production.test(ctx)) : null)
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)

  on('state.set', async ($, e, next) => {
    const ran = await next(e)
    if (e.plugin === 'mod-manager' && e.key === 'press') {
      const pressed = e.value as ChipPress | null
      if (pressed?.plugin === MOD && (await isActive($))) await openPane($, settings)
    }
    return ran
  })

  on('session.start', async ($, e, next) => {
    void isActive($)
    $.clock.every(CHECK_MS, () => {
      void Promise.all([isActive($), read($, context)])
        .then(([enabled, ctx]) => (enabled && ctx === '' ? loadContexts($, settings) : undefined))
        .catch(() => undefined)
    })
    await $.command.register({ name: 'pods', description: 'Open the pods pane for the session kubectl context' })
    void isActive($).then(enabled => (enabled ? loadContexts($, settings) : undefined)).catch(() => undefined)
    $.clock.every(settings.refreshMs, () => {
      void Promise.all([isActive($), read($, isOpen)]).then(([enabled, open]) => (enabled && open ? loadPods($, settings) : undefined))
    })

    $.clock.every(CHECK_MS, () => void publishChip($, settings).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'pods' }, async $ => {
    if (!(await isActive($))) return { text: OFF_TEXT }
    await openPane($, settings)
    return { text: 'Pods pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    if (e.id === PANE_ID) await update($, isOpen, () => false)
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isActive($))) return next(e)
    const command = withContext(e.command, await read($, context))
    return next(command === e.command ? e : { ...e, command })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, active)) || (await barOwnsChips($))) return next(e)
    const rest = await next(e)
    const ctx = await read($, context)
    if (e.props.hasSurvey) return rest

    const ui = $.ui.resolve(e)
    return (
      <ui.Box flexDirection="column">
        <ContextChip ui={ui} context={ctx} isProduction={settings.production.test(ctx)} onOpen={() => openPane($, settings)} />
        {rest}
      </ui.Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (!(await read($, active))) {
      return <ui.Box padding={1}><ui.Text color="#6272a4">{OFF_TEXT}</ui.Text></ui.Box>
    }
    try {
      const ctx = await read($, context)
      return (
        <PodsPane
          ui={ui}
          width={e.props.bodyColumns}
          isProduction={settings.production.test(ctx)}
          context={ctx}
          contexts={await read($, contexts)}
          namespace={await read($, namespace)}
          namespaces={await read($, namespaces)}
          pods={await read($, pods)}
          isLoading={await read($, isLoading)}
          error={await read($, lastError)}
          updatedAt={await read($, updatedAt)}
          filter={await read($, filter)}
          page={await read($, page)}
          pageSize={settings.pageSize}
          containers={await read($, containers)}
          onRefresh={() => loadPods($, settings)}
          onContext={name => switchContext($, settings, name)}
          onNamespace={name => switchNamespace($, settings, name)}
          onFilter={query => setFilter($, query)}
          onPage={index => update($, page, () => index)}
          onContainer={(pod, name) => update($, containers, prev => ({ ...prev, [pod]: name }))}
          onShell={pod => openShell($, settings, pod)}
        />
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      $.ui.log(`kube-pane render failed: ${message}`)
      return <PaneError ui={ui} message={message} onRefresh={() => loadPods($, settings)} />
    }
  })
}

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL|ACCESS_KEY)/
const KUBE_WRITE = /\bkubectl\b[^|;&]*\b(delete|scale|rollout|apply|patch|edit|replace|create|annotate|label|cordon|drain|taint|set)\b/
const KUBE_EXEC_RAILS = /\bkubectl\b[^|;&]*\bexec\b[^|;&]*\brails\b/
const KUBECONFIG_WRITE =
  /\baws\s+eks\s+update-kubeconfig\b|\bkubectl\b[^|;&]*\bconfig\s+(use-context|set-context|delete-context|set-cluster|set-credentials)\b/

export function secretPrintReason(command: string): string | undefined {
  if (/(^|[;&|(]\s*)(env|printenv)\s*($|[;&|)])/.test(command)) {
    return 'printing the whole environment can leak secrets.'
  }
  const printenv = command.match(/\bprintenv\s+([A-Za-z_][A-Za-z0-9_]*)/)
  if (printenv) return `printenv ${printenv[1]} prints a variable value.`
  const echoed = command.match(/\b(echo|printf)\b[^|;&]*\$\{?([A-Za-z_][A-Za-z0-9_]*)/)
  if (echoed?.[2] && SECRET_NAME.test(echoed[2].toUpperCase())) {
    return `${echoed[2]} looks like a secret and would be printed.`
  }
  return undefined
}

export function killedPorts(command: string): string[] {
  if (!/\b(kill|pkill|killall|fuser\s+-k)\b/.test(command)) return []
  return [...command.matchAll(/:(\d{2,5})\b/g)].map(m => m[1] ?? '').filter(Boolean)
}

export function killsDockerEngine(command: string) {
  return /\b(pkill|killall)\b[^|;&]*\b(docker|Docker|com\.docker)/.test(command)
}

export function changesKubeconfig(command: string) {
  return KUBECONFIG_WRITE.test(command)
}

export function isKubeWrite(command: string) {
  return KUBE_WRITE.test(command) || KUBE_EXEC_RAILS.test(command)
}

export function contextFlag(command: string) {
  return command.match(/--context[= ]'?([^'\s]+)/)?.[1]
}

export type PortOwner = { name: string; port: string }

export function portOwners(dockerPs: string, ports: readonly string[]): PortOwner[] {
  return dockerPs
    .split('\n')
    .filter(Boolean)
    .flatMap(row => {
      const [name = '', mapping = ''] = row.split('\t')
      return ports.filter(port => new RegExp(`:${port}->`).test(mapping)).map(port => ({ name, port }))
    })
}

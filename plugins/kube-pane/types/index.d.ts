export type PodRow = { name: string; ready: string; status: string; restarts: number; ageMs: number; containers: string[] }
export type ContainerChoice = Record<string, string>

declare module 'claude-code' {
  interface PluginState {
    'kube-pane': {
      active: boolean
      context: string
      contexts: string[]
      namespace: string
      namespaces: string[]
      pods: PodRow[]
      isOpen: boolean
      isLoading: boolean
      error: string
      updatedAt: number
      filter: string
      page: number
      containers: ContainerChoice
    }
  }
}

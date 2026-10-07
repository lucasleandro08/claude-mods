export type ContainerRow = {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: string[]
  createdAt: number
  project: string
  service: string
  workingDir: string
  configFiles: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'docker-pane': {
      active: boolean
      containers: ContainerRow[]
      repoRoot: string
      headMovedAt: number
      isOpen: boolean
      isLoading: boolean
      error: string
      updatedAt: number
      busy: string
      hideStopped: boolean
    }
  }
}

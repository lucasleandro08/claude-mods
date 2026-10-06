export function tilde(path: string) {
  return path.replace(/^\/(Users|home)\/[^/]+/, '~')
}

export function splitPath(path: string) {
  const at = path.lastIndexOf('/')
  return { dir: at >= 0 ? tilde(path.slice(0, at + 1)) : '', name: path.slice(at + 1) }
}

export function commonDir(paths: readonly string[]) {
  if (paths.length === 0) return ''
  const dirs = paths.map(p => p.slice(0, p.lastIndexOf('/') + 1))
  let prefix = dirs[0] ?? ''
  for (const dir of dirs) {
    while (!dir.startsWith(prefix)) prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf('/') + 1)
  }
  return prefix === '/' ? '' : prefix
}

const COMMON_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

export function binaryCandidates(name: string, home: string | undefined, override?: string): string[] {
  const homeDirs = home ? [`${home}/bin`, `${home}/.local/bin`] : []
  return [override, name, ...[...COMMON_DIRS, ...homeDirs].map(dir => `${dir}/${name}`)].filter(
    (bin): bin is string => typeof bin === 'string' && bin !== '',
  )
}

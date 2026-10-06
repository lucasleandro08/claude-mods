export function formatElapsed(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`
}

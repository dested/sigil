export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url]
  try {
    const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
    proc.exited.catch(() => undefined)
  } catch {
    // Opening a browser is a convenience; the URL is already printed.
  }
}

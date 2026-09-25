import { existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const SIGIL_EXTS: ReadonlySet<string> = new Set(['.png', '.json', '.svg', '.jsonl', '.md', '.txt'])

/** Absolute path of `rel` under `root`, or null when it escapes root or cannot be decoded. */
function safeJoin(root: string, rel: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const base = resolve(root)
  const abs = resolve(base, `.${sep}${decoded}`)
  return abs.startsWith(base + sep) ? abs : null
}

const isFile = (p: string): boolean => existsSync(p) && statSync(p).isFile()

function fileResponse(abs: string, cacheControl: string): Response {
  const type = CONTENT_TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  return new Response(Bun.file(abs), { headers: { 'content-type': type, 'cache-control': cacheControl } })
}

/** Serves the built lab app. Extensionless paths fall back to index.html so client routes survive a reload. */
export function serveStatic(distDir: string, pathname: string): Response | null {
  const rel = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '')
  const abs = safeJoin(distDir, rel)
  if (abs === null) return null
  if (isFile(abs)) return fileResponse(abs, rel === 'index.html' ? 'no-cache' : 'public, max-age=300')
  if (extname(rel) === '') {
    const index = safeJoin(distDir, 'index.html')
    if (index !== null && isFile(index)) return fileResponse(index, 'no-cache')
  }
  return null
}

/** `/files/<rel>` ⇒ a png/json/svg/jsonl/md/txt file under .sigil. */
export function serveSigilFile(sigilDir: string, pathname: string): Response | null {
  const prefix = '/files/'
  if (!pathname.startsWith(prefix)) return null
  const rel = pathname.slice(prefix.length)
  if (!SIGIL_EXTS.has(extname(rel).toLowerCase())) return null
  const abs = safeJoin(sigilDir, rel)
  if (abs === null || !isFile(abs)) return null
  return fileResponse(abs, 'no-store')
}

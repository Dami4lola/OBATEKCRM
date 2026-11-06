// Serves demo-out/ on this computer for a screen share

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3100
const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'demo-out')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

if (!existsSync(root)) {
  console.error('demo-out/ is missing. Run npm run demo:build first.')
  process.exit(1)
}

function fileFor(url) {
  const path = decodeURIComponent(new URL(url, 'http://localhost').pathname)
  const file = normalize(join(root, path))
  if (file !== root && !file.startsWith(root + sep)) return null
  if (existsSync(file) && statSync(file).isFile()) return file
  const index = join(file, 'index.html')
  return existsSync(index) ? index : null
}

createServer((request, response) => {
  const file = fileFor(request.url)
  const status = file ? 200 : 404
  const served = file ?? join(root, '404.html')
  response.writeHead(status, { 'Content-Type': TYPES[extname(served)] ?? 'application/octet-stream' })
  createReadStream(served).pipe(response)
}).listen(PORT, '127.0.0.1', () => console.log(`Demo running at http://localhost:${PORT}`))

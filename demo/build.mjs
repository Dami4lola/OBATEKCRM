// Builds the browser-only demo into demo-out/: the real screens on false
// data, with no server, database or outside calls.
//
// Everything happens in a temporary copy, so the running app isn't touched.
// No .env file is copied, and the safety check below fails the build if a key,
// the mailing address or the real sender or wording reached the output.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const stage = join(root, '.demo-build')
const output = join(root, 'demo-out')

// Everything a visitor must not get, or that only works with a server
const LEFT_OUT = [
  'src/app/api',
  'src/app/(auth)',
  'src/app/(dashboard)/settings',
  'src/app/(dashboard)/layout.tsx',
  'src/middleware.ts',
].map((path) => join(root, path))

function copyProject() {
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage)
  cpSync(join(root, 'src'), join(stage, 'src'), {
    recursive: true,
    filter: (path) => !LEFT_OUT.includes(path),
  })
  cpSync(join(root, 'public'), join(stage, 'public'), { recursive: true })
  for (const file of ['package.json', 'tsconfig.json', 'postcss.config.mjs', 'components.json', 'next-env.d.ts']) {
    cpSync(join(root, file), join(stage, file))
  }
  cpSync(join(root, 'demo'), join(stage, 'src/demo'), {
    recursive: true,
    filter: (path) => !path.endsWith('.mjs'),
  })
}

function wireDemo() {
  const app = join(stage, 'src/app/(dashboard)')
  // The demo opens on Results, and the pipeline moves over to make room
  mkdirSync(join(app, 'pipeline'))
  renameSync(join(app, 'page.tsx'), join(app, 'pipeline/page.tsx'))
  renameSync(join(app, 'results/page.tsx'), join(app, 'page.tsx'))
  rmSync(join(app, 'results'), { recursive: true })

  writeFileSync(join(app, 'layout.tsx'), "export { default } from '@/demo/frame'\n")
  writeFileSync(join(stage, 'src/lib/supabase/client.ts'), "export { createClient } from '@/demo/fake-client'\n")
  writeFileSync(join(stage, 'src/lib/outreach/default-templates.ts'), "export * from '@/demo/default-templates'\n")

  // The drafts come from a made-up company, so this label can't name OBATEK
  const findings = join(stage, 'src/lib/outreach/audit-findings.ts')
  const label = 'Hiring for work OBATEK automates'
  const source = readFileSync(findings, 'utf8')
  if (!source.includes(label)) throw new Error(`"${label}" has moved: update demo/build.mjs`)
  writeFileSync(findings, source.replace(label, 'Hiring for work that could be automated'))

  // Sign out lands here: a full reload puts the demo back to the start
  mkdirSync(join(stage, 'src/app/login'))
  writeFileSync(
    join(stage, 'src/app/login/page.tsx'),
    `'use client'

import { useEffect } from 'react'

export default function Restart() {
  useEffect(() => window.location.replace('/'), [])
  return null
}
`
  )

  writeFileSync(
    join(stage, 'next.config.ts'),
    `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
`
  )
}

function build() {
  // Only what the build needs: no key in this shell can reach the output
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1' }
  const next = join(root, 'node_modules/.bin/next')
  // Webpack, because Turbopack would look for the real src/middleware.ts from
  // the project root and compile it into this build
  const result = spawnSync(next, ['build', '--webpack'], { cwd: stage, env, stdio: 'inherit' })
  if (result.status !== 0) throw new Error('The demo build failed')
}

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesIn(path) : [path]
  })
}

// Values from .env.local, so the check knows them without printing them
function localSecrets() {
  const envFile = join(root, '.env.local')
  if (!existsSync(envFile)) return []
  return readFileSync(envFile, 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .flatMap(([, name, raw]) => {
      const value = raw.trim().replace(/^["']|["']$/g, '')
      // The first part of an address is enough to recognise it
      const text = name === 'OBATEK_MAILING_ADDRESS' ? value.split(',')[0].trim() : value
      return text.length >= 8 && !text.startsWith('http://localhost') ? [{ label: name, text }] : []
    })
}

// Sentences from the real templates, which must not ship
function realWording() {
  const source = readFileSync(join(root, 'src/lib/outreach/default-templates.ts'), 'utf8')
  const bodies = [...source.matchAll(/body: "((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])
  return bodies
    .flatMap((body) => body.split('\\n'))
    .filter((line) => line.length >= 40 && !line.includes('{{opener}}'))
    .map((line) => ({ label: 'real template wording', text: line.replace(/\\"/g, '"').slice(0, 60) }))
}

function checkOutput() {
  const banned = [
    ...localSecrets(),
    ...realWording(),
    { label: 'real sender name', text: 'Ayoade' },
    { label: 'real sender name', text: 'Damilola' },
    { label: 'server key name', text: 'SUPABASE_SERVICE_ROLE_KEY' },
  ]
  const patterns = [
    { label: 'Anthropic key', regex: /sk-ant-[A-Za-z0-9_-]{10,}/ },
    { label: 'Google key', regex: /AIza[0-9A-Za-z_-]{30,}/ },
    { label: 'signed token', regex: /eyJhbGci[A-Za-z0-9_-]{20,}/ },
    { label: 'Supabase project address', regex: /[a-z0-9]{20}\.supabase\.co/ },
  ]
  const problems = []
  for (const file of filesIn(output)) {
    const text = readFileSync(file, 'latin1')
    const name = relative(output, file).split(sep).join('/')
    for (const { label, text: value } of banned) if (text.includes(value)) problems.push(`${label} in ${name}`)
    for (const { label, regex } of patterns) if (regex.test(text)) problems.push(`${label} in ${name}`)
  }
  if (problems.length > 0) {
    rmSync(output, { recursive: true, force: true })
    throw new Error(`Safety check failed, so demo-out was deleted:\n  ${[...new Set(problems)].join('\n  ')}`)
  }
  console.log(`Safety check passed: ${banned.length} values and ${patterns.length} patterns, none found.`)
}

try {
  copyProject()
  wireDemo()
  build()
  rmSync(output, { recursive: true, force: true })
  renameSync(join(stage, 'out'), output)
  checkOutput()
  console.log('Demo built in demo-out/. Run npm run demo:serve to open it.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  rmSync(stage, { recursive: true, force: true })
}

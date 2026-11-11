import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'
import type { Readable } from 'node:stream'

// Fetches pages from lead websites (untrusted URLs) without letting them
// reach this machine or the local network (OUTREACH_PLAN.md §16 S2).
// Every hop is checked: scheme, port, and each resolved IP, at connect time,
// so a DNS answer can't change between the check and the request.

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const ALLOWED_PORTS = new Set(['', '80', '443'])
const USER_AGENT = 'Mozilla/5.0 (compatible; OBATEK-SiteCheck/1.0; +https://getobatek.com)'

const blocked = new net.BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv6')
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) return blocked.check(address, 'ipv4')
  if (family === 6) {
    // ::ffff:10.0.0.1 is an IPv4 address in disguise
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return blocked.check(mapped[1], 'ipv4')
    return blocked.check(address, 'ipv6')
  }
  return true
}

export type SafeFetchErrorCode =
  | 'bad_url'
  | 'blocked'
  | 'dns'
  | 'timeout'
  | 'network'
  | 'too_many_redirects'

export class SafeFetchError extends Error {
  constructor(readonly code: SafeFetchErrorCode, message: string) {
    super(message)
  }
}

export interface SafeResponse {
  url: string
  status: number
  contentType: string
  body: string
  truncated: boolean
}

function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SafeFetchError('bad_url', `Not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('blocked', `Scheme not allowed: ${url.protocol}`)
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SafeFetchError('blocked', `Port not allowed: ${url.port}`)
  }
  if (url.username || url.password) {
    throw new SafeFetchError('blocked', 'URLs with credentials are not allowed')
  }
  // Node skips the lookup hook for IP literals, so check them here
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new SafeFetchError('blocked', `Address not allowed: ${host}`)
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new SafeFetchError('blocked', `Host not allowed: ${host}`)
  }
  return url
}

// Resolves like the default lookup, but fails if ANY address is private
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4)
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      const blockedError = new Error(`Address not allowed for ${hostname}`) as NodeJS.ErrnoException
      blockedError.code = 'EBLOCKED'
      return callback(blockedError, '', 4)
    }
    if ((options as dns.LookupOptions).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    }
    callback(null, list[0].address, list[0].family)
  })
}

function decode(stream: Readable, encoding: string | undefined): Readable {
  switch (encoding?.toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return stream.pipe(zlib.createGunzip())
    case 'deflate':
      return stream.pipe(zlib.createInflate())
    case 'br':
      return stream.pipe(zlib.createBrotliDecompress())
    default:
      return stream
  }
}

interface Hop {
  status: number
  location: string | null
  contentType: string
  body: string
  truncated: boolean
}

function requestOnce(url: URL, deadline: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new SafeFetchError('timeout', 'Timed out'))

    const client = url.protocol === 'https:' ? https : http
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-CA,en;q=0.9',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location ?? null
        const contentType = String(res.headers['content-type'] ?? '')

        if (status >= 300 && status < 400 && location) {
          res.resume()
          return resolve({ status, location, contentType, body: '', truncated: false })
        }

        const chunks: Buffer[] = []
        let size = 0
        let truncated = false
        const stream = decode(res, res.headers['content-encoding'])

        stream.on('data', (chunk: Buffer) => {
          if (truncated) return
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            truncated = true
            chunks.push(chunk.subarray(0, chunk.length - (size - MAX_BODY_BYTES)))
            req.destroy()
            resolve({ status, location: null, contentType, body: Buffer.concat(chunks).toString('utf8'), truncated })
            return
          }
          chunks.push(chunk)
        })
        stream.on('end', () =>
          resolve({ status, location: null, contentType, body: Buffer.concat(chunks).toString('utf8'), truncated })
        )
        stream.on('error', (error) => {
          if (!truncated) reject(new SafeFetchError('network', error.message))
        })
      }
    )

    req.setTimeout(remaining, () => req.destroy(new SafeFetchError('timeout', 'Timed out')))
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error instanceof SafeFetchError) return reject(error)
      if (error.code === 'EBLOCKED') return reject(new SafeFetchError('blocked', error.message))
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        return reject(new SafeFetchError('dns', `Domain not found: ${url.hostname}`))
      }
      reject(new SafeFetchError('network', error.message))
    })
    req.end()
  })
}

// A redirect target gets the same checks as the first URL
export function nextHopUrl(location: string, current: URL): URL {
  let target: string
  try {
    target = new URL(location, current).href
  } catch {
    throw new SafeFetchError('bad_url', `Bad redirect: ${location}`)
  }
  return checkUrl(target)
}

export async function safeFetch(rawUrl: string): Promise<SafeResponse> {
  const deadline = Date.now() + TIMEOUT_MS
  let url = checkUrl(rawUrl)

  for (let redirects = 0; ; redirects++) {
    const hop = await requestOnce(url, deadline)
    if (hop.location) {
      if (redirects >= MAX_REDIRECTS) {
        throw new SafeFetchError('too_many_redirects', 'Too many redirects')
      }
      url = nextHopUrl(hop.location, url)
      continue
    }
    return {
      url: url.href,
      status: hop.status,
      contentType: hop.contentType,
      body: hop.body,
      truncated: hop.truncated,
    }
  }
}

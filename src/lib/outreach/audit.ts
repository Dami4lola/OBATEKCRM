import { isSharedHost, websiteHost } from './sourcing'
import { safeFetch, SafeFetchError, type SafeResponse } from './safe-fetch'
import type { ListingInfo, SiteAudit } from './audit-findings'
import { isGenericEmail } from './cleanup'
import { extractSizeSignals } from './company-size'

export * from './audit-findings'

// Site audit (OUTREACH_PLAN.md §5). Pattern matching on the HTML: enough
// for these signals, and it keeps the engine free of extra dependencies.

const MAX_EXTRA_PAGES = 2 // contact + about, on top of the homepage
const PAGESPEED_TIMEOUT_MS = 60_000

// ---------- HTML helpers (exported for tests) ----------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', ndash: '–', mdash: '—',
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export interface PageLink {
  url: string
  text: string
}

export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const links: PageLink[] = []
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const href = decodeEntities((match[1] ?? match[2] ?? match[3] ?? '').trim())
    if (!href || href.startsWith('#')) continue
    try {
      links.push({ url: new URL(href, baseUrl).href, text: htmlToText(match[4]).slice(0, 100) })
    } catch {
      // Unparseable href
    }
  }
  return links
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const IGNORED_EMAIL_DOMAINS = [
  'example.com', 'domain.com', 'email.com', 'yourdomain.com', 'yoursite.com',
  'sentry.io', 'wixpress.com', 'sentry-next.wixpress.com', 'godaddy.com', 'squarespace.com',
]

// Published addresses, best first: on the site's own domain, and a
// person's address before a shared inbox (info@, office@)
export function extractEmails(html: string, siteHost: string | null): string[] {
  const found = new Set<string>()
  const decoded = decodeEntities(html).replace(/%40/g, '@')

  for (const match of decoded.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    found.add(match[1].toLowerCase())
  }
  for (const match of htmlToText(html).matchAll(EMAIL_PATTERN)) {
    found.add(match[0].toLowerCase())
  }

  const valid = [...found].filter((email) => {
    const domain = email.split('@')[1] ?? ''
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(email)) return false
    if (IGNORED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) && email.length <= 100
  })

  const rank = (email: string) => {
    const domain = email.split('@')[1] ?? ''
    const ownDomain = siteHost && (domain === siteHost || domain.endsWith(`.${siteHost}`)) ? 0 : 2
    // A person's address beats a shared inbox like info@
    const generic = isGenericEmail(email) ? 1 : 0
    return ownDomain + generic
  }
  return valid.sort((a, b) => rank(a) - rank(b)).slice(0, 5)
}

const BOOKING_TOOLS: [string, RegExp][] = [
  ['Jobber', /getjobber\.com|clienthub\.getjobber|jobber\.com\/booking/i],
  ['Housecall Pro', /housecallpro\.com/i],
  ['ServiceTitan', /servicetitan/i],
  ['Workiz', /workiz\.com/i],
  ['ServiceM8', /servicem8\.com/i],
  ['Calendly', /calendly\.com/i],
  ['Square Appointments', /squareup\.com\/appointments|square\.site\/book/i],
  ['Acuity', /acuityscheduling\.com/i],
  ['Setmore', /setmore\.com/i],
]

const QUOTE_CTA =
  /\b(request|get|free|online)\s+(a\s+|an\s+|your\s+)?(free\s+)?(quote|estimate)s?\b|\bbook\s+(now|online|an?\s+appointment|a\s+service)\b|\bschedule\s+(service|now|online|an?\s+appointment|a\s+visit)\b/i

// Ways to send a request that someone then has to answer: test drives,
// appointments, trade-in and credit forms. Dealer platforms like ZopDealer
// load these forms with JavaScript, so the link is often all we can see.
const REQUEST_CTA =
  /\b(book|schedule|request|reserve)\s+(a\s+|an\s+|your\s+)?(test[\s-]?drive|appointment|consultation|visit|viewing|estimate|quote)s?\b|\btest[\s-]?drive\b|\btrade[\s-]?in\s+(appraisal|value|evaluation)\b|\b(credit|finance|financing|loan)\s+application\b|\bget\s+pre[\s-]?approved\b|\be[\s-]?price\b|\brequest\s+(a\s+)?(price|call\s?back|info(rmation)?)\b/i

const MAX_REQUEST_LABELS = 5

// "/book-a-test-drive/" -> "book a test drive", for links with no text
function pathLabel(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[/_-]+/g, ' ').trim()
  } catch {
    return ''
  }
}

export function detectBooking(
  html: string,
  links: PageLink[]
): { tool: string | null; quoteCta: boolean; requests: string[] } {
  const tool = BOOKING_TOOLS.find(([, pattern]) => pattern.test(html))?.[0] ?? null
  const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]{0,200}?)<\/button>/gi)].map((m) =>
    htmlToText(m[1])
  )
  const isRequest = (text: string) => QUOTE_CTA.test(text) || REQUEST_CTA.test(text)
  const labels = [
    ...links.map((link) => {
      const text = link.text.trim()
      if (text && isRequest(text)) return text
      const path = pathLabel(link.url)
      return path && isRequest(path) ? path : ''
    }),
    ...buttons.map((text) => (isRequest(text) ? text.trim() : '')),
  ]

  const requests: string[] = []
  for (const label of labels) {
    const clean = label.replace(/\s+/g, ' ').slice(0, 60)
    if (clean && !requests.some((r) => r.toLowerCase() === clean.toLowerCase())) requests.push(clean)
    if (requests.length === MAX_REQUEST_LABELS) break
  }
  return { tool, quoteCta: requests.length > 0, requests }
}

// A form someone could send a job request through
export function hasContactForm(html: string): boolean {
  for (const match of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const form = match[0]
    if (/<textarea\b/i.test(form) || /type\s*=\s*["']?email/i.test(form)) return true
  }
  // Common form embeds
  return /jotform\.com|forms\.gle|typeform\.com|wpforms|gravityforms|contact-form-7|hsforms/i.test(html)
}

export function copyrightYear(text: string, now: Date): number | null {
  let latest: number | null = null
  for (const match of text.matchAll(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)) {
    const year = Number(match[1])
    if (year >= 1995 && year <= now.getFullYear() && (latest === null || year > latest)) latest = year
  }
  return latest
}

const NAME = "[A-Z][a-z]+(?:[ '-][A-Z][a-z]+){1,2}"
const OWNER_PATTERNS = [
  new RegExp(`\\b(?:owner|founder|co-founder|president|proprietor)\\s*[,:\\-–—]\\s*(${NAME})`),
  new RegExp(`\\b(${NAME})\\s*[,\\-–—(]\\s*(?:the\\s+)?(?:owner|founder|co-founder|president|proprietor)\\b`),
  new RegExp(`\\b(${NAME})\\s+(?:is|has been)\\s+the\\s+(?:owner|founder|president)\\b`),
  new RegExp(`\\b(?:founded|started|owned(?:\\s+and\\s+operated)?)\\s+(?:in\\s+\\d{4}\\s+)?by\\s+(${NAME})`),
  new RegExp(`\\b(?:my name is|i'm|i am)\\s+(${NAME})`, 'i'),
]
// Capitalised phrases that look like names but aren't
const NOT_NAMES = /\b(our|your|the|home|repair|services?|team|company|about|contact|call|free|quote|handyman|plumbing|electric|roofing|ottawa|toronto|canada|inc|ltd)\b/i

// "Meet Sarah Lee" -> "Sarah Lee"
const LEAD_IN = /^(?:meet|hi|hello|welcome|contact|call|ask for|by)\s+/i

export function findOwnerName(text: string): string | null {
  for (const pattern of OWNER_PATTERNS) {
    const name = text.match(pattern)?.[1]?.trim().replace(LEAD_IN, '')
    if (name && name.includes(' ') && !NOT_NAMES.test(name)) return name
  }
  return null
}

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/

export function seoIssues(html: string, city: string | null): string[] {
  const issues: string[] = []
  const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => htmlToText(m[1]))

  if (!title) issues.push('No page title')
  if (!/<meta[^>]+name\s*=\s*["']?description["']?[^>]*content\s*=\s*["'][^"']{10,}/i.test(html) &&
      !/<meta[^>]+content\s*=\s*["'][^"']{10,}["'][^>]*name\s*=\s*["']?description/i.test(html)) {
    issues.push('No meta description')
  }
  if (h1s.length === 0) issues.push('No main heading (H1)')
  else if (h1s.length > 1) issues.push('Several main headings (H1)')
  if (city) {
    const where = `${title} ${h1s.join(' ')}`.toLowerCase()
    if (!where.includes(city.toLowerCase())) issues.push(`City (${city}) not in the title or main heading`)
  }
  return issues
}

// ---------- robots.txt ----------

export function robotsDisallows(robots: string): string[] {
  const rules: string[] = []
  let applies = false
  let inGroup = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const [field, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (!field) continue
    const key = field.trim().toLowerCase()
    if (key === 'user-agent') {
      if (!inGroup) applies = false
      inGroup = true
      if (value === '*' || /obatek/i.test(value)) applies = true
    } else {
      inGroup = false
      if (key === 'disallow' && applies && value) rules.push(value)
    }
  }
  return rules
}

function isAllowed(url: string, disallows: string[]): boolean {
  const path = new URL(url).pathname
  return !disallows.some((rule) => path.startsWith(rule.replace(/\*.*$/, '')))
}

// ---------- PageSpeed ----------

export async function fetchPerfScore(url: string, apiKey: string | undefined): Promise<number | null> {
  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance' })
  if (apiKey) params.set('key', apiKey)
  const response = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    { signal: AbortSignal.timeout(PAGESPEED_TIMEOUT_MS) }
  )
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.message || `PageSpeed returned ${response.status}`)
  const score = body?.lighthouseResult?.categories?.performance?.score
  return typeof score === 'number' ? Math.round(score * 100) : null
}

// ---------- reviews ----------

const SLOW_CALLBACK =
  /\b(never|didn'?t|did not|wouldn'?t|won'?t|doesn'?t|don'?t)\s+(call(ed)?|get|got|ring|respond(ed)?|return(ed)?|answer(ed)?|reply|replied|show(ed)?\s+up)\b|\b(no|took (days|forever|a week) to)\s+(call\s?back|response|reply|answer|get back)\b|\b(hard|impossible|difficult) to (reach|get (a )?hold of|contact)\b|\bunresponsive\b|\bnever heard back\b|\bstill waiting\b|\bvoicemail\b/i

// Review snippets that mention slow or missing callbacks
export function findSlowCallbackReviews(reviews: string[]): string[] {
  return reviews
    .filter((text) => SLOW_CALLBACK.test(text))
    .map((text) => {
      const match = text.match(SLOW_CALLBACK)
      const at = match?.index ?? 0
      const start = Math.max(0, at - 60)
      return `${start > 0 ? '…' : ''}${text.slice(start, at + 100).trim()}${at + 100 < text.length ? '…' : ''}`
    })
}

// ---------- the audit ----------

export interface AuditInput {
  website: string | null
  city: string | null
  // True when Google's listing for them has no website, so an empty
  // website field means "none" rather than "not known"
  noWebsiteConfirmed?: boolean
  listing?: ListingInfo | null
  pagespeedKey?: string
  reviews?: string[] | null
  now?: Date
  fetchPage?: (url: string) => Promise<SafeResponse>
  fetchPerf?: (url: string, key: string | undefined) => Promise<number | null>
}

function describeFetchError(error: unknown): string {
  if (error instanceof SafeFetchError) return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

export async function auditSite(input: AuditInput): Promise<SiteAudit> {
  const now = input.now ?? new Date()
  const fetchPage = input.fetchPage ?? safeFetch
  const fetchPerf = input.fetchPerf ?? fetchPerfScore
  const host = websiteHost(input.website)

  const audit: SiteAudit = {
    audited_at: now.toISOString(),
    input_url: input.website,
    final_url: null,
    has_site: false,
    website_status: 'unknown',
    listing: input.listing ?? null,
    dead_site: false,
    https: false,
    mobile_viewport: null,
    perf_score: null,
    copyright_year: null,
    has_booking: false,
    booking_tool: null,
    request_paths: [],
    has_contact_form: false,
    emails_found: [],
    owner_name: null,
    seo_issues: [],
    phone_on_homepage: false,
    pages_checked: [],
    slow_callback_reviews: input.reviews ? findSlowCallbackReviews(input.reviews) : null,
    errors: [],
  }

  if (!host) {
    audit.website_status = input.noWebsiteConfirmed ? 'none_confirmed' : 'unknown'
    return audit
  }
  // A Facebook page or directory listing isn't a website of their own
  if (isSharedHost(host)) {
    audit.website_status = 'none_confirmed'
    return audit
  }
  audit.has_site = true
  audit.website_status = 'found'

  let homeUrl: string
  try {
    homeUrl = new URL(/^https?:\/\//i.test(input.website!) ? input.website! : `https://${input.website}`).href
  } catch {
    audit.has_site = false
    audit.website_status = 'unknown'
    audit.errors.push(`bad_url: ${input.website}`)
    return audit
  }

  let home: SafeResponse
  try {
    home = await fetchPage(homeUrl)
  } catch (error) {
    // Blocked or malformed URLs say nothing about the business
    if (error instanceof SafeFetchError && (error.code === 'blocked' || error.code === 'bad_url')) {
      audit.errors.push(describeFetchError(error))
      return audit
    }
    audit.dead_site = true
    audit.errors.push(describeFetchError(error))
    return audit
  }

  audit.final_url = home.url
  audit.https = home.url.startsWith('https://')
  audit.pages_checked.push(home.url)
  if (home.status >= 500 || home.status === 404 || home.status === 410) {
    audit.dead_site = true
    audit.errors.push(`Homepage returned ${home.status}`)
    return audit
  }
  if (home.status >= 400) {
    // Often a bot blocker: the site exists, we just can't read it
    audit.errors.push(`Homepage returned ${home.status}; findings are incomplete`)
    return audit
  }

  const perf = fetchPerf(home.url, input.pagespeedKey).catch((error) => {
    audit.errors.push(`PageSpeed: ${describeFetchError(error)}`)
    return null
  })

  let disallows: string[] = []
  try {
    const robots = await fetchPage(new URL('/robots.txt', home.url).href)
    if (robots.status === 200 && !/html/i.test(robots.contentType)) disallows = robotsDisallows(robots.body)
  } catch {
    // No robots.txt: everything is allowed
  }

  const finalHost = websiteHost(home.url)
  const links = extractLinks(home.body, home.url).filter((link) => websiteHost(link.url) === finalHost)
  const pick = (pattern: RegExp) =>
    links.find((link) => pattern.test(new URL(link.url).pathname) || pattern.test(link.text))?.url
  const extraUrls = [
    pick(/contact|quote|estimate|book/i),
    pick(/about|our-story|who-we-are|team|meet/i),
  ]
    .filter((url): url is string => !!url && url !== home.url && isAllowed(url, disallows))
    .filter((url, i, all) => all.indexOf(url) === i)
    .slice(0, MAX_EXTRA_PAGES)

  const pages = [home.body]
  const pageLinks = [...links]
  for (const url of extraUrls) {
    try {
      const page = await fetchPage(url)
      if (page.status < 400) {
        pages.push(page.body)
        pageLinks.push(...extractLinks(page.body, page.url))
        audit.pages_checked.push(page.url)
      }
    } catch (error) {
      audit.errors.push(`${url}: ${describeFetchError(error)}`)
    }
  }

  const allHtml = pages.join('\n')
  const allText = pages.map(htmlToText).join('\n')
  const homeText = htmlToText(home.body)

  audit.mobile_viewport = /<meta[^>]+name\s*=\s*["']?viewport/i.test(home.body)
  audit.copyright_year = copyrightYear(homeText, now)
  const booking = detectBooking(allHtml, pageLinks)
  audit.booking_tool = booking.tool
  audit.has_booking = !!booking.tool || booking.quoteCta
  audit.request_paths = booking.requests
  audit.has_contact_form = hasContactForm(allHtml)
  audit.emails_found = extractEmails(allHtml, finalHost)
  audit.owner_name = findOwnerName(allText)
  audit.size_signals = extractSizeSignals(allText)
  audit.seo_issues = seoIssues(home.body, input.city)
  audit.phone_on_homepage = /href\s*=\s*["']?tel:/i.test(home.body) || PHONE_PATTERN.test(homeText)
  audit.perf_score = await perf

  return audit
}

// Company size from what we already collect: staff size on the lead (Lusha
// or typed in), team-size wording on their website, and Google review count.
// Pattern matching only; it says "unknown" rather than guess.

export interface SizeSignals {
  staff_mentions: { n: number; phrase: string }[]
  locations: number | null
  owner_operated: boolean
}

export type SizeBand = 'small' | 'large' | 'unknown'

export interface CompanySize {
  band: SizeBand
  staff_estimate: number | null
  evidence: string[]
  // Based only on a low review count
  weak: boolean
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  hundred: 100,
}

// "1,200" and "twelve" become plain numbers so one pattern handles all
function normalizeNumbers(text: string): string {
  return text
    .replace(/\b(\d{1,3}),(\d{3})\b/g, '$1$2')
    .replace(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/gi, (word) =>
      String(NUMBER_WORDS[word.toLowerCase()])
    )
}

// "25+ technicians", "over 60 employees", "our 3 licensed electricians"
const STAFF_PATTERN =
  /\b(\d{1,4})\s*\+?\s*(?:(?:full[- ]time|licensed|certified|experienced|skilled|trained|dedicated|professional|in-house)\s+)?(employees|staff(?:\s+members)?|technicians|techs|team members|professionals|electricians|plumbers|installers|tradespeople|tradesmen|crew members|workers|carpenters|roofers)\b/gi
const TEAM_OF_PATTERN = /\bteam of\s+(?:over\s+|more than\s+|nearly\s+|about\s+)?(\d{1,4})\b/gi
const LOCATIONS_PATTERN =
  /\b(\d{1,2})\s+(?:convenient\s+|service\s+|retail\s+)?(locations|branches|offices|service cent(?:re|er)s|showrooms)\b/gi
const OWNER_OPERATED =
  /\b(owner[- ]operated|one[- ]man (?:operation|show|business|company|shop)|sole proprietor(?:ship)?|family[- ]owned(?: and operated)?|small family business|locally owned and operated|independently owned and operated)\b/i

const MIN_STAFF = 2
const MAX_STAFF = 5000

export function extractSizeSignals(text: string): SizeSignals {
  const normalized = normalizeNumbers(text)
  const staffMentions: SizeSignals['staff_mentions'] = []

  for (const pattern of [STAFF_PATTERN, TEAM_OF_PATTERN]) {
    for (const match of normalized.matchAll(pattern)) {
      const n = Number(match[1])
      if (n >= MIN_STAFF && n < MAX_STAFF) {
        staffMentions.push({ n, phrase: match[0].replace(/\s+/g, ' ').trim() })
      }
    }
  }

  let locations: number | null = null
  for (const match of normalized.matchAll(LOCATIONS_PATTERN)) {
    const n = Number(match[1])
    if (n >= 2 && (locations === null || n > locations)) locations = n
  }

  // "team of 12 technicians" matches both patterns; keep one per number
  const unique = staffMentions.filter((m, i) => staffMentions.findIndex((o) => o.n === m.n) === i)

  return {
    staff_mentions: unique.sort((a, b) => b.n - a.n).slice(0, 5),
    locations,
    owner_operated: OWNER_OPERATED.test(text),
  }
}

const LARGE_LOCATIONS = 4
const LARGE_REVIEWS = 1500
const SMALL_REVIEWS = 150

export function estimateCompanySize({
  staffSize,
  reviewCount,
  signals,
  smallMax,
}: {
  staffSize: number | null
  reviewCount: number | null
  signals: SizeSignals | null | undefined
  smallMax: number
}): CompanySize {
  const sized = (n: number, evidence: string): CompanySize => ({
    band: n <= smallMax ? 'small' : 'large',
    staff_estimate: n,
    evidence: [evidence],
    weak: false,
  })

  if (staffSize != null) return sized(staffSize, `${staffSize} staff (on lead)`)

  const biggest = signals?.staff_mentions[0]
  if (biggest) return sized(biggest.n, `Site says "${biggest.phrase}"`)

  if (signals?.locations != null && signals.locations >= LARGE_LOCATIONS) {
    return { band: 'large', staff_estimate: null, evidence: [`Site lists ${signals.locations} locations`], weak: false }
  }

  if (signals?.owner_operated) {
    return { band: 'small', staff_estimate: null, evidence: ['Site says owner-operated or family-owned'], weak: false }
  }

  if (reviewCount != null && reviewCount >= LARGE_REVIEWS) {
    return { band: 'large', staff_estimate: null, evidence: [`${reviewCount} Google reviews`], weak: false }
  }
  if (reviewCount != null && reviewCount < SMALL_REVIEWS) {
    return { band: 'small', staff_estimate: null, evidence: [`Only ${reviewCount} Google reviews`], weak: true }
  }

  return { band: 'unknown', staff_estimate: null, evidence: [], weak: false }
}

export function describeCompanySize(size: CompanySize, smallMax: number): string {
  if (size.band === 'unknown') return `Size unknown (counts as ${smallMax} or fewer staff)`
  const label =
    size.staff_estimate != null
      ? `~${size.staff_estimate} staff`
      : size.band === 'small'
        ? `small (${smallMax} or fewer staff)`
        : `large (over ${smallMax} staff)`
  return `${label}${size.weak ? ', weak estimate' : ''}: ${size.evidence.join('; ')}`
}

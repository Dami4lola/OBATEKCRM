// Marketing agencies as a second target (OUTREACH_PLAN.md §3, §5): web
// design, local SEO, GoHighLevel and Google Ads agencies with 2-20 staff in
// the Eastern and Central US. What to search for, and what an agency's
// website says about it. Pattern matching only, browser-safe.

// Google Maps rarely labels GoHighLevel shops; the site check finds those
export const AGENCY_SEARCHES = ['web design agency', 'local SEO agency', 'Google Ads agency', 'marketing agency']

// Same states and cities as the other US targets
export { US_TARGET_METROS as AGENCY_METROS } from './us-targets'

export type AgencyService = 'web_design' | 'local_seo' | 'google_ads'
export type OffTarget = 'branding' | 'social' | 'enterprise'

export interface AgencyProfile {
  services: AgencyService[]
  gohighlevel: boolean
  // Not who we're after: branding or social-content studios, enterprise shops
  off_target: OffTarget | null
  evidence: string[]
}

export const AGENCY_SERVICE_LABELS: Record<AgencyService, string> = {
  web_design: 'web design',
  local_seo: 'local SEO',
  google_ads: 'Google Ads',
}

const SERVICES: [AgencyService, RegExp][] = [
  ['web_design', /\b(web(site)?\s*(design|development|developer|designer)s?|wordpress (design|development)|custom websites?)\b/i],
  ['local_seo', /\b(local seo|seo services|search engine optimi[sz]ation|google business profile|google my business|gbp optimi[sz]ation|map pack)\b/i],
  ['google_ads', /\b(google ads|adwords|ppc|pay[- ]per[- ]click|paid search|search ads|local services ads)\b/i],
]

// The HighLevel platform's own hosts: forms, chat widgets, calendars
const GHL_HOSTS = /\b(leadconnectorhq\.com|msgsndr\.com|[a-z0-9-]+\.gohighlevel\.com|highlevel\.com)\b/i
const GHL_TEXT = /\b(go\s?high\s?level|highlevel)\b/i

const BRANDING = /\b(branding|brand identity|brand strategy|logo design|visual identity)\b/gi
const SOCIAL = /\b(social media (management|marketing|content)|content creation|content creators?|influencer|tiktok|instagram (growth|management)|ugc)\b/gi
const ENTERPRISE = /\b(fortune\s?(500|1000)|enterprise (clients|brands|companies|organizations)|global brands|multinational)\b/i

// Kept out of the copywriter's findings: it's for whoever ticks the leads
export const BIG_CLIENT_NOTE = 'Big-client wording'

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

export function detectAgencyProfile(html: string, text: string): AgencyProfile {
  const evidence: string[] = []
  const services = SERVICES.filter(([, pattern]) => pattern.test(text)).map(([service]) => service)

  const ghlHost = GHL_HOSTS.exec(html)?.[0]
  const ghlWord = GHL_TEXT.exec(text)?.[0]
  const gohighlevel = !!(ghlHost || ghlWord)
  if (ghlHost) evidence.push(`GoHighLevel on the site (${ghlHost.toLowerCase()})`)
  else if (ghlWord) evidence.push(`Mentions ${ghlWord}`)

  let off_target: OffTarget | null = null
  const enterprise = ENTERPRISE.exec(text)?.[0]
  if (services.length === 0 && !gohighlevel) {
    // A studio that also does branding is fine; one that only does it isn't
    const branding = count(text, BRANDING)
    const social = count(text, SOCIAL)
    if (enterprise) {
      off_target = 'enterprise'
      evidence.push(`Enterprise wording: "${enterprise}"`)
    } else if (branding >= 2 && branding >= social) {
      off_target = 'branding'
      evidence.push('Branding-focused, no web, SEO or ads services seen')
    } else if (social >= 2) {
      off_target = 'social'
      evidence.push('Social and content-focused, no web, SEO or ads services seen')
    }
  } else if (enterprise) {
    // Small shops boast about Fortune 500 clients too: a note, not a penalty
    evidence.push(`${BIG_CLIENT_NOTE} ("${enterprise}"): check the team size`)
  }

  if (services.length > 0) evidence.unshift(`Offers ${services.map((s) => AGENCY_SERVICE_LABELS[s]).join(', ')}`)
  return { services, gohighlevel, off_target, evidence }
}

// "Agency: web design, local SEO, GoHighLevel"
export function describeAgency(profile: AgencyProfile): string {
  const parts = profile.services.map((s) => AGENCY_SERVICE_LABELS[s])
  if (profile.gohighlevel) parts.push('GoHighLevel')
  return parts.length > 0 ? `Agency: ${parts.join(', ')}` : 'Agency'
}

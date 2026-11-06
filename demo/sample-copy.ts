import { parseOutreachSettings } from '@/lib/outreach/settings'
import { renderSteps, templateFor, templateVars } from '@/lib/outreach/templates'
import type { Json, OutreachHook, OutreachSetting } from '@/types/database'

// Pre-written drafts, standing in for what Claude writes in the real app.
// {company} and {city} are filled in per lead.

const OPENERS: Record<OutreachHook, string[]> = {
  no_site: [
    'I found {company} on Google with solid reviews, but no website behind the listing.',
    'People searching in {city} can find your listing, but there is no site for them to land on.',
  ],
  no_booking: [
    "I looked through {company}'s site and couldn't find a way to book or request a quote.",
    'Your site explains what {company} does well, but a new customer has to phone to get started.',
  ],
  request_only: [
    "{company}'s site has a request form, so each new enquiry waits in an inbox for someone to answer.",
    'Requests from your site land in an inbox, which is hard to keep up with during a busy week.',
  ],
  not_mobile: [
    "I opened {company}'s site on my phone and it was hard to read without zooming in.",
    'Most people searching in {city} are on a phone, and your site is awkward to use on one.',
  ],
  slow: [
    "{company}'s site took a long time to load on my phone.",
    'Your homepage loads slowly on mobile, which tends to lose people before they call.',
  ],
  outdated: [
    "The footer on {company}'s site still shows a date from a few years back.",
    "{company}'s site looks like it hasn't had much attention for a while.",
  ],
  seo_local: [
    "{company}'s site doesn't mention {city} where search engines look for it.",
    'Someone searching for your services in {city} would struggle to find your site.',
  ],
  generic: [
    "I came across {company} while looking at businesses in {city}, and your reviews stood out.",
    '{company} looks well run, so I wanted to reach out directly.',
  ],
  job_post: [
    'I saw {company} is hiring someone to help with calls and scheduling.',
    'Your job post suggests the phones and paperwork are getting busy at {company}.',
  ],
}

const SUBJECTS: Record<OutreachHook, string> = {
  no_site: 'A website for {company}',
  no_booking: 'Booking at {company}',
  request_only: 'Enquiries at {company}',
  not_mobile: "{company}'s site on phones",
  slow: "{company}'s site speed",
  outdated: "{company}'s website",
  seo_local: 'Being found in {city}',
  generic: 'A question for {company}',
  job_post: 'Your new hire at {company}',
}

interface DraftLead {
  company_name?: unknown
  contact_name?: unknown
  owner_name?: unknown
  city?: unknown
  vertical?: unknown
}

function fill(text: string, lead: DraftLead): string {
  return text
    .replaceAll('{company}', String(lead.company_name ?? 'your business'))
    .replaceAll('{city}', String(lead.city ?? 'your area'))
}

// Variant picks a different opener, so redrafting changes something
export function sampleDraft(lead: DraftLead, hook: OutreachHook, settingsRows: object[], variant = 0) {
  const settings = parseOutreachSettings(settingsRows as OutreachSetting[])
  const openers = OPENERS[hook]
  const opener = fill(openers[variant % openers.length], lead)
  const subject = fill(SUBJECTS[hook], lead)
  const template = templateFor(settings.email_templates, (lead.vertical as string | null) ?? null)
  const steps = renderSteps(
    template.steps,
    templateVars(
      {
        company_name: lead.company_name as string | null,
        contact_name: lead.contact_name as string,
        owner_name: (lead.owner_name as string | null) ?? null,
      },
      { opener, subject, senderName: settings.sender_name }
    )
  ) as unknown as Json
  const linkedin =
    hook === 'job_post'
      ? fill("Saw {company} is hiring. We help small teams handle calls and scheduling without adding a desk. Happy to share a short review if useful.", lead)
      : null
  return { opener, subject, steps, linkedin, templateKey: template.key }
}

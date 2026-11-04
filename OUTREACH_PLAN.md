# OBATEK CRM — Lead Engine: Build Spec

**Owner:** Dami Ayoade · **Status:** Building (stages 1–7 done; sending moved in-house in 7.1–7.3) · **Last updated:** 2026-11-03

This is the implementation spec for **"OBATEK Lead Engine — Build Plan.md"**. That plan covers the strategy: ICP, pain signals, delivery modes, metrics. This file says how it gets built in this repo.

The engine works in four steps:
- It **finds** small trades businesses with visible operational pain (Google Places + a website audit).
- It **scores** them and puts the qualified ones in the **New** stage.
- It **reaches out** through a **Run outreach** pop-up (email from the getobatek.com Microsoft 365 mailbox through Microsoft Graph) and a **daily call list** (call tasks with a one-screen brief).
- Each lead moves to **Contacted** once its first email goes out. You choose when a run happens: now, or at a scheduled time.

The engine starts in **manual mode**: you approve every email. The best performers become the examples Claude learns from. Once results hold up, you switch to **auto mode**.

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase · React Query · shadcn/ui, all in this repo. It runs **locally on Dami's laptop** (`npm run dev` / `npm start`), not on Vercel.
**Database:** `supabase/migrations/002_outreach.sql` (applied), `003_team_access.sql` (§16), `004_sourcing.sql` (§4) and `005_audit.sql` (§5). Types are in `src/types/database.ts`.

**Starting ICP:** handyman and home-repair businesses with 2–10 staff that run jobs out of spreadsheets and texts. Bigger HVAC and electrical firms come later.

**Second target (stage 7.4):** marketing agencies with 2–20 staff in the Eastern and Central US (NY, FL, TX, IL, GA, the Carolinas): web design, local SEO, GoHighLevel and local Google Ads shops. Not branding, social-content or enterprise agencies. The offer is the agency's own back office: instant follow-up on new inquiries, an AI receptionist for the sales line, discovery calls booked onto the calendar.

---

## 1. How this differs from the Build Plan's architecture

The Build Plan describes a standalone **Python/FastAPI** service with its own Postgres schema, Docker, an OpenAPI contract and `tenant_id` everywhere. That is the right shape once a bigger client pays for it. Building it now would delay the small-client bundle, which is the thing that can be sold today. So:

| Build Plan | Now | When it changes |
|---|---|---|
| Python/FastAPI service in `packages/lead-engine` | TypeScript in `src/lib/outreach/`, called from Next.js routes | First bigger-client deal that needs the engine without the CRM |
| Engine owns its own schema | Uses CRM tables (`leads`, `activities`, `tasks`, `meetings`) plus the `outreach_*` tables | Same; the `outreach_*` tables move with the engine |
| Adapters: `push_lead()`, `update_status()`, `fetch_existing_contacts()` | One adapter, `src/lib/outreach/adapters/obatek-crm.ts`, with those same three functions | Add `webhook.ts` / `csv.ts` per deal |
| CI fails if the engine imports the CRM | ESLint `no-restricted-imports` in `eslint.config.mjs`: `src/lib/outreach/**` can't import React, Next, `@/components`, `@/app`, `@/lib/queries` or `@/lib/supabase`. Only `adapters/` may touch the database | Becomes import-linter in the Python service |
| Multi-tenant (`tenant_id` on every table) | Single tenant (OBATEK) | Added at extraction. Until then, per-tenant config lives in `outreach_settings` |
| Outgoing webhooks `lead.qualified`, `lead.replied`, `meeting.booked` | Not needed; the CRM reads the tables directly | The generic webhook adapter |

**Rule that makes extraction cheap:** everything in `src/lib/outreach/` except `adapters/` is plain functions: data in, data out. Sourcing, audit, scoring, compliance, drafting and call briefs never query Supabase themselves. Routes load data through the adapter, call the core, and write results back through the adapter.

Delivery modes, enterprise asks (SSO, RBAC, security questionnaire) and pricing stay in the Build Plan. Nothing is built for them until a deal needs it.

---

## 2. How it fits the existing schema

The live schema is `pipelines → stages → leads`, with `activities`, `tasks` and `meetings` on leads. One lead = one contact.

| Need | Uses | Change |
|---|---|---|
| Prospect | `leads` | 002: + `job_title, website, city, region, country, vertical, staff_size, linkedin_url, email_source`. 004: + sourcing fields and `signals` (§4) |
| Who gets picked up | stage named `source_stage_name` (`New`) | none; looked up by name |
| Where they go after | stage named `target_stage_name` (`Contacted`) | none; moved with the existing `move_lead` RPC |
| Timeline of sends, calls, replies, bounces | `activities` (`type` = `email` or `call`) | 002: + `meta JSONB` |
| Call list | `tasks` (`kind='call'`, title + `description` = the brief, `due_date` = today) | 004: + `kind` |
| Booked meetings (the main metric) | `meetings` | none |
| A run (now or scheduled) | `outreach_runs` | 002 |
| Each email + its stats (the learning set) | `outreach_emails` | 002; stage 5 adds `opener`, `template_key`; 014 adds `queued` and the sequence columns |
| Each message actually sent (per step, seed checks, tests) | `outreach_messages` | 014 |
| The sending mailbox connection (encrypted token) | `outreach_mailbox` | 014 |
| Never contact again | `suppression_list` | 002 |
| Switches, thresholds, weights, templates | `outreach_settings` | 002; 004 adds keys |
| Who may use the CRM | `team_members` + `is_team_member()` | 003 |

Stages are always resolved by **name** from settings, never by hard-coded ID.

---

## 3. Sourcing (`src/lib/outreach/sourcing.ts`, built)

A **Find leads** dialog has inputs for vertical, city and max results. It pulls businesses from the **Google Places API (New)** Text Search, for example `"handyman in Ottawa, ON"`.

- **Fields used:** `id` (place_id), display name, formatted address and address components (city, region, country), phone, `websiteUri`, rating and review count. Request only the fields used (field mask), because cost depends on the fields.
- **Dedupe** through the adapter's `fetchExistingContacts()` before insert: match on `google_place_id`, then website domain, then phone digits. This also covers businesses deleted with Clean up (`dismissed_leads`).
- **Clean up** (dashboard header) deletes checked leads in New that score below a cutoff (default: the outreach threshold). Leads with calls, meetings, sent emails or open tasks are never offered, because deleting a lead cascades to all of them. Each deleted business's place id, website host and phone are kept in `dismissed_leads` (`006_dismissed_leads.sql`), so it isn't sourced again.
- Clean up also offers leads whose **only** known email (on the lead or found by the site check) is a shared inbox (`info@`, `office@`, `contact@`…, list in `src/lib/outreach/cleanup.ts`), but **only for companies over `small_business_max_staff` (50)**, and not if they score at least `generic_email_keep_score` (7). At a small company, info@ usually reaches the owner. The site check saves a person's address ahead of a shared inbox when a site shows both.
- **Company size** (`src/lib/outreach/company-size.ts`, first match wins):
  1. `staff_size` on the lead.
  2. Team-size wording on the site ("team of 12", "over 60 employees", "25+ technicians").
  3. 4+ locations listed on the site → large.
  4. "Owner-operated" / "family owned" → small.
  5. Google reviews: 1,500+ → large; under 150 → small (weak).
  6. Otherwise unknown, which counts as small.

  Website traffic and domain age aren't used: there's no free source for traffic, and age measures how old a business is, not how big. Leads checked before this have no site wording until re-checked. The lead sheet shows the size and its evidence.
- New leads go into the **New** stage with `lead_source='places'` and `contact_name` set to the business name until the owner is found.
- **Emails:** Places does not return emails.
  - The audit (§5) reads the homepage and contact page for a published address and saves it with `email_source='website'`, which is the CASL-safe basis (§7).
  - Lusha fills gaps only, with `email_source='lusha'`.
- **Staff size:** Places does not return it. It comes from Lusha, LinkedIn or manual entry. Until it's known, the lead scores 0 for size.
- **Lusha** CSVs still import through the existing importer (stage 1).
- **Agencies (stage 7.4, `agency.ts`):** Find leads → **Agencies (US)** runs one search per agency type ("web design agency", "local SEO agency", "Google Ads agency", "marketing agency") per city in the ticked states (21 preset cities in NY, FL, TX, IL, GA, NC, SC), one at a time through the same route, with `vertical='agency'` and `country='US'`. It stops when the daily lead cap is reached; for 300+ in one go, raise `places_daily_lead_cap` first or run it on two days. **Clutch and UpCity** are used by hand only: both forbid scraping and block bots. **Lusha** exports (Marketing & Advertising, 2–10 / 11–50 staff, by state) import as `agency` through the usual importer.
- **Property managers and brokerages (stage 7.5, `us-targets.ts`):** Find leads → **Property (US)** runs the same batch (`us-batch-search.tsx`, shared with agencies; the 21 cities live in `US_TARGET_METROS`) with "property management company", "rental property management", "real estate brokerage" and "realty", `vertical='property'`. "Leasing office" is left out because it finds big apartment complexes. Franchise offices (RE/MAX, Keller Williams) are independently owned and count. **Lusha** "Real Estate" exports import as `property` (`normalizeVertical`: property management, real estate, realty, realtor, brokerage, leasing; "property maintenance" stays `handyman`).
- **State licence lists (stage 7.6a, `license-lists.ts`, `socrata-client.ts`):** Find leads → **State lists (US)** imports licensed brokerages and property managers from official open data, with no scraping and no key (`SOCRATA_APP_TOKEN` optional, lifts the shared rate limit).
  - **Texas** (TREC, data.texas.gov `s7ft-44qi`): every active broker company in the chosen counties, its **designated broker** (contact and owner) and its licence date. Active sales agents link to their brokerage, so size is agents + broker.
  - **New York** (DOS, data.ny.gov): principal offices, the principal broker, and agents (salespersons + associate brokers) per office, matched on business name + ZIP.
  - **Illinois** (IDFPR, data.illinois.gov `pzzh-kp68`): active broker corporations, LLC firms and partnerships with city and licence date. Illinois doesn't link agents or the managing broker to firms, so size and contact stay empty until the site check.
  - **Size rule:** 2–20 people kept. A brokerage with no licensed agents is kept only if its name says management, leasing or rentals: property managers' staff usually aren't licensed, so their size shows as unknown. Solo brokers and bigger offices are skipped.
  - Newly licensed brokerages (90 days) sort first in Texas and Illinois and say so in the notes.
  - Leads get `vertical='property'`, `lead_source='state_license'` and `source_ref` (`TX-TREC:<licence>`, unique), so a licence is never imported twice. Companies already in the CRM in the same state (e.g. from Google Maps) are skipped by name. `license_daily_lead_cap` (200) a day; counties per state in `license_counties`.
  - Next step is **Check sites**: the Google listing lookup finds the website (Texas has no city, so it searches "name, TX"; names are unique within a state), then the email.
  - **Florida** (DBPR blocks automated downloads), **Georgia** (paid roster request), **North and South Carolina** (no bulk download; request from the Commission) come in as uploaded files once a sample of each is in (7.6c).
- **Software users (stage 7.6b, `tech-leads.ts`):** Find leads → **Software users (US)** asks TheirStack's company search for small companies (2–20 staff, known size only) whose job posts mention GoHighLevel, AppFolio, Buildium, Rent Manager, Propertyware or kvCORE (`tech_targets`), in the target cities.
  - **Cost:** 3 credits per company returned, capped by `tech_daily_companies` (50 a day).
  - **City matching:** TheirStack matches city names loosely ("Charlotte" finds Charlottesville) and has no state filter, so the city is checked exactly here. Companies outside the target cities are stored as skipped and every company seen is excluded from later searches, so none is paid for twice.
  - **New leads** get website, size, LinkedIn and city, `lead_source='theirstack'`, and a `lead_signals` row (`kind='technology'`, "Uses AppFolio"). The vertical comes from the industry when it names a known one (a roofer on GoHighLevel is a roofer); otherwise from the tool.
  - **Existing leads** are tagged instead.
  - **Drafts:** the brief says "Uses: AppFolio", and the prompt says never to pitch replacing it.
  - Software users aren't queued automatically like job posts; Check sites, then Run outreach as usual.
- **Lusha via Claude (no app change):** ask Claude in chat, e.g. "property managers in Tampa, 2–20 staff, owners".
  1. Claude checks your credits (free) and builds the filters (free).
  2. It previews matching companies and contacts, and shows the count and credit cost before revealing any email.
  3. After your OK it writes a CSV in the importer's Lusha format; import it as usual (`email_source='lusha'`; US leads pass the compliance gate).
- **Buying signals (stage 8.1, `signal-pull.ts`):** fewer, better leads. Once a day after `signal_pull_hour` (7:00), the tick pulls job posts from **TheirStack** (`theirstack-client.ts`) for small companies (2–20 staff, unknown kept) hiring an appointment setter, SDR, lead-gen specialist, CRM admin or GoHighLevel person (`signal_roles`), one search per region in `signal_regions`: the US target states (30 posts a day) and the Ottawa area (10 a day, plus dispatcher and office administrator, the original trades signal). Each post costs 1 credit; about 1,200 a month fits the $49 plan.
  - Every post is stored in `lead_signals` (unique per TheirStack id, so it's never judged twice). Each search asks only for posts TheirStack found since the newest stored one (`discovered_at_gte`, 10 minutes' overlap), and companies seen in the last 30 days are left out, so a post isn't bought twice. Filtered searches take TheirStack about a minute, so the client waits up to 170 seconds, and the tick that pulls leaves site checks and drafting to the next tick.
  - Small companies often have no website on file at TheirStack: those posts are kept, matched to existing leads by name within the state, and the site check finds the website from the Google listing.
  - `job-signals.ts` drops posts with no company name, staffing firms, sizes outside 2–20, places outside the region and titles that don't match a role, before any AI cost. Location ids come from TheirStack's catalog once and are cached in `signal_location_ids`; if one isn't found the region searches the whole country and the state or distance check narrows it.
  - `signal-fit.ts`: Haiku judges the rest (fit / not fit, target, a one-line reason), with the post as quoted data.
  - Fit posts become leads in New (`lead_source='theirstack'`, as TheirStack's terms require; hiring manager from the post as the contact; `signals.hiring = true`, worth the pain points), or tag the lead that's already there. Companies deleted with Clean up stay deleted. Each gets an activity note with the job link.
  - **Buying signals** on the dashboard lists the week's posts with the fit reason and a **Pull now** button (team only, 10 minutes apart, at most two days' credits a day). The lead sheet shows the post and the hiring team.
  - **No scraping of Indeed or LinkedIn**, and Adzuna is out: its terms forbid lead generation without a written agreement. Lusha (Free/Pro, no API) stays manual for owner emails the site check can't find.

Env: `GOOGLE_PLACES_API_KEY`. It can be the same Google Cloud project as `PAGESPEED_API_KEY`.

---

## 4. Scoring (`src/lib/outreach/scoring.ts`, built) and migration `004_sourcing.sql`

`scoreLead(lead, weights, targetVerticals)` is a pure function. It returns `{ score, max, breakdown: [{ reason, points }], painSignals, painChecked }`, so the CRM can show *why* a lead scored what it did (hover the score badge).

Scores are **computed in the app, not stored**. A stored score would go stale whenever a lead is edited in the form, the sheet or the importer. Pain signals found by sourcing and the audit are stored in `leads.signals`.

Default weights, from the Build Plan, stored in `outreach_settings.score_weights`:

| Signal | Points | Source |
|---|---|---|
| Pain signal: no site, dead site, no online booking, reviews mentioning slow callbacks, or hiring admin/dispatch | +3 (once, however many apply) | audit, Places reviews, job feed |
| 2–15 staff (agencies and property 2–20, `staff_range`) | +2 | `staff_size` |
| Owner reachable directly | +2 | owner name found on the About page or LinkedIn **and** a direct email or phone; or `job_title` matches owner/founder/president/principal |
| Target vertical | +1 | `vertical` in `target_verticals` (`handyman`, `agency`, `car_dealer`, `property`; car dealers were missing until 018); agencies show their services, e.g. "Agency: web design, local SEO, GoHighLevel" |
| Off-target agency (branding, social content, enterprise) | −max | `signals.off_target`, set by the site check for agency leads: they score below zero, start unticked and are offered by Clean up |

- **Threshold:** `outreach_settings.score_threshold`, default **5**. This is a placeholder; the Build Plan lists it as an open question.
- In the pop-up's Gather step, leads below the threshold show a **non-blocking** warning and start **unticked**. You can still tick them. This only applies once a lead has been checked for pain signals (`signals.checked_at`). Imported leads that were never checked show a `?` on their score and aren't unticked.
- **Reviews signal:** keyword match on the Places reviews first ("call back", "never called", "no response", "hard to reach"). Classify with `claude-haiku-5-5` only if keywords prove too noisy. Fetching reviews needs a Place Details call per lead, which costs more, so it's done only for leads that pass dedupe.

**`004_sourcing.sql`**: idempotent, same style as 002.
- `leads` +:
  - `lead_source TEXT CHECK (places, lusha, import, manual, referral, other)`
  - `google_place_id TEXT` (unique where not null)
  - `google_rating NUMERIC(2,1)`, `google_review_count INT`
  - `owner_name TEXT`
  - `signals JSONB DEFAULT '{}'` (`checked_at`, `no_site`, `no_booking`, `hiring`, `slow_callback_reviews`, …)
- `tasks` + `kind TEXT DEFAULT 'general' CHECK (general, call)`.
- New `outreach_settings` keys:
  - `score_weights`, `score_threshold` 5, `target_verticals` `["handyman"]`
  - `call_list_size` 3, `auto_unlock_min_days` 14
  - `places_max_results` 60, `places_daily_lead_cap` 200 (cost guard, §16 S7)
- Stage 5 adds `outreach_emails.opener`, `template_key` and the `email_templates` setting.

---

## 5. Site audit (`src/lib/outreach/audit.ts`, built)

Run from **Check sites** (dashboard header: every lead in New not checked in the last `audit_max_age_days`) or **Check site** on the lead sheet. `/api/outreach/audit` checks one lead per request, and the dialog runs 3 at a time.

- The full result is stored on the lead (`leads.audit`, `audited_at`; `005_audit.sql`). Pain signals are merged into `leads.signals`, so the score and call brief update straight away. Stage 5 copies the audit into `outreach_emails.audit` when it drafts.
- Only gaps are filled: a published email is saved when the lead has none (`email_source='website'`). The owner's name is saved when there's none, and it replaces the contact when the contact was just the business name. If the lead's existing email (e.g. from Lusha) is published on the site, its source becomes `website`, the CASL basis.
- **Reviews (opt-in):** the "Also scan Google reviews" box makes one Place Details call per lead (reviews only, at Google's top price tier; at most 5 reviews). Snippets that mention slow callbacks are saved and shown on the lead sheet.
- **Missing websites are looked up, not assumed.** With an empty Website field:
  - Leads from Find leads already had Google's listing checked (no website there), so the status is **no website (confirmed)**.
  - For other leads, one Places Text Search runs on "{company}, {city}". A listing is used only if it matches on phone, email domain (not free mail), or name + city; a single-word name never matches.
  - If the listing has a website, it's saved and checked. If it has none, the status is confirmed. Otherwise the status is **website unknown**: +0, never the no-site angle.
  - The place id, rating and phone are saved too, unless another lead already has that listing (flagged as a possible duplicate).
  - "Look up missing websites on Google" in Check sites is on by default. Audits from before this change count as "unknown" and are queued for re-checking.
- Fetching goes through `safe-fetch.ts` (§16 S2).

| Check | Method | Field |
|---|---|---|
| Site exists / resolves | `safeFetch`: up to 3 redirects, 10s, 2 MB; Facebook/directory pages count as no site | `has_site`, `dead_site` (DNS failure, connection error, 5xx, 404) |
| HTTPS / SSL | final URL scheme | `https` |
| Mobile-friendly | `<meta name="viewport">` present | `mobile_viewport` |
| Performance | Google PageSpeed Insights API v5, mobile | `perf_score` (0–100) |
| Outdated | latest year in footer `©` text (weak signal; many sites render it with JS) | `copyright_year` |
| Online booking / quote | form, or links/text matching quote, book, estimate, schedule, or widgets (Jobber, Housecall Pro, ServiceTitan, Calendly) | `has_booking`, `booking_tool` |
| Contact form | `<form>` with an email/message field | `has_contact_form` |
| Published email | `mailto:` links and plain addresses on the homepage and `/contact` | `emails_found` → lead `email`, `email_source='website'` |
| Owner name | Patterns on the about/contact pages ("Robert Smith, Owner", "founded by …"). Shown as unverified. Claude Haiku can replace this if it proves too noisy | `owner_name` |
| Basic SEO | `<title>`, meta description, single `<h1>`, city in title or H1 | `seo_issues` |
| Contact visibility | phone number on homepage | `phone_on_homepage` |

**Agency profile** (`audit.agency`, `agency.ts`): services from the site text (web design, local SEO, Google Ads), **GoHighLevel** from its hosts in the page (`leadconnectorhq.com`, `msgsndr.com`, `*.gohighlevel.com`) or the name, and **off-target**: branding- or social-content-only wording with none of those services, or enterprise wording ("Fortune 500", "enterprise clients") with none of them either. An agency that offers those services and boasts about Fortune 500 clients isn't penalised: it gets a "Big-client wording" note on the lead sheet (kept out of the copywriter's findings), and the team size decides. Team-size wording also counts designers, developers, marketers and specialists. It's stored on every audit but only used for agency leads.

**Request links** ("Book a test drive", "Request a quote", "Trade-in appraisal", "Credit application") are found by link text, or by URL path when the link is an image, and stored in `request_paths`. Many platforms (ZopDealer, Wix forms) load the form itself with JavaScript, so the link is often the only thing the check can see.

The **primary hook** is the first match in this order:
1. `no_site`
2. `no_booking`: nothing found at all
3. `request_only`: request links, but no booking tool
4. `not_mobile`
5. `slow` (perf < 50)
6. `outdated` (3+ years old)
7. `request_only`: contact form only
8. `seo_local`
9. `generic`

For **agency** leads the hook is only ever `no_site`, `no_booking`, `request_only` or `generic`, and their findings leave out speed, mobile, footer year and SEO: building and ranking sites is their job, so their own site is never the angle.

`request_only` means requests land in an inbox and someone has to reply. Because the check can miss forms, "not seen" findings are worded as not seen, never as missing (`011_copy_feedback.sql` adds the hook).

**Rules:**
- Respect robots.txt.
- Make at most 3 page requests per domain (home, contact, about) plus robots.txt and the PageSpeed call.
- A 403/429 homepage (bot blocker) records no findings rather than guessing, and the hook stays `generic`.
- `audit_daily_cap` (800) checks per day, enforced server-side (`007_cleanup_rules.sql`).
- Reuse an audit for the same lead if it's under 30 days old.

The same audit data later produces the **free ops audit PDF** (Week 4), which is the inbound call to action.

---

## 6. Run outreach pop-up (stage 2 is built)

**Trigger** (built):
- A **Run outreach** button in the dashboard header.
- A send icon on the New column header.
- A badge on the button counts active runs. It will also show "ready for review" when a manual-mode scheduled run is waiting.

### Step 1: Gather (built)
- Lists every lead in New, all ticked except blocked and below-threshold leads.
- Each row shows company, contact, email, city and vertical, plus warnings and, from stage 3, the score.
- Leads with a **blocking** warning are unticked and locked (§7).

### Step 2: When (built)
- **Run now**, or **Schedule** a date and time.
- A scheduled run saves `outreach_runs` with `status='scheduled'`. It re-gathers New when it fires.

### Step 3: Write (manual mode only)
- One card per lead:
  - The audit hook in plain English (e.g. "Requests go to an inbox; no instant booking").
  - The **subject** and **opener** Claude drafted (§8), shown inside the rendered email 1 from the template.
  - Emails 2–3 collapsed.
- You can edit the opener, the subject, or the whole email. **Approve** or **Skip** per lead.
- `author` is recorded as `human` (written from blank), `claude` (accepted unchanged) or `claude_edited`.
- A scheduled run in manual mode does the audit and drafts, then sets `status='awaiting_review'` and waits here.

### Step 4: Queue and send
- **Queue N approved** re-checks each email server-side (paused, suppression, CASL, cooldown, text present) and marks it `queued`.
- The scheduler sends queued emails from the mailbox, `sends_per_tick` per 5-minute tick inside the send window and under the day's cap (§11). For each one:
  1. Send email 1 through Graph.
  2. Mark `status='sent'` and start the sequence.
  3. Log an `email` activity.
  4. Move the lead to Contacted at position 0.
- Emails 2–3 go out as replies in the same thread on business days, until a reply, bounce or unsubscribe.
- **Send test to me** sends email 1, footer included, to the mailbox itself straight away.
- Failures and blocked leads appear on their cards; a queued email can be undone back to a draft.

In **auto mode**, Step 3 is skipped.

---

## 7. Compliance gate (`src/lib/outreach/compliance.ts`, built)

Block if:
- the lead has no email
- the email or its domain is in `suppression_list`
- **Canada (CASL):** `country = 'CA'` and `email_source` is not `website`, or the country is unknown
- the lead was sent outreach within `resequence_cooldown_days` (180)
- another lead in the same run has the same lowercased email
- the lead already has a draft, approved or queued email in another live run (the daily Buying signals run drafts leads that are still in New). Cancelled and failed runs don't count: cancelling a run skips its unsent emails, so nothing queued goes out and its leads can join a new run

The CASL basis for each lead is its `email_source`: the address was published by the business, and the pitch relates to their role. Website-found emails from the audit (§5) give Places leads this basis automatically. **Confirm the CASL details with a lawyer before scaling Canadian sends** (Build Plan).

Every outgoing email must include (added by `mail-message.ts` at send time; sending refuses without it):
- sender name and business name
- mailing address (`OBATEK_MAILING_ADDRESS`)
- the opt-out line: "Not a fit? Reply STOP or "unsubscribe" and I won't email you again."

No links, no tracking pixel. The inbox sync turns STOP/unsubscribe replies into do-not-contact entries within one tick; the legal limit is 10 business days (CASL and CAN-SPAM). The mailbox must keep receiving mail for at least 60 days after the last send (CASL; CAN-SPAM 30). If the laptop will be off for over a week, handle STOP replies by hand in Outlook. US leads are covered by the same footer (CAN-SPAM) and honest subject lines.

**Audit log:** `outreach_emails` (who, what, when, which template, which author) plus the `email` activity on the lead is the per-send record the Build Plan asks for.

---

## 8. Copywriter (`src/lib/outreach/copywriter.ts`, built)

**Changed to match the Build Plan:** Claude writes only the **subject line and one specific opening line**. Everything else is a short, fixed template, so results can be compared across leads.

- **Model:** `claude-opus-5-5` (setting `copy_model`; chosen over Sonnet 5.5 for quality, about $15–30 per 750 leads). One call per lead through `/api/outreach/prepare` returns `{ subject, opener }` via structured output (`client.beta.messages.parse` + Zod), effort `medium`, with server-side `fallbacks: "default"` in case of a refusal. The system prompt (`prompts/copy-system.ts`) is cached.
- **Prepare** also refreshes the site check if it's missing or older than `audit_max_age_days`, and is capped at `draft_daily_cap` (300) drafts a day.
- **Checks before use (§16 S3):** subject 2–5 words, opener under ~40 words and at most two sentences, no links/emails/phone numbers, no banned phrases, no repeated greeting, and no claims that something is missing ("there's no way to", "you don't have", "customers can't"), except for a confirmed `no_site`. The owner knows their own site, so the opener names what the current process costs them instead. One retry with the broken rules spelled out; after that the opener is left blank to write by hand. Website findings and review snippets go in as quoted data, with an instruction that they aren't instructions.
- **Prompt inputs:**
  - Lead: company, vertical, city, owner name/first name, job title.
  - Audit findings, the primary hook, and review/hiring signals.
  - Up to `example_max_in_prompt` winning openers (§9), same vertical first.
- **Feedback and writing rules** (`copy_feedback`, `011_copy_feedback.sql`):
  - **Feedback** on a draft card redrafts it. Claude gets its previous subject and opener plus your note.
  - Tick **Remember** to keep the note as a **writing rule**, for every lead or only the lead's vertical.
  - Active rules (newest 20) go in a second system block after the fixed prompt, and are cached with it. They override the style rules, never the no-invented-facts or no-contact-details rules.
  - Manage rules under **Writing rules** in the Write step; removing one turns it off and keeps the history.
  - This is how each business using the engine makes drafts sound like its own staff.
- **Templates:** `outreach_settings.email_templates` (`009_write_step.sql`), keyed by vertical with a `default`. Also `sender_name`. Edit them in the settings table for now.
  - Each has 3 steps with `{{first_name}}` (owner, else contact, else "there"), `{{company}}`, `{{opener}}`, `{{subject}}`, `{{sender_name}}` and `{{sender_first_name}}`. Emails 2–3 reuse the subject as `re: …`.
  - The rendered text for all 3 steps is stored in `outreach_emails.steps`, with `opener` and `template_key` alongside. Claude's untouched version goes in `draft_steps`; on approval, `author` becomes `claude` if unchanged, `claude_edited` if edited, `human` if Claude's draft was rejected or never made.
  - Email 1's offer is the **free ops audit** (Build Plan, inbound layer).
  - **`agency`** (`015_agencies.sql`): instant follow-up on new inquiries, an AI receptionist for the sales line during client calls, discovery calls booked onto the calendar; US spelling, no "here in Ottawa". The prompt tells Claude to write about their own new-business inquiries and never judge their website, SEO or ads. Call brief question: "When someone fills in your contact form at 9pm, what happens next?"
  - **`car_dealer`** (`012_car_dealer_template.sql`): test drives buyers can book themselves, enquiry follow-up, and an AI receptionist for when the team is busy or the lot is closed. The audit asks how {{company}} handles calls and buyer enquiries. Hand-typed verticals are matched loosely ("Car Dealer" → `car_dealer`), and the migration moves existing "used car dealer"-style leads to `car_dealer`.
  - **`property`** (`018_property.sql`): a CRM that keeps every lead, tenant and owner in one place, instant replies to inquiries, and an AI receptionist for after-hours calls; US spelling, 59 words plus the opener. The prompt tells Claude to write about inquiries and calls waiting while the team is out at showings or inspections, and never to comment on listings, prices or the market. Site-critique hooks stay allowed (unlike agencies). Call brief question: "When a tenant calls about a leak at night, or a buyer inquiry comes in during a showing, who picks up?" Buying signals also look for inside sales agents (real estate's appointment setter), leasing agents and property administrators.
- **Copy rules** (`src/lib/outreach/prompts/copy-system.md`):
  - Opener: one or two sentences, one specific observation from the audit or reviews, nothing invented
  - Email 1 in total: under 90 words, plain text, no links except the unsubscribe footer, one question as the CTA
  - Email 2 (3 business days later): short bump, different angle. Email 3 (5 business days after that): low-pressure breakup
  - No fake familiarity, no invented claims, no fake case studies. The Jo case study is used only once it's written and approved
  - Subject lines: lowercase, 2–5 words, no clickbait
  - Sound like a person from Ottawa who's worked the Home Depot Pro Desk, not a marketing agency
- **Buying-signal leads (stage 8.1b):** when the lead has a fit job post from the last 30 days, the primary hook is `job_post` ("Hiring for work OBATEK automates") whatever the site check found. The brief gets a `<buying_signal>` block (job title, posted date, up to 500 characters of the post as quoted data). The prompt says: lead with the post plainly ("Saw you're hiring an appointment setter"), name the work that hire is meant to fix, never suggest they shouldn't hire, no pay, no saying where the post was seen. Claude also writes a **LinkedIn connection note** (300 characters or less, no links), checked by `draftProblems` and saved in `outreach_emails.linkedin_draft`. The Write step shows a "Signal: hiring …" chip, the job link, and the note with **Copy** and a link to the hiring person's (or company's) LinkedIn. LinkedIn is sent by hand: no automated requests, messages or profile scraping.
- Invalid JSON is retried once. After that, the opener is left blank for you to write.

---

## 9. Learning loop (`src/lib/outreach/examples.ts`)

This uses examples in the prompt, not fine-tuning.

- **Stats:**
  - Every sent email keeps replies, bounces and unsubscribes, read from the mailbox (§11). Opens aren't tracked: emails are plain text with no pixel.
  - Replies are classified with `claude-haiku-5-5` into `interested`, `not_now`, `wrong_person`, `unsubscribe`, `out_of_office` or `other`.
- **Winners** (`is_example = true`): the **opener and subject** of any email that:
  - got an `interested` reply, or
  - you starred by hand.
- **Auto-mode unlock.** The **Switch to auto** toggle becomes available when all three of these hold:
  - sends ≥ `auto_unlock_min_sends` (50),
  - reply rate ≥ `auto_unlock_reply_rate` (placeholder 0.05), and
  - the first manual send was at least `auto_unlock_min_days` (14) ago. This matches the Build Plan's "approve each email for the first 2–3 weeks".

  You flip it; it never turns on by itself.
- **Feedback history:** every note given on a draft is kept in `copy_feedback`, including ones not saved as rules, next to the email it was about. It shows which corrections come up most and should become rules or prompt changes.
- **Caveat:** opens were dropped with Instantly (Apple Mail Privacy Protection made them unreliable anyway, and a pixel hurts deliverability). Reply rate and meetings (§12) are the signals.

---

## 10. Call list and call briefs (`src/lib/outreach/call-brief.ts`, built)

This was a later phase; the Build Plan moves it to Weeks 1–2.

- **Today's calls** (dashboard header) ranks the top 15 scored leads in New or Contacted that have a phone and no open call task. The top `call_list_size` are ticked. "Add to today" creates a `tasks` row for each (`kind='call'`): "Call {owner or company}", due today.
- `buildCallBrief(lead, score)` fills the task `description` with a one-screen brief. Stage 4's audit makes it richer (owner name, more pain signals); the format stays the same:
  - owner name and role, company, city, rating and review count
  - **the pain signal**, in plain English
  - **one question to ask**, from the primary hook (e.g. no_booking → "How do customers ask you for a quote after hours?")
- **Outcomes:** each call card has an outcome (no answer, voicemail, talked, not interested, meeting booked) and notes. Logging it completes the task and adds a `call` activity with `meta.outcome`. "Meeting booked" opens the existing meeting dialog.
- **LinkedIn:** a copy-paste note (≤ 280 chars) is generated next to the brief. Sending stays manual (account-restriction risk). Marking it sent logs an activity with `meta.channel='linkedin'`.

Goal from the Build Plan: 3 calls a day plus email in under 30 minutes.

---

## 11. Sending, inbox and scheduler

Sending runs in-house from the **getobatek.com Microsoft 365 mailbox** through Microsoft Graph. Never send from obatek.net.

### Mailbox (stage 7.1)
- **Entra app** (single tenant): Web redirect `http://localhost:3000/api/outreach/mailbox/callback`, delegated `openid offline_access User.Read Mail.Send Mail.ReadWrite`, admin consent granted. Keys in `.env.local`: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET` (note its expiry) and `MAIL_TOKEN_KEY` (`openssl rand -base64 32`).
- **Connect** in Settings → Sending mailbox: `/api/outreach/mailbox/connect` (team member; random state + PKCE in an httpOnly cookie) → Microsoft sign-in → `/callback` (state checked, code exchanged at the token endpoint, address must be on `sending_domain`).
- **Token storage** (`src/lib/email/mailbox.ts`, `token-crypto.ts`): the refresh token is AES-256-GCM encrypted with `MAIL_TOKEN_KEY` in `outreach_mailbox`, which has RLS on and no policies; only its SECURITY DEFINER functions touch it. Access tokens live in memory only; Microsoft's rotated refresh token is saved each time. An `invalid_grant` marks the mailbox `needs_reconnect`.
- `graph-client.ts` holds every Graph call. All use `Prefer: IdType="ImmutableId"`, so a draft keeps its id after it moves to Sent Items.

### Sending (stage 7.2; `sequence.ts`, `mail-message.ts`, `send-queue.ts`)
- **Queue:** approved emails become `queued` (§6). Each tick sends up to `sends_per_tick` (2) inside `send_window` read in `send_timezone` (America/Toronto, weekdays 08:30–16:30).
- **Email 1:** created as a draft, then sent (`/me/sendMail` returns no ids). Plain text plus the footer (§7). The ids go in `outreach_messages`.
- **Follow-ups:** email 2 three business days later, email 3 five after that (`followup_business_days`). Sent with `createReply` on email 1, with the recipient set explicitly (the original sits in our Sent Items). Due follow-ups go before new first emails.
- **Stops:** a reply, bounce or unsubscribe, the address on the do-not-contact list, or the lead moved out of Contacted. An out-of-office reply only pushes the next step back 3 business days.
- **Before every send:** paused, the window, the cap, and for email 1 compliance again with fresh data. A message already recorded for that step is never sent twice.
- **Cap and warm-up:** every message counts (follow-ups and seed copies too), from local midnight. Effective cap = min(`daily_send_cap`, `send_ramp` for the week since `warmup_started_at`): 5 → 10 → 15 → 20 a day. The ramp holds a step back while 7-day bounces are 2% or more, or the latest seed check was spam or missing. `warmup_started_at` is set by the first real send. At 20 a day with 3 steps, steady state is about 7 new leads a day.
- **Seed checks:** with `seed_addresses` set (your own Gmail/Outlook inboxes), a copy of the day's first email goes to each, daily for the first two weeks, then weekly. Mark where each landed in the pop-up.
- **Errors:** an account-wide Graph error (401, 403, 429, 503) stops the batch and keeps the queue. A Microsoft block (`ErrorMessageSubmissionBlocked` and similar) pauses sending. Other errors mark that email `failed`, or stop that sequence.

### Inbox sync (stage 7.3; `inbox-events.ts`, `inbox-sync.ts`; replaces Instantly polling)
- **When:** each tick, before sending, and when the pop-up opens (skipped if read in the last 2 minutes).
- **What:** `GET /me/messages` in every folder (Junk included) since the watermark minus 5 minutes, skipping drafts and our own mail. The watermark is `outreach_mailbox.inbox_checked_at`.
- **Matching:** same thread (`conversationId`), then the lead's address (emails sent in the last 60 days), then a colleague at the lead's company domain (never a free-mail domain). Bounce notices match by thread or by an address in the notice.
- **Bounce notices:** from postmaster/mailer-daemon/MicrosoftExchange…, or an "Undeliverable"-type subject. 5.x.x → `bounced_at`, `hard_bounce` suppression, sequence stopped; 4.x.x is ignored (Microsoft retries). Sender-blocked codes (5.7.233, 5.7.708, 5.1.8, 5.7.705, 5.7.750, 5.7.501, 5.7.511) pause sending at once.
- **Auto-replies:** by `Auto-Submitted`, `X-Autoreply`, `X-Autorespond`, `Precedence` or an "Automatic reply" subject. They push the next follow-up back.
- **Replies:** `replied_at`, sequence stopped. Only the new text counts: the quoted email (with our footer) is cut off. "STOP" on its own or unsubscribe wording → `unsubscribed_at`, `unsubscribe` suppression (the lead, and the colleague who asked). Otherwise Haiku (`reply_model`) labels it, up to 10 a sync; a Claude `unsubscribe` label does the same.
- **Timeline:** reply, bounce and unsubscribe are logged as `email` activities, `meta.external_id = outreach:<email id>:<event>` for dedupe.
- **Interested replies:** a toast, Recent replies in the pop-up (with a **Do not contact** button for anything missed), and the line on the sent card. You move the lead yourself.

### Safety
- `sending_paused` is the kill switch. It starts on; turn it off in the SQL editor when warm-up has started.
- **Auto-pause:** over 5% bounces among the last 7 days' sends (after at least 20 sends), or any sender-blocked bounce code. `sending_paused_reason` shows in the send panel.
- Microsoft says Exchange Online isn't meant for bulk commercial mail; at 5–20 a day this stays well inside its limits (10,000 recipients a day, 30 a minute). getobatek.com has its own tenant, so a block can't touch obatek.net mail.

### Instantly (stages 6–7, retired)
Stage 6 added leads to an Instantly campaign and stage 7 polled its stats. Both were replaced in 7.1–7.3 before any real sends; the `instantly_*` columns stay for history and the settings were removed in 014. Reused from that work: the scheduler, gather, drafting, the reply classifier, suppression and auto-pause.

### Scheduler (local, built)
- `scripts/outreach-scheduler.mjs`, run with `npm run outreach:scheduler` in a second terminal next to `npm run dev`. It reads `.env.local` and needs `CRON_SECRET`.
- Every 5 minutes it calls `POST localhost:3000/api/outreach/cron/tick` with `Authorization: Bearer $CRON_SECRET`. Set `OUTREACH_APP_URL` to change the address. The middleware lets this path through without a session, and the route checks the secret itself.
- **Each tick:**
  1. **Start due runs** (`scheduler.ts`), up to 2 a tick. The claim is atomic, so a run can't start twice. A run re-gathers the New stage with the same `gather.ts` as the pop-up, skips leads unticked when it was scheduled and leads below the score threshold, and records blocked leads.
  - **Buying signals** (when `THEIRSTACK_API_KEY` is set, §3): pull once a day after `signal_pull_hour`; site-check up to 4 new signal leads a tick (within `audit_daily_cap`); then add checked signal leads in New that pass the compliance gate (and aren't off-target) to today's **Buying signals** run, once each. That run has `auto_prepare`, so step 2 drafts it. Leads with no email after the site check stay out of the run: look them up in Lusha or call them.
  2. **Write drafts:** up to `cron_drafts_per_tick` (5) for scheduler-started runs, with the same `prepare-email.ts` as the Write step. The daily draft cap still applies.
  3. **Read the inbox** (replies, bounces, opt-outs).
  4. **Send what's due:** follow-ups, then queued first emails, then seed copies, with settings read again (step 3 may have paused sending).
- Runs wait in **Ready for review**; approving and queueing stay manual until auto mode (stage 9).
- The tick uses the service-role client (`src/lib/supabase/admin.ts`, needs `SUPABASE_SERVICE_ROLE_KEY`).
- The laptop must be awake; anything that came due while it slept goes on wake, because the scheduler ticks once at start.
- **Later:** Supabase `pg_cron` + `pg_net` call the same route.

---

## 12. Metrics (`src/components/outreach/outreach-stats.tsx`)

**The one number:** meetings booked per 100 leads contacted, **split by channel**. It shows whether the problem is the list, the message or the follow-through.

- **Channel of a lead** = its first outreach touch:
  - `email`: first `outreach_emails.sent_at`
  - `call`: first `call` activity
  - `linkedin`: first activity with `meta.channel='linkedin'`
- **Meetings:** `meetings` rows for that lead after the first touch.
- **Supporting metrics:**
  - leads sourced and qualified per week (`lead_source`, `score ≥ threshold`, `created_at`)
  - reply and bounce rate (per sending mailbox once there's more than one)
  - calls per day and connect rate (`call` activity outcomes)
  - meetings → won deals
- **Cost per qualified lead:** Places + PageSpeed + Claude calls are counted per sourcing run (an open question in the Build Plan). Log the call counts in the sourcing response, then work out the cost by hand from current pricing.

---

## 13. Phase 0 — Sending infrastructure (start now)

Week 3's first sends need 2–3 weeks of warm-up, so this has to start in Week 1.

- [x] Buy **getobatek.com** (GoDaddy) and redirect it to obatek.net
- [x] **Microsoft 365** mailbox on getobatek.com, in its own tenant (separate from obatek.net)
- [x] DNS: MX, SPF, DKIM (on), DMARC (`p=none` with reports to the mailbox; move to `p=quarantine` once reports are clean)
- [x] Entra app registered; mailbox connected in Settings
- [ ] `MAIL_TOKEN_KEY`, `OBATEK_MAILING_ADDRESS` in `.env.local` (a PO box or virtual mailbox is fine for the address)
- [ ] Add your own Gmail/Outlook inboxes to `seed_addresses`; send some real 1:1 mail from the mailbox and get replies
- [ ] Turn `sending_paused` off; the ramp starts at 5 a day with the first send
- [ ] Google Cloud project with the Places API (New) + PageSpeed enabled; keys in `.env.local`

Authenticated SMTP isn't needed: Graph doesn't use it.

The Gmail account (obatekoutreach@gmail.com) is **not** used for sending.

---

## 14. Code layout

```
src/lib/outreach/                 # engine core: pure functions only (lint-enforced)
  settings.ts          ✅
  compliance.ts        ✅
  sourcing.ts          ✅ # Places search → candidate leads, dedupe
  scoring.ts           ✅
  call-brief.ts        ✅
  agency.ts            ✅ # agency searches, services / GoHighLevel / off-target detection
  us-targets.ts        ✅ # US target states and cities (agencies, property), property searches
  socrata-client.ts    ✅ # state open-data portals (SoQL, paging), server only
  license-lists.ts     ✅ # TX / NY / IL licence lists → leads, size rule, dedupe
  tech-leads.ts        ✅ # software users (TheirStack company search) → leads + technology signals
  theirstack-client.ts ✅ # TheirStack job search + location catalog (server only)
  job-signals.ts       ✅ # role match, region and prefilter, post → signal row → lead
  signal-fit.ts        ✅ # Haiku fit check on a post (server only)
  signal-pull.ts       ✅ # the daily pull: fetch, store, judge, create or tag leads
  audit.ts             ✅ # fetch + HTML checks (server only)
  audit-findings.ts    ✅ # result type, hook, signals, findings (browser-safe)
  safe-fetch.ts        ✅ # SSRF-guarded page fetch
  copywriter.ts        ✅ # Claude subject + opener, rule checks (server only)
  templates.ts         ✅ # fill the 3-email template, author tracking (browser-safe)
  run-audit.ts         ✅ # full site check for one lead, shared by audit + prepare
  examples.ts          # winner selection + stats
  graph-client.ts      ✅ # every Microsoft Graph call: send, threaded reply, read the mailbox
  mail-message.ts      ✅ # plain text + required footer
  sequence.ts          ✅ # send window, business days, warm-up cap, what's due (pure)
  send-queue.ts        ✅ # send due follow-ups and queued emails, seed copies, test send
  inbox-events.ts      ✅ # bounce / auto-reply / reply, opt-out wording, matching (pure)
  inbox-sync.ts        ✅ # read the mailbox, label replies, suppress, auto-pause
  sending.ts           ✅ # queue result type
  gather.ts            ✅ # source-stage leads + compliance + score (pop-up and scheduler)
  prepare-email.ts     ✅ # one draft: audit refresh, Claude, template (Write step and scheduler)
  scheduler.ts         ✅ # start due runs, write pending drafts
  stats.ts             ✅ # event titles, reply labels, auto-pause rule
  reply-classifier.ts  ✅ # Haiku labels a reply (server only)
  prompts/
    copy-system.md
    reply-classifier.md
  adapters/
    obatek-crm.ts      ✅ # pushLeads / fetchExistingContacts / findStageByName (the only DB access; updateStatus comes with stage 6)
src/lib/api/guards.ts        ✅    # requireTeamMember(), hasValidCronSecret()
src/lib/supabase/admin.ts    ✅    # service-role client (cron route only)
src/lib/email/mailbox.ts     ✅    # Microsoft sign-in, token refresh (server only)
src/lib/email/token-crypto.ts ✅   # AES-256-GCM for the refresh token (server only)
src/lib/queries/outreach.ts  ✅    # React Query hooks
src/lib/queries/calls.ts     ✅
src/components/outreach/
  outreach-run-dialog.tsx ✅  gather-step.tsx ✅  schedule-step.tsx ✅  active-runs.tsx ✅
  find-leads-dialog.tsx ✅  us-batch-search.tsx ✅  check-sites-dialog.tsx ✅  todays-calls-dialog.tsx ✅  score-badge.tsx ✅
src/components/leads/lead-site-check.tsx ✅
  write-step.tsx ✅  send-panel.tsx ✅  copy-rules-panel.tsx ✅  recent-replies.tsx ✅  seed-checks.tsx ✅  mailbox-card.tsx ✅  outreach-stats.tsx
src/app/api/outreach/
  source/route.ts          ✅ # Places search + dedupe + insert
  audit/route.ts           ✅ # site check (+ optional reviews), one lead
  prepare/route.ts         ✅ # audit refresh + Claude subject/opener, one lead
  send/route.ts            ✅ # queue one approved email
  send/test/route.ts       ✅ # email 1 to the mailbox itself
  mailbox/connect, mailbox/callback ✅ # Microsoft sign-in for the sending mailbox
  cron/tick/route.ts        ✅ # due runs + drafts + inbox + sending (CRON_SECRET)
  stats/sync/route.ts       ✅ # inbox sync when the pop-up opens
scripts/outreach-scheduler.mjs ✅
```

The current `queries/outreach.ts` uses the browser client directly for gather and run creation. That's fine for CRM UI; engine work that runs on the server (source, prepare, send, tick) goes through `adapters/obatek-crm.ts`.

**Environment variables (`.env.local`):** `SUPABASE_SERVICE_ROLE_KEY` (scheduler only), `ANTHROPIC_API_KEY`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `MAIL_TOKEN_KEY`, `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, `CRON_SECRET`, `OBATEK_MAILING_ADDRESS`, `THEIRSTACK_API_KEY`, `SOCRATA_APP_TOKEN` (optional). `INSTANTLY_API_KEY` is no longer used.

The legacy Outlook code from the CRM template (`src/lib/oauth/outlook.ts`, `src/lib/email/outlook-sender.ts`, `/api/oauth/outlook`, `/api/email/send`, the compose and connect dialogs) was removed in 7.1: it never saved the refresh token and wrote to tables that don't exist.

---

## 15. Build order

Each week's build feeds that week's outreach (Build Plan). Stage numbers continue from what's done.

| Week | # | Work | Done when |
|---|---|---|---|
| — | 1 ✅ | `002_outreach.sql`; lead fields in form, sheet and importer | A Lusha CSV imports with website/city/vertical filled |
| — | 2 ✅ | Pop-up Gather + When; `outreach_runs` | Run now / Schedule both create runs; New leads listed with warnings |
| 1 | 0 | Phase 0 started (§13) | getobatek.com mailbox connected, DKIM passing |
| — | S ✅ | Security: `003_team_access.sql`, no-access screen, route guards, callback redirect check, safe links (§16) | Only team members see data |
| 1 | 3 ✅ | `004_sourcing.sql`; `sourcing.ts` + Find leads dialog; `scoring.ts`; score in the Gather step and on lead cards; **Today's calls** with basic briefs and outcome logging | 50+ Ottawa handyman leads in New with scores; call the top 15 by hand |
| 2 | 4 ✅ | `005_audit.sql`; `audit.ts` (incl. email and owner discovery, SSRF-safe fetch) feeding `signals`; reviews signal; Check sites dialog; site check on the lead sheet; findings in call briefs | 50 real sites audited; 3 calls a day |
| 3 | 5 ✅ | `009_write_step.sql`; Write step in the pop-up (Start run → drafts, or Review on an active run); Draft all with Claude; edit opener or full emails; approve/skip/undo | 20 drafts approved in the pop-up |
| 3 | 6 ✅ | `010_send.sql`; Instantly send + move to Contacted (Instantly; replaced by 7.1–7.3) | — |
| 3 | 7 ✅ | `013_scheduler_stats.sql`; scheduler + Instantly stats polling (scheduler kept; Instantly replaced by 7.1–7.3) | A scheduled run fires on time |
| 3 | 7.1 ✅ | `014_mailbox.sql`; Entra app; connect/reconnect/disconnect; encrypted token; legacy Outlook code removed | "Connected: …@getobatek.com" shows in Settings |
| 3 | 7.2 ✅ | Graph send queue, pacing, send window, warm-up ramp, threaded follow-ups, stop rules, test send; Instantly sending retired | The full 3-step sequence to 2–3 of your own addresses arrives threaded in Gmail and Outlook |
| 3 | 7.3 ✅ | Inbox sync (replies, auto-replies, bounce notices, opt-out replies, blocked-sender pause); seed placement checks | A reply stops the sequence and shows in Recent replies; "unsubscribe" adds the address to suppression within one tick; then the ramp runs toward 20 a day |
| 3 | 7.4 | `015_agencies.sql`; agency vertical and template; Agencies (US) batch search; agency profile in the site check (services, GoHighLevel, off-target); staff range per vertical; agency hooks and copy | 300+ agencies in New; branding/social/enterprise ones score below zero; openers talk about their inquiries, not their site |
| 3 | 7.6b ✅ | Software users (US): TheirStack company search by GoHighLevel / property management software, technology signals, "Uses: …" in drafts | Property managers on AppFolio in New; openers don't pitch replacing it |
| 3 | 7.6c | Florida DBPR and Sunbiz file uploads (then GA, NC, SC rosters as they arrive) | Waiting on one sample file of each |
| 3 | 7.6a ✅ | `019_lead_sources.sql`; State lists (US): Texas, New York and Illinois licence lists from open data with broker names and office size | Licensed brokerages in New with the broker as contact; Check sites finds their sites |
| 3 | 7.5 | `018_property.sql`; `property` vertical (keywords, template, copy, call question); Property (US) batch search sharing the agency states; car dealers and property added to `target_verticals`; property roles in buying signals | 100+ property managers and brokerages in New; openers about inquiries and after-hours calls |
| 4 | 8.1a ✅ | `017_buying_signals.sql`; TheirStack pull, prefilter, Haiku fit check, leads in New tagged with the signal; Buying signals dialog; signals on the lead sheet | A Pull now with 10 posts puts fit ones in New with a reason, and skips the rest with one |
| 4 | 8.1b ✅ | Signal leads audited automatically; `job_post` hook and a LinkedIn note drafted with the email; a daily "Buying signals" run for one-click review | 10–20 signal emails a day approved; 10%+ reply rate |
| 4 | 8 | Jo case study; audit PDF offer; metrics panel (§12) | Meetings per 100 contacted shown by channel |
| 5+ | 9 | Learning loop + auto mode | Winners appear in the prompt; the toggle unlocks after 14 days + thresholds |
| later | 10 | Generic webhook + CSV adapters; extraction to a service; enterprise features per deal | A real deal asks for it |

**Before the first real send:** send the full sequence to 2–3 of your own addresses (Gmail, Outlook), with `followup_business_days` set to `[0, 0]` for the test. Confirm inbox placement, the footer, that a reply stops the sequence, and that replying "unsubscribe" adds the address to `suppression_list`. Set `followup_business_days` back to `[3, 5]` after.

---

## 16. Security

Each item lists the build stage that must meet it. `/security-review` runs before each stage is committed. ✅ = done.

| # | Risk | Rule | Stage |
|---|---|---|---|
| S1 ✅ | **Open signup + "authenticated" RLS.** Anyone who signs up can read and edit every lead, run and email | `003_team_access.sql`: every policy checks `is_team_member()` (the `team_members` table, edited only in the SQL editor). Non-members see a no-access screen. Also disable public signup in Supabase (Authentication → Sign In / Providers) | now |
| S2 ✅ | **SSRF from the site audit.** Lead `website` values come from CSVs and Places, and the server fetches them | Only `http`/`https` on ports 80/443. Resolve DNS and reject loopback, private, link-local and metadata addresses (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`), checking again after every redirect. Max 3 redirects, 10s timeout, 2 MB body cap. Never send cookies or auth headers. Done in `safe-fetch.ts`: the IP check runs inside the connection's DNS lookup, so a rebinding answer can't slip past it | 4 |
| S3 | **Prompt injection from scraped pages and replies.** Site text, reply bodies and bounce notices reach the engine | Pass scraped text as quoted data in its own block, stripped of HTML and truncated. The system prompt says to never follow instructions in it. Validate the output: JSON shape, length limits, no URLs or email addresses in the opener/subject. In auto mode, anything that fails validation drops to manual review instead of sending. Received mail is only matched against fixed patterns; the classifier gets the reply's own text in `<reply>` tags and can only return one of six labels; reply text is never rendered. Job posts go to the fit check in `<job_post>` tags, stripped and truncated; only the schema's fields come back; job and LinkedIn links are kept only if they're http(s) (hiring team: linkedin.com only) | 5, 6, 7.3, 8, 8.1 |
| S4 ✅ | **Cron route abuse.** `/api/outreach/cron/tick` starts runs and sends email | `hasValidCronSecret()` in `src/lib/api/guards.ts`: `Authorization: Bearer $CRON_SECRET`, compared with `crypto.timingSafeEqual`. Fails when `CRON_SECRET` is unset. Return 401 with no detail | helper done; route in 6 |
| S5 ✅ | **Service-role key exposure** | `SUPABASE_SERVICE_ROLE_KEY` is imported only by `src/lib/supabase/admin.ts`, which starts with `import 'server-only'`. Never prefix it with `NEXT_PUBLIC_`. The same rule applies to `ANTHROPIC_API_KEY`, `AZURE_CLIENT_SECRET`, `MAIL_TOKEN_KEY`, `GOOGLE_PLACES_API_KEY` and `THEIRSTACK_API_KEY` | 3+ |
| S6 ✅ | **Server routes acting for any caller.** `source`, `prepare` and `send` cost money and send email | Each route calls `requireTeamMember()` first (session + `is_team_member()`), and uses that user's client so RLS still applies. Validate the body with zod. Re-check compliance and `sending_paused` server-side on every send; never trust the client's list | 3–6 |
| S7 ✅ | **Cost runaway** (Places, PageSpeed, Claude, TheirStack) | Sourcing: `places_max_results` per search and `places_daily_lead_cap` new leads per day, checked server-side. Prepare: one lead per call (stage 5). Signals: `daily_jobs` per region is the search limit; the pull is marked before it runs so a failure isn't retried every tick; Pull now is 10 minutes apart and capped at two days' credits a day | 3 done; 5; 8.1 |
| S8 ✅ | **Rendering untrusted text.** Scraped names, reviews and Claude output appear in the CRM | Render as text through React. No `dangerouslySetInnerHTML`. Links go through `externalUrl()` in `src/lib/utils.ts` (http/https only) | 3+ |
| S9 ✅ | **Open redirect in the auth callback.** `next` comes from the query string | `safeNextPath()` in the callback route: `next` must start with `/`, not `//` or `/\` | now |
| S10 ✅ | **Mailbox token theft.** Whoever holds the refresh token can send and read as the mailbox | Delegated permissions only, least scopes, single tenant. Refresh token AES-256-GCM encrypted with `MAIL_TOKEN_KEY`; `outreach_mailbox` has RLS and no policies, and its functions are gated by `is_team_member()` or the service role and return ciphertext only. Access tokens in memory only, never logged or sent to the browser. Disconnect deletes the row. Note the client secret's expiry | 7.1 |
| S11 ✅ | **OAuth connect flow** | Random state + PKCE verifier in an httpOnly SameSite=Lax cookie scoped to `/api/outreach/mailbox`; exact localhost redirect; team member required; the address must be on `sending_domain`; only fixed error codes go back to the page | 7.1 |
| S12 ✅ | **Mailbox or tenant restricted by Microsoft** | Pacing (`sends_per_tick`), send window, warm-up ramp, auto-pause on blocked codes and on bounces; getobatek.com in its own tenant so obatek.net mail is unaffected | 7.2–7.3 |

---

## 17. Open questions (from the Build Plan) and notes

- Small-client bundle price per month
- Score threshold (placeholder: 5)
- ~~Which job boards feed the hiring signal~~: TheirStack (8.1). Its terms ban redistributing its data, so when the Lead Engine is sold with buying signals, each client uses its own TheirStack account and key
- Places + Claude cost per qualified lead (§12 logs the call counts)
- Self-hosting from the start or only on request
- Which CRM the first bigger prospect runs
- Lusha company-size enrichment for leads whose size stays unknown (costs credits; the Lusha connector is available)
- A blank country currently blocks email (CASL safety). Places leads always have a country, so this mostly affects old imports
- The legacy Outlook code (and its `email_accounts` / `email_logs` references) was removed in 7.1
- getobatek.com's Microsoft 365 was bought through GoDaddy. Admin features worked for this setup; if GoDaddy ever blocks something, move the subscription to Microsoft directly
- Confirm with a lawyer that reply-to-unsubscribe is enough under CASL before scaling Canadian sends

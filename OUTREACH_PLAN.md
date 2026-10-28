# OBATEK CRM — Lead Engine: Build Spec

**Owner:** Dami Ayoade · **Status:** Building (stages 1–3 done) · **Last updated:** 2026-10-27

This is the implementation spec for **"OBATEK Lead Engine — Build Plan.md"**. That plan covers the strategy: ICP, pain signals, delivery modes, metrics. This file says how it gets built in this repo.

The engine works in four steps:
- It **finds** small trades businesses with visible operational pain (Google Places + a website audit).
- It **scores** them and puts the qualified ones in the **New** stage.
- It **reaches out** through a **Run outreach** pop-up (email through Instantly) and a **daily call list** (call tasks with a one-screen brief).
- Each lead moves to **Contacted** once its first email goes out. You choose when a run happens: now, or at a scheduled time.

The engine starts in **manual mode**: you approve every email. The best performers become the examples Claude learns from. Once results hold up, you switch to **auto mode**.

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase · React Query · shadcn/ui, all in this repo. It runs **locally on Dami's laptop** (`npm run dev` / `npm start`), not on Vercel.
**Database:** `supabase/migrations/002_outreach.sql` (applied), `003_team_access.sql` (§16) and `004_sourcing.sql` (§4). Types are in `src/types/database.ts`.

**Starting ICP:** handyman and home-repair businesses with 2–10 staff that run jobs out of spreadsheets and texts. Bigger HVAC and electrical firms come later.

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
| Each email + its stats (the learning set) | `outreach_emails` | 002; stage 5 adds `opener`, `template_key` |
| Never contact again | `suppression_list` | 002 |
| Switches, thresholds, weights, templates | `outreach_settings` | 002; 004 adds keys |
| Who may use the CRM | `team_members` + `is_team_member()` | 003 |

Stages are always resolved by **name** from settings, never by hard-coded ID.

---

## 3. Sourcing (`src/lib/outreach/sourcing.ts`, built)

A **Find leads** dialog has inputs for vertical, city and max results. It pulls businesses from the **Google Places API (New)** Text Search, for example `"handyman in Ottawa, ON"`.

- **Fields used:** `id` (place_id), display name, formatted address and address components (city, region, country), phone, `websiteUri`, rating and review count. Request only the fields used (field mask), because cost depends on the fields.
- **Dedupe** through the adapter's `fetchExistingContacts()` before insert: match on `google_place_id`, then website domain, then phone digits.
- New leads go into the **New** stage with `lead_source='places'` and `contact_name` set to the business name until the owner is found.
- **Emails:** Places does not return emails.
  - The audit (§5) reads the homepage and contact page for a published address and saves it with `email_source='website'`, which is the CASL-safe basis (§7).
  - Lusha fills gaps only, with `email_source='lusha'`.
- **Staff size:** Places does not return it. It comes from Lusha, LinkedIn or manual entry. Until it's known, the lead scores 0 for size.
- **Lusha** CSVs still import through the existing importer (stage 1).
- **Hiring signal (Week 4):** a job-board feed that flags businesses hiring an office admin or dispatcher. Which boards to use is an open question in the Build Plan.

Env: `GOOGLE_PLACES_API_KEY`. It can be the same Google Cloud project as `PAGESPEED_API_KEY`.

---

## 4. Scoring (`src/lib/outreach/scoring.ts`, built) and migration `004_sourcing.sql`

`scoreLead(lead, weights, targetVerticals)` is a pure function. It returns `{ score, max, breakdown: [{ reason, points }], painSignals, painChecked }`, so the CRM can show *why* a lead scored what it did (hover the score badge).

Scores are **computed in the app, not stored**. A stored score would go stale whenever a lead is edited in the form, the sheet or the importer. Pain signals found by sourcing and the audit are stored in `leads.signals`.

Default weights, from the Build Plan, stored in `outreach_settings.score_weights`:

| Signal | Points | Source |
|---|---|---|
| Pain signal: no site, dead site, no online booking, reviews mentioning slow callbacks, or hiring admin/dispatch | +3 (once, however many apply) | audit, Places reviews, job feed |
| 2–15 staff | +2 | `staff_size` |
| Owner reachable directly | +2 | owner name found on the About page or LinkedIn **and** a direct email or phone; or `job_title` matches owner/founder/president/principal |
| Handyman or home-repair vertical | +1 | `vertical = 'handyman'` |

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

## 5. Site audit (`src/lib/outreach/audit.ts`)

Runs per lead after sourcing (for scoring) and again before drafting if the audit is over 30 days old. The result goes in `outreach_emails.audit` (JSONB) and `primary_hook`. The scoring inputs are copied onto the lead.

| Check | Method | Field |
|---|---|---|
| Site exists / resolves | `fetch` with redirects, 10s timeout | `has_site` |
| HTTPS / SSL | final URL scheme | `https` |
| Mobile-friendly | `<meta name="viewport">` present | `mobile_viewport` |
| Performance | Google PageSpeed Insights API v5, mobile | `perf_score` (0–100) |
| Outdated | latest year in footer `©` text (weak signal; many sites render it with JS) | `copyright_year` |
| Online booking / quote | form, or links/text matching quote, book, estimate, schedule, or widgets (Jobber, Housecall Pro, ServiceTitan, Calendly) | `has_booking`, `booking_tool` |
| Contact form | `<form>` with an email/message field | `has_contact_form` |
| Published email | `mailto:` links and plain addresses on the homepage and `/contact` | `emails_found` → lead `email`, `email_source='website'` |
| Owner name | About page text (Claude Haiku extracts the name + role) | `owner_name` |
| Basic SEO | `<title>`, meta description, single `<h1>`, city in title or H1 | `seo_issues` |
| Contact visibility | phone number on homepage | `phone_on_homepage` |

The **primary hook** is the first match in this order: `no_site`, `no_booking`, `not_mobile`, `slow` (perf < 50), `outdated` (3+ years old), `seo_local`, `generic`.

**Rules:**
- Respect robots.txt.
- Make at most 3 page requests per domain (home, contact, about) plus the PageSpeed call.
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
  - The audit hook in plain English (e.g. "No way to request a quote online").
  - The **subject** and **opener** Claude drafted (§8), shown inside the rendered email 1 from the template.
  - Emails 2–3 collapsed.
- You can edit the opener, the subject, or the whole email. **Approve** or **Skip** per lead.
- `author` is recorded as `human` (written from blank), `claude` (accepted unchanged) or `claude_edited`.
- A scheduled run in manual mode does the audit and drafts, then sets `status='awaiting_review'` and waits here.

### Step 4: Send
- Approved emails are processed **one lead per request**, with a progress bar.
- For each lead:
  1. Push to Instantly.
  2. Mark `status='sent'`.
  3. Log an `email` activity.
  4. Move the lead to Contacted at position 0.
- Failures stay in New and appear in the summary (`outreach_runs.summary`).
- Respects `sending_paused` and `daily_send_cap`.

In **auto mode**, Step 3 is skipped.

---

## 7. Compliance gate (`src/lib/outreach/compliance.ts`, built)

Block if:
- the lead has no email
- the email or its domain is in `suppression_list`
- **Canada (CASL):** `country = 'CA'` and `email_source` is not `website`, or the country is unknown
- the lead was sent outreach within `resequence_cooldown_days` (180)
- another lead in the same run has the same lowercased email

The CASL basis for each lead is its `email_source`: the address was published by the business, and the pitch relates to their role. Website-found emails from the audit (§5) give Places leads this basis automatically. **Confirm the CASL details with a lawyer before scaling Canadian sends** (Build Plan).

Every outgoing email must include (enforced in the Instantly template):
- sender name and business name
- mailing address (`OBATEK_MAILING_ADDRESS`)
- Instantly's hosted unsubscribe link

US leads are covered by the same footer (CAN-SPAM) and honest subject lines.

**Audit log:** `outreach_emails` (who, what, when, which template, which author) plus the `email` activity on the lead is the per-send record the Build Plan asks for.

---

## 8. Copywriter (`src/lib/outreach/copywriter.ts`)

**Changed to match the Build Plan:** Claude writes only the **subject line and one specific opening line**. Everything else is a short, fixed template, so results can be compared across leads.

- **Model:** `claude-sonnet-5-5`. One call per lead returns `{"subject": "...", "opener": "..."}`.
- **Prompt inputs:**
  - Lead: company, vertical, city, owner name/first name, job title.
  - Audit findings, the primary hook, and review/hiring signals.
  - Up to `example_max_in_prompt` winning openers (§9), same vertical first.
- **Templates:** `outreach_settings.email_templates`, keyed by vertical with a `default`.
  - Each has 3 steps with `{{first_name}}`, `{{company}}`, `{{opener}}` and `{{offer}}` placeholders.
  - The rendered text for all 3 steps is stored in `outreach_emails.steps`, with `opener` and `template_key` alongside.
  - Email 1's offer is the **free ops audit** (Build Plan, inbound layer).
- **Copy rules** (`src/lib/outreach/prompts/copy-system.md`):
  - Opener: one or two sentences, one specific observation from the audit or reviews, nothing invented
  - Email 1 in total: under 90 words, plain text, no links except the unsubscribe footer, one question as the CTA
  - Email 2 (3 business days later): short bump, different angle. Email 3 (5 business days after that): low-pressure breakup
  - No fake familiarity, no invented claims, no fake case studies. The Jo case study is used only once it's written and approved
  - Subject lines: lowercase, 2–5 words, no clickbait
  - Sound like a person from Ottawa who's worked the Home Depot Pro Desk, not a marketing agency
- Invalid JSON is retried once. After that, the opener is left blank for you to write.

---

## 9. Learning loop (`src/lib/outreach/examples.ts`)

This uses examples in the prompt, not fine-tuning.

- **Stats:**
  - Every sent email keeps opens, replies, bounces and unsubscribes, updated by polling (§11).
  - Replies are classified with `claude-haiku-5-5` into `interested`, `not_now`, `wrong_person`, `unsubscribe`, `out_of_office` or `other`.
- **Winners** (`is_example = true`): the **opener and subject** of any email that:
  - got an `interested` reply,
  - reached `example_min_sends` (10) with an open rate at or above target, or
  - you starred by hand.
- **Auto-mode unlock.** The **Switch to auto** toggle becomes available when all three of these hold:
  - sends ≥ `auto_unlock_min_sends` (50),
  - open rate ≥ `auto_unlock_open_rate` (0.5), and
  - the first manual send was at least `auto_unlock_min_days` (14) ago. This matches the Build Plan's "approve each email for the first 2–3 weeks".

  You flip it; it never turns on by itself.
- **Caveat:** Apple Mail Privacy Protection inflates open rates. Reply rate and meetings (§12) are the honest signals. Moving the unlock to reply rate is a settings change.

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

## 11. Sending, stats and scheduler

### Instantly (`src/lib/outreach/instantly-client.ts`)
- **Domain:** send only from **getobatek.com**, never obatek.net.
- **Campaigns:** one per vertical plus `default`, with 3 steps whose bodies are custom variables. IDs go in `outreach_settings.instantly_campaigns`.
- **Send:** add the lead to its campaign with the rendered steps. Store `instantly_campaign_id` / `instantly_lead_id`.
- **Polling, not webhooks** (the CRM runs locally). It runs when the pop-up opens and on each scheduler tick, for sent emails with `stats_synced_at` older than 15 minutes:
  - Update the stats.
  - Log new events as `email` activities, with `meta.external_id` used for dedupe.
  - Unsubscribe or hard bounce → add to `suppression_list`.
  - `interested` → toast + badge. You move the lead.
- **Safety:**
  - `sending_paused` is the kill switch.
  - `daily_send_cap` starts at 20 and rises about 5 a week while bounces stay under 2%.
  - Bounces over 5% in 24h auto-pause sending and show a banner.
- Check Instantly's current API (v2) docs before implementing, and keep all of it inside this file.

### Scheduler (local)
- `scripts/outreach-scheduler.mjs`, run with `npm run outreach:scheduler`.
- Every 5 minutes it calls `POST localhost:3000/api/outreach/cron/tick` with `Authorization: Bearer $CRON_SECRET`. The tick starts due runs and polls Instantly.
- The laptop must be awake; a run that comes due while it's asleep fires on wake.
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
  - reply and bounce rate (per sending domain once there's more than one)
  - calls per day and connect rate (`call` activity outcomes)
  - meetings → won deals
- **Cost per qualified lead:** Places + PageSpeed + Claude calls are counted per sourcing run (an open question in the Build Plan). Log the call counts in the sourcing response, then work out the cost by hand from current pricing.

---

## 13. Phase 0 — Sending infrastructure (start now)

Week 3's first sends need 2–3 weeks of warm-up, so this has to start in Week 1.

- [ ] Buy **getobatek.com** and redirect it to obatek.net
- [ ] Mailbox on getobatek.com (Google Workspace or similar)
- [ ] DNS: SPF, DKIM, DMARC (`p=none` with reporting, tighten later)
- [ ] Connect to Instantly and start warm-up
- [ ] Mailing address for footers (a PO box or virtual mailbox is fine)
- [ ] Instantly campaigns per vertical + default; put the IDs in settings
- [ ] Google Cloud project with the Places API (New) + PageSpeed enabled; keys in `.env.local`

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
  audit.ts
  copywriter.ts
  examples.ts          # winner selection + stats
  instantly-client.ts
  prompts/
    copy-system.md
    reply-classifier.md
  adapters/
    obatek-crm.ts      ✅ # pushLeads / fetchExistingContacts / findStageByName (the only DB access; updateStatus comes with stage 6)
src/lib/api/guards.ts        ✅    # requireTeamMember(), hasValidCronSecret()
src/lib/supabase/admin.ts         # service-role client (scheduler only, stage 6)
src/lib/queries/outreach.ts  ✅    # React Query hooks
src/lib/queries/calls.ts     ✅
src/components/outreach/
  outreach-run-dialog.tsx ✅  gather-step.tsx ✅  schedule-step.tsx ✅  active-runs.tsx ✅
  find-leads-dialog.tsx ✅  todays-calls-dialog.tsx ✅  score-badge.tsx ✅
  write-step.tsx  send-step.tsx  outreach-stats.tsx
src/app/api/outreach/
  source/route.ts          ✅ # Places search + dedupe + insert (audit added in stage 4)
  prepare/route.ts            # audit refresh + Claude subject/opener, one lead
  send/route.ts               # push one approved email, log activity, move lead
  cron/tick/route.ts          # due runs + stats polling (CRON_SECRET)
scripts/outreach-scheduler.mjs
```

The current `queries/outreach.ts` uses the browser client directly for gather and run creation. That's fine for CRM UI; engine work that runs on the server (source, prepare, send, tick) goes through `adapters/obatek-crm.ts`.

**Environment variables (`.env.local`):** `SUPABASE_SERVICE_ROLE_KEY` (scheduler only), `ANTHROPIC_API_KEY`, `INSTANTLY_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, `CRON_SECRET`, `OBATEK_MAILING_ADDRESS`.

---

## 15. Build order

Each week's build feeds that week's outreach (Build Plan). Stage numbers continue from what's done.

| Week | # | Work | Done when |
|---|---|---|---|
| — | 1 ✅ | `002_outreach.sql`; lead fields in form, sheet and importer | A Lusha CSV imports with website/city/vertical filled |
| — | 2 ✅ | Pop-up Gather + When; `outreach_runs` | Run now / Schedule both create runs; New leads listed with warnings |
| 1 | 0 | Phase 0 started (§13) | Warm-up running in Instantly |
| — | S ✅ | Security: `003_team_access.sql`, no-access screen, route guards, callback redirect check, safe links (§16) | Only team members see data |
| 1 | 3 ✅ | `004_sourcing.sql`; `sourcing.ts` + Find leads dialog; `scoring.ts`; score in the Gather step and on lead cards; **Today's calls** with basic briefs and outcome logging | 50+ Ottawa handyman leads in New with scores; call the top 15 by hand |
| 2 | 4 | `audit.ts` (incl. email and owner discovery, SSRF-safe fetch) feeding `signals`; reviews signal; richer briefs | 50 real sites audited; 3 calls a day |
| 3 | 5 | Write step: Claude subject + opener, templates, approval | 20 drafts approved in the pop-up |
| 3 | 6 | Instantly send + move to Contacted; scheduler + stats polling | A test run to your own inboxes sends 3 steps; then about 20 real emails a day |
| 4 | 7 | Hiring-signal feed; Jo case study; audit PDF offer; metrics panel (§12) | Meetings per 100 contacted shown by channel |
| 5+ | 8 | Learning loop + auto mode | Winners appear in the prompt; the toggle unlocks after 14 days + thresholds |
| later | 9 | Generic webhook + CSV adapters; extraction to a service; enterprise features per deal | A real deal asks for it |

**Before the first real send:** send the full sequence to 2–3 of your own addresses (Gmail, Outlook). Confirm inbox placement, the footer, the unsubscribe link, and that a reply stops the sequence.

---

## 16. Security

Each item lists the build stage that must meet it. `/security-review` runs before each stage is committed. ✅ = done.

| # | Risk | Rule | Stage |
|---|---|---|---|
| S1 ✅ | **Open signup + "authenticated" RLS.** Anyone who signs up can read and edit every lead, run and email | `003_team_access.sql`: every policy checks `is_team_member()` (the `team_members` table, edited only in the SQL editor). Non-members see a no-access screen. Also disable public signup in Supabase (Authentication → Sign In / Providers) | now |
| S2 | **SSRF from the site audit.** Lead `website` values come from CSVs and Places, and the server fetches them | Only `http`/`https` on ports 80/443. Resolve DNS and reject loopback, private, link-local and metadata addresses (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`), checking again after every redirect. Max 3 redirects, 10s timeout, 2 MB body cap. Never send cookies or auth headers | 4 |
| S3 | **Prompt injection from scraped pages and replies.** Site text and reply bodies reach Claude | Pass scraped text as quoted data in its own block, stripped of HTML and truncated. The system prompt says to never follow instructions in it. Validate the output: JSON shape, length limits, no URLs or email addresses in the opener/subject. In auto mode, anything that fails validation drops to manual review instead of sending | 5, 6, 8 |
| S4 ✅ | **Cron route abuse.** `/api/outreach/cron/tick` starts runs and sends email | `hasValidCronSecret()` in `src/lib/api/guards.ts`: `Authorization: Bearer $CRON_SECRET`, compared with `crypto.timingSafeEqual`. Fails when `CRON_SECRET` is unset. Return 401 with no detail | helper done; route in 6 |
| S5 | **Service-role key exposure** | `SUPABASE_SERVICE_ROLE_KEY` is imported only by `src/lib/supabase/admin.ts`, which starts with `import 'server-only'`. Never prefix it with `NEXT_PUBLIC_`. The same rule applies to `ANTHROPIC_API_KEY`, `INSTANTLY_API_KEY` and `GOOGLE_PLACES_API_KEY` | 3+ |
| S6 ✅ | **Server routes acting for any caller.** `source`, `prepare` and `send` cost money and send email | Each route calls `requireTeamMember()` first (session + `is_team_member()`), and uses that user's client so RLS still applies. Validate the body with zod. Re-check compliance and `sending_paused` server-side on every send; never trust the client's list | 3–6 |
| S7 ✅ | **Cost runaway** (Places, PageSpeed, Claude) | Sourcing: `places_max_results` per search and `places_daily_lead_cap` new leads per day, checked server-side. Prepare: one lead per call (stage 5) | 3 done; 5 |
| S8 ✅ | **Rendering untrusted text.** Scraped names, reviews and Claude output appear in the CRM | Render as text through React. No `dangerouslySetInnerHTML`. Links go through `externalUrl()` in `src/lib/utils.ts` (http/https only) | 3+ |
| S9 ✅ | **Open redirect in the auth callback.** `next` comes from the query string | `safeNextPath()` in the callback route: `next` must start with `/`, not `//` or `/\` | now |

---

## 17. Open questions (from the Build Plan) and notes

- Small-client bundle price per month
- Score threshold (placeholder: 5)
- Which job boards feed the hiring signal
- Places + Claude cost per qualified lead (§12 logs the call counts)
- Self-hosting from the start or only on request
- Which CRM the first bigger prospect runs
- A blank country currently blocks email (CASL safety). Places leads always have a country, so this mostly affects old imports
- `email_accounts` / `email_logs` are used by the Outlook connect/send code but don't exist in the live database. They need their own migration before the Outlook path works

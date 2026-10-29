# OBATEK Lead Engine — Build Plan

Oct 27, 2026 · @Oluwadamilola

## Overview

The lead engine is a standalone service that finds trades businesses with visible operational pain, scores them, drafts personalized outreach, and hands qualified leads to a CRM. It lives in the same repo as the OBATEK CRM so it can be tested there first, but it never depends on the CRM.

Goals:

- Cut the work per outreach touch so 3 calls a day plus email takes under 30 minutes
- Book more meetings per 100 leads contacted, measured by channel
- Ship as one engine sold two ways: bundled with the OBATEK CRM for small clients, or plugged into a bigger client's existing CRM

The system supports the sales routine; it does not replace it. Each stage runs live while the next one is built.

## ICP and pain signals

Start with small handyman and home-repair businesses (2–10 staff) running jobs out of spreadsheets and texts. Every warm lead so far has come from this segment; larger HVAC and electrical firms often already pay for field-service software and have an office manager screening calls. Expand to bigger clients once this segment converts reliably.

| Signal | Where it comes from | Why it matters |
| --- | --- | --- |
| Hiring an office admin or dispatcher | Job boards | Coordination pain right now |
| Reviews mentioning slow callbacks | Google reviews | Exact pitch for communication tooling |
| No website, dead site, or no online booking | Website audit | Site-plus-AI-receptionist package |
| Owner reachable directly | Website, LinkedIn, Lusha | Shorter path to a decision |
| 2–15 staff | Google profile, LinkedIn | Big enough to pay, small enough to lack software |

## System layers

Five layers run in order; each one is useful on its own before the next exists.

1. **Sourcing.** Pull businesses by vertical and city from the Google Places API. Add a hiring-signal feed from job boards. Lusha fills contact gaps only.
2. **Enrichment and scoring.** Run an automatic website audit: PageSpeed score, mobile-friendly, SSL, online booking, contact form. Find the owner's name from the About page or LinkedIn. Score with readable points, for example:
   - Pain signal +3
   - 2–15 staff +2
   - Owner reachable directly +2
   - Handyman or home-repair vertical +1
   - Only leads above the threshold enter outreach
3. **Personalization.** Claude drafts one specific opening line from the audit and reviews. The rest of the template stays short and fixed so it can be tested.
4. **Sequencing.** A qualified lead creates:
   - An email sequence from getobatek.com through Instantly
   - A call task with a one-screen brief: owner name, the pain signal, one question to ask
   - A LinkedIn message to copy and paste manually
5. **Inbound and referral.**
   - Jo case study: before and after, hours saved, a quote
   - Free ops audit as the call to action, delivered as a one-page PDF from the same audit data
   - Referral bonus for existing clients
   - Supply houses and trade associations as partner channels

## Architecture

**Now (small-client bundle):** the engine is TypeScript in the CRM repo, under `src/lib/outreach/`.
- A lint rule in `eslint.config.mjs` keeps it separable: the engine core can't import CRM UI, React, Next or Supabase.
- All database access goes through one adapter, `src/lib/outreach/adapters/obatek-crm.ts`, with `pushLead()`, `updateStatus()` and `fetchExistingContacts()`.
- Implementation details are in `OUTREACH_PLAN.md`.

**At the first bigger-client deal:** extract it into the standalone service below. The core is already plain functions behind the adapter, so this is a port, not a redesign.

The target shape: the CRM is a client of the lead engine, never its host. The engine talks to every CRM, including OBATEK's, over the same HTTP contract.

```
obatek/
├── apps/
│   └── crm/                    # existing CRM, now one consumer of the engine
├── packages/
│   └── lead-engine/
│       ├── core/               # sourcing, audit, scoring, drafting: pure Python
│       ├── api/                # FastAPI: REST + outgoing webhooks
│       ├── store/              # its own Postgres schema + migrations
│       ├── adapters/           # obatek_crm, webhook, csv
│       ├── openapi.yaml        # the contract
│       └── docker-compose.yml  # runs standalone, no CRM needed
└── .github/workflows/
```

Boundary rules:

1. **HTTP, not a library.** Ship the engine as a Docker container plus `openapi.yaml`. That makes it usable from any stack.
2. **The engine owns its data.** Leads, audits, scores and sequence state live in its own schema. Hosts receive events by webhook: `lead.qualified`, `lead.replied`, `meeting.booked`.
3. **Adapters behind one interface:** `push_lead()`, `update_status()`, `fetch_existing_contacts()` for dedupe. Build OBATEK CRM, generic webhook and CSV first. Build a HubSpot, Salesforce or Dynamics adapter only when a real deal needs it.
4. **CI enforces the boundary.** Fail the build if anything in `packages/lead-engine` imports from `apps/crm` (import-linter rule or a short grep step).
5. **Multi-tenant once extracted.** The in-repo version is single-tenant, with per-tenant config in `outreach_settings`. At extraction, `tenant_id` goes on every table. Per tenant: API key, sending domain and credentials, Places/Claude API keys or metered usage, scoring weights and ICP config.

Testing:

- `docker compose up` in `lead-engine` alone, then hit the API directly
- Run the CRM against it locally as the first real integration
- Contract tests generated from `openapi.yaml`, so a breaking API change fails the build before it reaches a client

## Delivery modes

One codebase, two tiers, separated by config and feature flags rather than forks.

|  | Small-client bundle | Bigger-client engine |
| --- | --- | --- |
| What ships | Engine + OBATEK CRM, one login | Engine only, plugged into their CRM |
| Hosting | Multi-tenant on OBATEK infrastructure | OBATEK-hosted or self-hosted Docker in their cloud |
| Configuration | Opinionated defaults: trades ICP, scoring, templates | Their own ICP, scoring, sequences |
| Integration | Built in | Adapter for their CRM, or generic webhook to start |
| Pricing | Flat monthly fee | Contract, priced per deal |
| Sales cycle | Short | 2–4 months: stakeholders, procurement, security review |

Bigger clients will ask for these. Prepare the answers, but build each one only when a deal requires it:

- Security questionnaire answers: data region (Canada/US), encryption, who has access
- SSO
- Audit log of who sent what to whom
- Role-based access: reps see their own leads, managers see all
- Rate limits and usage reporting per user or team

Keep the small-client bundle selling while bigger deals move; it covers cash flow during the longer cycles.

## Compliance and sending safety

Automation multiplies mistakes as well as reach, so sending gets guardrails before volume.

- **Canada (CASL):** stricter than US rules. Keep sender identification and a working unsubscribe in every email, and record the basis for contacting each lead. Confirm the details with a lawyer before scaling Canadian sends.
- **US (CAN-SPAM):** physical address, honest subject lines, working unsubscribe.
- **LinkedIn:** keep it manual copy-and-paste. Automated sending risks account restrictions.
- **Domain:** send only from getobatek.com, never the main .net domain. Set up SPF, DKIM and DMARC, and warm the domain before volume.
- **Approval gate:** approve each email yourself for the first 2–3 weeks, then switch to fully automatic once the drafts are consistently good.
- **Audit log:** record every send per tenant. It covers compliance and is an enterprise requirement anyway.

## Build order

Ship the small-client bundle path first because it can be sold now; enterprise work waits for a real deal.

&#91;embedded content: build roadmap · 4 weekly phases, then the bigger-client path\]

Each week's build feeds that same week's outreach, so the system is tested on real prospects as it grows.

- [x] Done: lead fields (website, city, vertical, staff size, email source) in the form and the Lusha importer; Run outreach pop-up with gather, CASL/suppression checks, and run now or schedule
- [x] Security: team-only data access, guarded server routes
- [x] Week 1 build: Places API pull ("Find leads"), scoring rules, "Today's calls" list with briefs and outcome logging
- [ ] Week 1 outreach: call the top 15 by hand. **Start getobatek.com warm-up now**, so Week 3 can send
- [x] Week 2 build: website audit ("Check sites"), review scan, call briefs with site findings
- [ ] Week 2 outreach: 3 calls a day
- [x] Week 3 build, part 1: Claude-drafted openers on a fixed template, with an approval gate in the Run outreach pop-up
- [x] Week 3 build, part 2: Instantly sending (approved emails → campaign, lead → Contacted)
- [ ] Week 3 build, part 3: scheduler + reply/open tracking, then about 20 emails a day
- [ ] Week 4: hiring-signal feed, Jo case study, audit PDF offer, meetings-per-100 metric
- [ ] Then: learning loop + auto mode (after 2–3 weeks of approved sends), generic webhook adapter, first enterprise CRM adapter, enterprise features per deal

Stage-by-stage detail: `OUTREACH_PLAN.md` §15.

## Metrics and open questions

The one number to track from day one is meetings booked per 100 leads contacted, split by channel. It shows whether the problem is the list, the message, or the follow-through.

Supporting metrics:

- Leads sourced and leads qualified per week
- Email reply rate and bounce rate per sending domain
- Calls made per day and connect rate
- Meetings to closed deals, by tier

Open questions:

- [ ] Small-client bundle price per month
- [ ] Score threshold for entering outreach
- [ ] Which job boards feed the hiring signal
- [ ] Places API and Claude API cost per qualified lead
- [ ] Whether self-hosting is offered from the start or only on request
- [ ] Which CRM the first bigger prospect runs

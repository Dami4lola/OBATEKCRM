# Shared model: one CRM, many clients

Nov 16, 2026 · Design for turning the OBATEK CRM into a product many clients share. Read with `OUTREACH_PLAN.md` (how the app works today) and the Build Plan (why).

## 1. Goal

One deployment on Railway serves many clients. Each client:
- sees only its own rows: leads, pipeline, meetings, outreach, settings, mailbox
- sees only the pages and features its plan and its own switches allow, decided from the signed-in user
- has its own customizations (templates, writing rules, sender, company, offer, prompts' persona, branding, verticals, scoring, send window, mailbox) that no other client can see or inherit
- is created by OBATEK and joins by invite now; self-serve sign-up behind payment comes later
- uses OBATEK's API keys on higher plans (with caps) and its own keys on lower plans

**Not in scope now:** self-serve billing (only its hook point is designed, §11), a user belonging to more than one client, and separate code builds per client (§9).

**Ground rules:** every stage is built and tested on a copy of the database (§12), never the live one. Each stage ships without changing how the app behaves for OBATEK.

## 2. Words used here

| Word | Meaning |
|---|---|
| Client | A company using the CRM. OBATEK is client #1. |
| Member | A user who belongs to one client, as `owner` (can invite and change settings) or `member`. |
| Platform admin | OBATEK staff who can create clients and, for support, act as one client at a time. |
| Plan | A paid tier: which features it includes, its daily caps, and whether it uses OBATEK's API keys. |
| Feature flag | A switch that shows or hides a page or capability for a client. |
| Client context | Everything one request or tick needs about one client: its settings, keys, mailbox, persona and branding. |

## 3. Where things stand today

Everything assumes one team:
- **Access:** every table's rule is "any team member can do anything" (`is_team_member()`, `supabase/migrations/003_team_access.sql`). `team_members` has no team or client column.
- **Settings:** `outreach_settings` is one global key/value list (`key` is the primary key), about 50 keys, changed by SQL.
- **Mailbox:** `outreach_mailbox` can hold exactly one row (its primary key is a boolean that must be true). The access-token cache in `src/lib/email/mailbox.ts` is one variable for the whole server.
- **The scheduler's tick** (`src/app/api/outreach/cron/tick/route.ts`) uses the admin key, which skips the access rules, and every query in `src/lib/outreach/adapters/obatek-crm.ts` is unfiltered.
- **One pipeline:** `pipeline-board.tsx` hard-codes the pipeline id; `findStageByName` looks across all pipelines.
- **Unique rules that would clash between clients:** Google place id and `source_ref` on leads, suppressed email and domain, dismissed place id, job-post ids, activity external ids.
- **OBATEK text in code:** Claude prompts (`prompts/copy-system.ts`, `reply-classifier.ts`, `signal-fit.ts`), the email footer (`mail-message.ts`), default templates and sender, `OWN_DOMAINS` (`compliance.ts`), "Obatek CRM" on pages, `OBATEK_MAILING_ADDRESS`, the `getobatek.com` sending domain.
- **API keys** come from environment variables, one set for everyone.

## 4. Tables

New:

| Table | Columns | Notes |
|---|---|---|
| `clients` | id, name, slug, status (`active`/`paused`), plan_id, feature_overrides JSONB, branding JSONB (`name`, `logo_url`), mailing_address, last_ticked_at, stripe_customer_id (later), created_at | One row per client |
| `plans` | id, name, features JSONB, caps JSONB, uses_platform_keys BOOL, tick_budget_seconds INT | OBATEK's own client is on `founder` (all features, platform keys) |
| `client_members` | user_id (PK), client_id, role (`owner`/`member`), created_at | Replaces `team_members`. One client per user for now |
| `platform_admins` | user_id (PK), acting_client_id (nullable) | OBATEK staff; `acting_client_id` is the client they're currently looking at |
| `client_invites` | id, client_id, email, role, token_hash, expires_at, accepted_at, invited_by | The token is random; only its SHA-256 is stored; 7-day expiry |
| `client_api_keys` | client_id, provider, secret_enc, updated_at; PK (client_id, provider) | Lower plans' own keys, encrypted |

Changed:
- **Every data table** gets `client_id UUID NOT NULL`: pipelines, stages, leads, activities, tasks, meetings, outreach_runs, outreach_emails, outreach_messages, suppression_list, dismissed_leads, copy_feedback, lead_signals, google_calls. (`profiles` is per user, not per client.)
- **`outreach_settings`:** primary key becomes `(client_id, key)`.
- **`outreach_mailbox`:** primary key becomes `client_id`, one mailbox per client.
- **Unique rules** include `client_id`: `(client_id, google_place_id)`, `(client_id, source_ref)`, `(client_id, lower(email))`, `(client_id, domain)`, `(client_id, place_id)`, `(client_id, source, external_id)`, `(client_id, external_id)`.

## 5. "Who am I": the signed-in user decides the client

`current_client_id()` is a database function: for a platform admin with `acting_client_id` set it returns that; otherwise it returns the caller's `client_members.client_id`; otherwise nothing.

**Decision: a lookup function, not a value stored in the login token.** A value in the token only updates when the token refreshes (up to an hour), so removing someone from a client, or an admin switching client, would lag. A removal that lags is a window where a removed person still sees data. With one client per user, the lookup is a single primary-key read, and written as `(SELECT current_client_id())` in the rules, Postgres runs it once per query, not once per row.

**Safety net:** `client_id` defaults to `current_client_id()` and can't be empty. Pages that insert rows need no change; the client is filled in for them. The scheduler uses the admin key, where the function returns nothing, so any insert the code forgot to scope fails loudly instead of creating a row that belongs to no one.

## 6. Access rules

- Every table's rule becomes `client_id = (SELECT current_client_id())` for reading and writing (written with the same DO-block pattern as migration 003).
- `profiles`: you can read yourself and members of your own client.
- `client_members`: readable within your client; changed only through invite functions.
- `platform_admins`: you can read only your own row.
- `outreach_mailbox` and `client_api_keys`: no direct access at all; only through their functions, as the mailbox already works.
- `is_team_member()` is kept as `current_client_id() IS NOT NULL`, so `requireTeamMember()` in `src/lib/api/guards.ts` and the dashboard's "No access" screen keep working during the move. `guards.ts` also returns the `clientId`.

## 7. The scheduler and the admin key

The tick can't rely on the access rules, because the admin key skips them. Three things keep it inside one client:
1. **One client per request.** The scheduler calls the tick route once per client with `{ clientId }`. Nothing about two clients is ever in memory together, so a mistake can't mix them.
2. **Every adapter function takes the `clientId`** and filters or sets it. A check script (`scripts/check-client-scope.mjs`, run with `npm run lint`) fails if any `.from('<data table>')` in the adapter has no `client_id` filter.
3. **The insert safety net** from §5.

Later hardening: composite foreign keys (`(lead_id, client_id)` → `leads(id, client_id)`) on activities, outreach emails and job posts, so even a mis-scoped write can't link two clients' rows.

## 8. Per-client customization

Built once per request or tick: `ClientContext = { clientId, client, plan, features, settings, persona, keys, mailingAddress, sendingDomain, ownDomains, branding }` (`src/lib/platform/client-context.ts`).

| What | Today | Shared model |
|---|---|---|
| Templates, writing rules, scoring, verticals, send window, caps, seed addresses | Global settings and `copy_feedback` | Per-client settings rows and `copy_feedback` rows |
| Sender name, company, city, offer | `sender_name` / `offer_description` settings, plus OBATEK text in prompts | Settings `sender_name`, `company_name`, `company_city`, `offer_description`, `copy_persona_notes` |
| Claude prompts | Text naming OBATEK, Ottawa, Dami | Functions of the persona: `copySystemPrompt(persona)`, `replyClassifierPrompt(persona)`, `signalFitPrompt(persona)` |
| Email footer | `· OBATEK` and `OBATEK_MAILING_ADDRESS` | `persona.companyName` and `clients.mailing_address` |
| Test inboxes skipped by CASL | `OWN_DOMAINS` constant | Setting `own_domains` |
| Default templates | OBATEK wording | Neutral wording with `{{company_name}}` and `{{company_city}}` |
| Branding | "Obatek CRM" strings | `clients.branding` |
| Sending domain | Setting, default `getobatek.com` | Per-client setting, no OBATEK default |

**Rules:**
- Code defaults become neutral. OBATEK's own values are saved as data on client #1 by the migration, so OBATEK's drafts, footers and pages come out exactly as today.
- A blank field never falls back to another client's text.
- Settings get a page (sender, company, offer, send window, verticals, templates, keys), so clients never need SQL. Owners can edit; members can read.

## 9. "Exclusive to their own build"

In one shared deployment, a client's customizations are its data and its switches, so nothing a client sets is visible to, or inherited by, any other. That covers everything in §8.

If a client wants **a feature built only for them**, it's built once in the shared code behind a feature flag that only that client has switched on (`clients.feature_overrides`). Other clients never see it: the page, the menu item and its server routes all check the flag (§10).

If a client needs **code that differs from everyone else's**, or must run apart (its own database, its own cloud), it gets its own deployment instead: a separate Railway project, or the Docker image in its own cloud. That's the per-client-copy option, kept for those cases rather than the default.

## 10. Plans, keys and views

**Plans** set `features` (which pages and capabilities), `caps` (daily drafts, site checks, searches, sends) and `uses_platform_keys`.

**Keys:** `keysFor(ctx)` in `src/lib/platform/keys.ts` is the only place keys are read:
- On a plan with `uses_platform_keys`: OBATEK's keys from Railway's variables, limited by the plan's caps.
- Otherwise: the client's own keys from `client_api_keys`, decrypted with the existing AES-GCM helper (`src/lib/email/token-crypto.ts`, generalized to `encryptSecret` and `decryptSecret`). A missing key shows "Add your key" in Settings, and the tick skips that step for that client.

Every route that reads `process.env.*_API_KEY` today (audit, prepare, signals pull, software search, source, stats sync, licenses import, tick) switches to `keysFor`.

**Views:** `features = { ...plan.features, ...client.feature_overrides }`. The dashboard layout filters the menu and passes it to `Sidebar` and `MobileNav` (they already accept an `items` list). Every gated page and route also checks on the server (`requireFeature`) and returns 404: hiding a link isn't protection on its own.

## 11. Onboarding

**Now: OBATEK creates, then invites.**
1. A platform admin opens `/admin`, creates a client (name, plan) with `create_client()`. That function creates the client, its pipeline and stages, default settings and templates.
2. The admin invites the owner's email. The invite link is `/invite/<token>`.
3. The invitee signs up (the signup page keeps the link and fills in the email) or logs in. `accept_invite(token)` checks the token, its expiry and that the email matches, then adds them to the client.
4. The owner invites their own team the same way.

Anyone can still create an account on the site, but without an invite they see "No access", as today.

**Later: self-serve behind payment.** Stripe Checkout succeeds → a webhook calls the same `create_client()` → the payer gets the owner invite. No client exists until payment clears. Because `create_client()` is the only way a client is created, this is a small addition.

## 12. Testing on a copy of the database

- **Staging database:** a new Supabase project `obatek-crm-staging`. Copy the live database's tables and data with `pg_dump` (`--schema=public --no-owner --no-privileges --clean --if-exists`) and load it with `psql`. Copy sign-in accounts (`auth.users`, `auth.identities`, data only), or create test users by hand.
- **Make it harmless before anything runs:** delete the `outreach_mailbox` row, set `sending_paused` to true, and leave the TheirStack key unset. Staging can then never send email or spend signal credits.
- **Staging app:** a Railway environment `staging` that deploys from a `staging` branch, with the three Supabase variables pointing at the staging project and no custom domain. Its scheduler points at the staging app.
- Supabase's built-in branching was considered and not used: it needs the Supabase CLI, the Pro plan and a different migration file format.

## 13. Migration `024_clients.sql`

Safe to run more than once, like the others, and run in one transaction. Steps:
1. Create the new tables (§4) and `current_client_id()`.
2. Insert the OBATEK client with a fixed id, and a `founder` plan (all features, platform keys).
3. Add `client_id NOT NULL DEFAULT '<OBATEK id>'` to every data table, which fills every existing row with OBATEK. Then change the default to `current_client_id()`, and index `client_id`.
4. Re-key `outreach_settings` to `(client_id, key)` and move the mailbox row into the per-client table. Save OBATEK's persona, footer company, `own_domains` and mailing address as data.
5. Copy `team_members` into `client_members`, keeping roles. Keep `team_members` as a read-only view for one release, so an older build still works for the minutes around the switch.
6. Rebuild the unique rules with `client_id`. If one can't be built (a hidden duplicate), stop and report.
7. Rewrite every access rule, recreate the six mailbox functions with client scoping, and refresh the API's schema cache.

Before running it on live: run it on staging until it runs cleanly twice, then take a Supabase backup.

## 14. Build stages

Each stage is planned, built and tested on staging before it goes live.

| Stage | What | Main files | Done when |
|---|---|---|---|
| **A** | Tables and access rules, with OBATEK as the only client and no change in behaviour | `024_clients.sql`; `src/types/database.ts`; the adapter (every function takes `clientId`); the tick route; `mailbox.ts` (token cache per client); `guards.ts`; `pipeline-board.tsx` (no hard-coded pipeline); `scripts/check-client-scope.mjs` | On staging, every page and the tick work as before. A second test client's user sees no rows on any table and can't read OBATEK's mailbox status. The scope check passes. |
| **B** | Per-client customization (§8) and a mailbox per client | `src/lib/platform/client-context.ts`; prompt files, `mail-message.ts`, `compliance.ts`, `default-templates.ts`, `settings.ts`, `safe-fetch.ts`; branding strings; Settings page cards; mailbox functions; the Entra app becomes multi-tenant | OBATEK's drafts and footer are identical to before (compared on staging). A second client gets its own text and connects a mailbox in another Microsoft 365 tenant. |
| **C** | The tick loops over clients (§15) | `scripts/outreach-scheduler.mjs`; new `cron/clients` route; tick route (client id, budget, deadline checks) | Two clients on staging are each ticked in turn. A client forced over its budget is cut off and the other still runs. With one client, a tick takes as long as today. |
| **D** | Admin area and invites (§11) | `025_invites_admin.sql`; `src/app/(admin)/admin/...`; `src/app/invite/[token]/page.tsx`; signup page; middleware | An admin creates a client and invites an email. A new browser signs up through the link into the new, empty client. An expired link is refused. A non-admin gets 404 on `/admin`. |
| **E** | Plans, keys and feature flags (§10) | `026_plans_keys.sql`; `src/lib/platform/keys.ts`, `features.ts`; every route reading an API key; dashboard layout; "API keys" settings card; plan picker in admin | A lower-plan client without a key sees "Add your key" and the tick skips drafting for them. A switched-off feature has no menu item and its page returns 404. OBATEK is unaffected. |
| **F** (later) | Self-serve sign-up with Stripe | billing webhook → `create_client()`; `clients.stripe_customer_id` | A test-mode payment creates a client and sends the owner invite. |

## 15. The tick with many clients

- The Railway cron run (`--once`) asks the app for active clients, oldest `last_ticked_at` first, then calls the tick route for each, one after another, with `{ clientId, budgetSeconds }` (from the plan, default 90 seconds). It stops starting new clients after 4 minutes 30 seconds in total.
- The route stamps `last_ticked_at` first, so a client that doesn't finish goes to the back of the line next time: every client gets a turn.
- **The route checks its own deadline between its steps** (start runs, signals, drafts, inbox, send) and skips what's left when over budget. The scheduler's timeout is only a backstop: when it gives up on a request, the server keeps working, so the route must stop itself.
- Each client's daily caps count only that client's activity.
- When there are too many clients for one 5-minute run, the scheduler can send two requests at a time. That's a small change to the script.

## 16. Risks

| Risk | How it's handled |
|---|---|
| A client sees another client's data in the app | Access rule on every table; new tables start locked; the "second client sees nothing" test repeats at every stage |
| The scheduler's admin key skips the rules | One client per request, `clientId` on every adapter call, the lint check, inserts fail without a client |
| The migration damages live data | Rehearsed on staging; backup first; one transaction; the app behaves the same afterwards; `team_members` kept for one release |
| The mailbox token cache hands one client's login to another | Cache keyed by client, fixed in stage A before a second client exists |
| Other clients' Microsoft mailboxes can't connect | Entra app becomes multi-tenant in stage B; a tenant admin may have to approve, so Settings shows Microsoft's error and an "ask your admin" hint |
| OBATEK's wording appears in another client's emails | Neutral code defaults; OBATEK's text is data on OBATEK's client only |
| Staging sends real email or spends credits | Mailbox removed, sending paused, no TheirStack key on staging |

## 17. Open questions

- Can one person ever belong to two clients (for example an agency managing several)? The design allows adding it later by dropping "one client per user" and adding a client switcher.
- Where do client logos live: a Supabase storage bucket, or a URL the client pastes?
- Plan names, prices and caps per tier.
- Which features each plan includes, and which pages are switchable.
- Railway cost as clients grow, and when ticks need to run in parallel.

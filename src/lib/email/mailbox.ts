import 'server-only'
import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { checkTokenKey, decryptToken, encryptToken } from './token-crypto'

// The sending mailbox's Microsoft login (OUTREACH_PLAN.md §11, §16 S10–S11).
// Delegated access to the one mailbox that signed in. The refresh token is
// stored encrypted through the outreach_mailbox functions (014); access
// tokens live only in this process's memory and are never logged or
// returned to the browser.

type Crm = SupabaseClient<Database>

// Mail.ReadWrite: drafts, threaded replies and reading the inbox
export const MAILBOX_SCOPES = ['openid', 'offline_access', 'User.Read', 'Mail.Send', 'Mail.ReadWrite']

const TIMEOUT_MS = 15_000

// Access token cache (this process only)
let cached: { address: string; accessToken: string; expiresAt: number } | null = null
let refreshing: Promise<{ accessToken: string; expiresAt: number }> | null = null

export class MailboxError extends Error {
  constructor(
    message: string,
    // The saved login no longer works: the mailbox must be reconnected
    readonly needsReconnect = false
  ) {
    super(message)
  }
}

function azureConfig() {
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  // Single-tenant app: only accounts in your Microsoft 365 organisation
  const tenantId = process.env.AZURE_TENANT_ID
  if (!clientId || !clientSecret || !tenantId) {
    throw new MailboxError('AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID must be set in .env.local')
  }
  return { clientId, clientSecret, tenantId }
}

export function mailboxRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${appUrl.replace(/\/$/, '')}/api/outreach/mailbox/callback`
}

// ---------- connecting ----------

// Holds state.verifier between the connect route and the callback
export const MAILBOX_OAUTH_COOKIE = 'obatek_mailbox_oauth'

export interface MailboxAuthRequest {
  url: string
  state: string
  verifier: string
}

// Random state (CSRF) and a PKCE verifier, kept by the caller in an
// httpOnly cookie until the callback
export function newMailboxAuthRequest(): MailboxAuthRequest {
  const { clientId, tenantId } = azureConfig()
  // Fail before the sign-in, not after it
  try {
    checkTokenKey()
  } catch (error) {
    throw new MailboxError(error instanceof Error ? error.message : 'MAIL_TOKEN_KEY is not set')
  }
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: mailboxRedirectUri(),
    response_mode: 'query',
    scope: MAILBOX_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`
  return { url, state, verifier }
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

class TokenEndpointError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message)
  }
}

// Straight to the token endpoint, not MSAL: MSAL keeps the refresh token
// to itself, which is how the old Outlook code ended up saving ''
async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret, tenantId } = azureConfig()
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: MAILBOX_SCOPES.join(' '),
      ...params,
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data?.access_token !== 'string') {
    const code = typeof data?.error === 'string' ? data.error : null
    // First line only: Microsoft appends trace and correlation ids
    const detail = typeof data?.error_description === 'string' ? data.error_description.split(/\r?\n/)[0] : `HTTP ${response.status}`
    throw new TokenEndpointError(`Microsoft login: ${detail}`, code)
  }
  return data as TokenResponse
}

export async function exchangeMailboxCode(
  code: string,
  verifier: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: mailboxRedirectUri(),
    code_verifier: verifier,
  })
  if (!tokens.refresh_token) {
    throw new MailboxError('Microsoft returned no refresh token. Check the app has the offline_access permission.')
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
}

export async function saveConnectedMailbox(crm: Crm, address: string, refreshToken: string): Promise<void> {
  const { error } = await crm.rpc('connect_outreach_mailbox', {
    p_address: address,
    p_refresh_token_enc: encryptToken(refreshToken),
  })
  if (error) throw error
  cached = null
}

// ---------- using it ----------

export interface MailboxAccess {
  address: string
  accessToken: string
  // Inbox sync watermark
  inboxCheckedAt: string | null
}

async function refreshAccessToken(crm: Crm, refreshTokenEnc: string) {
  const refreshToken = decryptToken(refreshTokenEnc)
  let tokens: TokenResponse
  try {
    tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
  } catch (error) {
    if (error instanceof TokenEndpointError && error.code === 'invalid_grant') {
      await crm.rpc('update_outreach_mailbox', { p_status: 'needs_reconnect' })
      throw new MailboxError(
        'Microsoft rejected the saved mailbox login (expired, revoked or the password changed). Reconnect the mailbox in Settings.',
        true
      )
    }
    throw error
  }
  // Microsoft rotates refresh tokens; keep the newest
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    const { error } = await crm.rpc('update_outreach_mailbox', { p_refresh_token_enc: encryptToken(tokens.refresh_token) })
    if (error) throw error
  }
  return { accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
}

// An access token for the connected mailbox, refreshed when it's within
// 2 minutes of expiring. Works with the user's client (team member) and
// the scheduler's service-role client.
export async function getMailboxAccess(crm: Crm): Promise<MailboxAccess> {
  const { data, error } = await crm.rpc('get_outreach_mailbox_secret')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new MailboxError('No sending mailbox is connected. Connect it in Settings.')
  if (row.status === 'needs_reconnect') {
    throw new MailboxError('The sending mailbox needs reconnecting in Settings.', true)
  }

  if (!cached || cached.address !== row.address || cached.expiresAt < Date.now() + 120_000) {
    // One refresh at a time: the tick and the pop-up can ask together
    refreshing ??= refreshAccessToken(crm, row.refresh_token_enc).finally(() => {
      refreshing = null
    })
    const fresh = await refreshing
    cached = { address: row.address, ...fresh }
  }
  return { address: row.address, accessToken: cached.accessToken, inboxCheckedAt: row.inbox_checked_at }
}

export function forgetMailboxAccess(): void {
  cached = null
}

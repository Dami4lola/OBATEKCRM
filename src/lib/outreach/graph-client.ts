// Everything Microsoft Graph-specific lives here (OUTREACH_PLAN.md §11).
// The caller passes a delegated access token for the connected mailbox;
// this file never sees the refresh token or the database.
// API: https://learn.microsoft.com/en-us/graph/api/resources/message

const GRAPH_API = 'https://graph.microsoft.com/v1.0'
const TIMEOUT_MS = 20_000
// Ids that don't change when a draft moves to Sent Items, and plain-text
// bodies when reading replies
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"'
// Kept per received message; plenty for a reply or a bounce notice
const MAX_BODY_CHARS = 4000

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    // The mailbox or the whole account can't send: stop the batch, keep the queue
    readonly accountWide: boolean
  ) {
    super(message)
  }
}

// Microsoft has stopped this mailbox sending (outbound spam protection)
const BLOCKED_CODES = new Set(['ErrorMessageSubmissionBlocked', 'ErrorQuotaExceeded', 'ErrorSendAsDenied'])

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Microsoft rejected the mailbox login. Reconnect the mailbox in Settings.',
  403: 'The mailbox is missing a permission (Mail.Send, Mail.ReadWrite). Check the app registration, then reconnect in Settings.',
  429: 'Microsoft is throttling the mailbox. The rest wait for the next tick.',
}

async function graphRequest<T>(
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  pathOrUrl: string,
  body?: unknown
): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH_API}${pathOrUrl}`
  // nextLink pages come back from Graph; never follow one anywhere else
  if (!url.startsWith(`${GRAPH_API}/`)) throw new GraphError('Unexpected Graph URL', 0, null, true)

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: PREFER,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 202 || response.status === 204) return undefined as T

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code: string | null = typeof data?.error?.code === 'string' ? data.error.code : null
    const detail = typeof data?.error?.message === 'string' ? data.error.message : `HTTP ${response.status}`
    const blocked = code !== null && BLOCKED_CODES.has(code)
    const message = blocked
      ? `Microsoft blocked sending from this mailbox (${code}). Sending is paused; check the Microsoft 365 admin centre (Restricted entities).`
      : (STATUS_MESSAGES[response.status] ?? `Microsoft Graph: ${detail}`)
    const accountWide = blocked || [401, 403, 429, 503].includes(response.status)
    throw new GraphError(message, response.status, code, accountWide)
  }
  return data as T
}

export function isSenderBlocked(error: unknown): boolean {
  return error instanceof GraphError && error.code !== null && BLOCKED_CODES.has(error.code)
}

// ---------- the mailbox ----------

export async function getMailboxAddress(token: string): Promise<string> {
  const me = await graphRequest<{ mail?: string | null; userPrincipalName?: string | null }>(
    token,
    'GET',
    '/me?$select=mail,userPrincipalName'
  )
  const address = (me.mail || me.userPrincipalName || '').trim().toLowerCase()
  if (!address.includes('@')) throw new GraphError('Microsoft returned no email address for this account', 0, null, true)
  return address
}

// ---------- sending ----------

export interface SentMessage {
  id: string
  conversationId: string | null
  internetMessageId: string | null
}

interface GraphMessage {
  id: string
  conversationId?: string | null
  internetMessageId?: string | null
}

function recipients(address: string) {
  return [{ emailAddress: { address } }]
}

function sent(message: GraphMessage): SentMessage {
  return {
    id: message.id,
    conversationId: message.conversationId ?? null,
    internetMessageId: message.internetMessageId ?? null,
  }
}

// Draft, then send: /me/sendMail returns no ids, and follow-ups and reply
// matching need them. Plain text only: no links, no tracking.
export async function sendNewMessage(
  token: string,
  message: { to: string; subject: string; text: string }
): Promise<SentMessage> {
  const draft = await graphRequest<GraphMessage>(token, 'POST', '/me/messages', {
    subject: message.subject,
    body: { contentType: 'Text', content: message.text },
    toRecipients: recipients(message.to),
  })
  await graphRequest<void>(token, 'POST', `/me/messages/${encodeURIComponent(draft.id)}/send`)
  return sent(draft)
}

// A follow-up in the same thread. The original sits in our Sent Items, so
// a plain reply would go to ourselves: the recipient is set explicitly.
export async function sendReply(
  token: string,
  originalId: string,
  message: { to: string; text: string }
): Promise<SentMessage> {
  const draft = await graphRequest<GraphMessage>(
    token,
    'POST',
    `/me/messages/${encodeURIComponent(originalId)}/createReply`,
    {}
  )
  await graphRequest<GraphMessage>(token, 'PATCH', `/me/messages/${encodeURIComponent(draft.id)}`, {
    body: { contentType: 'Text', content: message.text },
    toRecipients: recipients(message.to),
    ccRecipients: [],
  })
  await graphRequest<void>(token, 'POST', `/me/messages/${encodeURIComponent(draft.id)}/send`)
  return sent(draft)
}

// ---------- reading the inbox ----------

export interface ReceivedMessage {
  id: string
  conversationId: string | null
  from: string | null
  subject: string
  receivedAt: string
  text: string
  headers: Record<string, string>
}

interface GraphReceived {
  id: string
  conversationId?: string | null
  isDraft?: boolean
  subject?: string | null
  receivedDateTime?: string
  from?: { emailAddress?: { address?: string | null } } | null
  body?: { content?: string | null } | null
  internetMessageHeaders?: { name: string; value: string }[] | null
}

interface GraphPage {
  value?: GraphReceived[]
  '@odata.nextLink'?: string
}

const MAX_PAGES = 10

// Every folder, Junk included (a reply filtered to Junk still counts),
// oldest first. Drafts are skipped here, our own sent mail by the caller.
// more = true: stopped at the page limit; read the rest next time.
export async function listMessagesSince(
  token: string,
  since: Date
): Promise<{ messages: ReceivedMessage[]; more: boolean }> {
  // %20, not URLSearchParams' "+", for spaces in the OData query
  const query = Object.entries({
    $filter: `receivedDateTime ge ${since.toISOString()}`,
    $orderby: 'receivedDateTime asc',
    $select: 'id,conversationId,isDraft,subject,receivedDateTime,from,body,internetMessageHeaders',
    $top: '50',
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  const messages: ReceivedMessage[] = []
  let url: string | undefined = `/me/messages?${query}`

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const data: GraphPage = await graphRequest<GraphPage>(token, 'GET', url)
    for (const item of data.value ?? []) {
      if (item.isDraft) continue
      const headers: Record<string, string> = {}
      for (const header of item.internetMessageHeaders ?? []) headers[header.name.toLowerCase()] = header.value
      messages.push({
        id: item.id,
        conversationId: item.conversationId ?? null,
        from: item.from?.emailAddress?.address?.trim().toLowerCase() || null,
        subject: item.subject ?? '',
        receivedAt: item.receivedDateTime ?? new Date().toISOString(),
        text: (item.body?.content ?? '').slice(0, MAX_BODY_CHARS),
        headers,
      })
    }
    url = data['@odata.nextLink']
  }
  return { messages, more: !!url }
}

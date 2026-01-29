import { ConfidentialClientApplication } from '@azure/msal-node'

const SCOPES = ['User.Read', 'Mail.Send']

function getMsalConfig() {
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const tenantId = process.env.AZURE_TENANT_ID || 'common'

  if (!clientId || !clientSecret) {
    throw new Error('Missing Azure OAuth credentials. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET.')
  }

  return {
    clientId,
    clientSecret,
    tenantId,
  }
}

export function getMsalClient() {
  const { clientId, clientSecret, tenantId } = getMsalConfig()

  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })
}

export function getOutlookAuthUrl(state: string): string {
  const { clientId, tenantId } = getMsalConfig()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/oauth/outlook/callback`
  const scopes = [...SCOPES, 'offline_access'].join(' ')

  return (
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}`
  )
}

export async function getOutlookTokens(code: string) {
  const client = getMsalClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const result = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: `${appUrl}/api/oauth/outlook/callback`,
  })

  return {
    accessToken: result.accessToken,
    expiresOn: result.expiresOn,
    account: result.account,
  }
}

export async function getOutlookUserEmail(accessToken: string): Promise<string> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error('Failed to get user info from Microsoft Graph')
  }

  const data = await response.json()
  return data.mail || data.userPrincipalName
}

export async function refreshOutlookToken(refreshToken: string) {
  const client = getMsalClient()

  // MSAL-node handles refresh tokens differently - we need to use silent token acquisition
  // For now, we'll use the refresh token directly with the token endpoint
  const { clientId, clientSecret, tenantId } = getMsalConfig()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: [...SCOPES, 'offline_access'].join(' '),
  })

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }
  )

  if (!response.ok) {
    throw new Error('Failed to refresh Outlook token')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  }
}

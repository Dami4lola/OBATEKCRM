import { refreshOutlookToken } from '@/lib/oauth/outlook'
import { createClient } from '@/lib/supabase/server'
import type { EmailAccount } from '@/types/database'

export async function sendOutlookEmail(
  account: EmailAccount,
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let accessToken = account.access_token

    // Check if token is expired and refresh if needed
    if (new Date(account.token_expires_at) < new Date()) {
      const result = await refreshOutlookToken(account.refresh_token)
      accessToken = result.accessToken

      // Update tokens in database
      const supabase = await createClient()
      const expiresAt = new Date(Date.now() + result.expiresIn * 1000)

      await supabase
        .from('email_accounts')
        .update({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id)
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error?.message || `Microsoft Graph error: ${response.statusText}`
      )
    }

    return { success: true }
  } catch (error) {
    console.error('Outlook send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// The mailbox refresh token is stored encrypted (OUTREACH_PLAN.md §16 S10).
// MAIL_TOKEN_KEY: 32 random bytes, base64 (openssl rand -base64 32), only
// in .env.local. Losing it means reconnecting the mailbox, nothing worse.

const VERSION = 'v1'

function key(): Buffer {
  const raw = process.env.MAIL_TOKEN_KEY
  if (!raw) throw new Error('MAIL_TOKEN_KEY is not set in .env.local (make one with: openssl rand -base64 32)')
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.length !== 32) throw new Error('MAIL_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32)')
  return bytes
}

// Throws when MAIL_TOKEN_KEY is missing or the wrong length
export function checkTokenKey(): void {
  key()
}

// AES-256-GCM: v1.<iv>.<tag>.<ciphertext>, all base64
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, encrypted] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error('The saved mailbox login is unreadable. Reconnect the mailbox in Settings.')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key (MAIL_TOKEN_KEY changed) or tampered data
    throw new Error('The saved mailbox login can\'t be decrypted (was MAIL_TOKEN_KEY changed?). Reconnect the mailbox in Settings.')
  }
}

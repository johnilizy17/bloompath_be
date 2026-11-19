import type { TokenPayload } from './utils/token'

/**
 * Cloudflare Workers environment bindings.
 * These map to wrangler.jsonc bindings + secrets set via `wrangler secret put`.
 */
export interface Env {
  // D1 database
  DB: D1Database
  // Workers AI
  AI: Ai
  // Secrets (set via: wrangler secret put <NAME>)
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  FACEBOOK_APP_ID: string
  FACEBOOK_APP_SECRET: string
  RESEND_API_KEY: string        // or SES credentials
  EMAIL_FROM: string            // e.g. "BloomPath <noreply@bloompath.app>"
  // Vars from wrangler.jsonc
  APP_NAME: string
  ENVIRONMENT: string
}

/**
 * Hono context variable types — available via c.get() / c.set()
 */
export type Variables = {
  user: TokenPayload | undefined
  authError: string | undefined
}

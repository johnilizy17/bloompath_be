/**
 * OTP (One-Time Password) utilities for passwordless email auth.
 * Uses the Web Crypto API — natively supported in Cloudflare Workers.
 */

/** Generate a secure 6-digit numeric OTP */
export function generateOTP(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  // Map to 000000–999999
  return String(array[0] % 1_000_000).padStart(6, '0')
}

/** Generate a secure random token (32 bytes hex) */
export function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** OTP TTL in seconds — 10 minutes */
export const OTP_TTL_SECONDS = 10 * 60

/** Returns unix timestamp for expiry */
export function otpExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS
}

/** Refresh token TTL — 30 days */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

export function refreshExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS
}

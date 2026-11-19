import { Hono } from 'hono'
import { AuthService } from './auth.service'
import { requireAuth, requireExpert } from '../core/middleware'
import { ok, created, fail } from '../utils/response'
import type { Env, Variables } from '../types'

const authRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Factory helper ─────────────────────────────────────────────────────────

function makeService(c: { env: Env }): AuthService {
  return new AuthService(
    c.env.DB,
    c.env.JWT_SECRET,
    c.env.RESEND_API_KEY,
    c.env.EMAIL_FROM,
    c.env.APP_NAME ?? 'BloomPath',
  )
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ═════════════════════════════════════════════════════════════════════════════
// ── USER AUTHENTICATION ENDPOINTS ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// ── User Password Registration ─────────────────────────────────────────────
// POST /api/v1/auth/register
authRouter.post('/register', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>
  const { email, password, firstName, lastName } = body

  if (!email || !isValidEmail(email)) {
    return c.json(fail('A valid email address is required'), 400)
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return c.json(fail('Password must be at least 8 characters long'), 400)
  }

  try {
    const result = await makeService(c).registerUser({
      email,
      password,
      firstName,
      lastName,
    })
    return c.json(created(result, 'Account created successfully'), 201)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Registration failed'), 400)
  }
})

// ── User Password Login ────────────────────────────────────────────────────
// POST /api/v1/auth/login
authRouter.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>
  const { email, password } = body

  if (!email || !password) {
    return c.json(fail('Email and password are required'), 400)
  }

  try {
    const result = await makeService(c).loginUser({ email, password })
    return c.json(ok(result, 'Logged in successfully'), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Invalid credentials'), 401)
  }
})

// ── Google OAuth ───────────────────────────────────────────────────────────
// POST /api/v1/auth/google
authRouter.post('/google', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.idToken) {
    return c.json(fail('idToken is required'), 400)
  }

  try {
    const result = await makeService(c).googleAuth(body.idToken)
    return c.json(created(result, 'Authenticated via Google'), 201)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Google authentication failed'), 401)
  }
})

// ── Facebook OAuth ─────────────────────────────────────────────────────────
// POST /api/v1/auth/facebook
authRouter.post('/facebook', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.accessToken) {
    return c.json(fail('accessToken is required'), 400)
  }

  try {
    const result = await makeService(c).facebookAuth(body.accessToken)
    return c.json(created(result, 'Authenticated via Facebook'), 201)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Facebook authentication failed'), 401)
  }
})

// ── Passwordless Email OTP — Send Code ─────────────────────────────────────
// POST /api/v1/auth/email/send-otp
authRouter.post('/email/send-otp', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.email || !isValidEmail(body.email)) {
    return c.json(fail('A valid email address is required'), 400)
  }

  try {
    await makeService(c).sendEmailOTP(body.email)
    return c.json(
      ok(null, `A 6-digit sign-in code has been sent to ${body.email}`),
      200,
    )
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Failed to send OTP'), 500)
  }
})

// ── Passwordless Email OTP — Verify Code ────────────────────────────────────
// POST /api/v1/auth/email/verify-otp
authRouter.post('/email/verify-otp', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.email || !body.code) {
    return c.json(fail('email and code are required'), 400)
  }

  if (!/^\d{6}$/.test(body.code)) {
    return c.json(fail('Code must be a 6-digit number'), 400)
  }

  try {
    const result = await makeService(c).verifyEmailOTP(body.email, body.code)
    return c.json(created(result, 'Authenticated via email OTP'), 201)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'OTP verification failed'), 401)
  }
})

// ── Refresh User Tokens ────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
authRouter.post('/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.refreshToken) {
    return c.json(fail('refreshToken is required'), 400)
  }

  try {
    const result = await makeService(c).refreshTokens(body.refreshToken)
    return c.json(ok(result, 'Tokens refreshed'), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Token refresh failed'), 401)
  }
})

// ── User Logout ────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
authRouter.post('/logout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (body.refreshToken) {
    await makeService(c).logout(body.refreshToken).catch(() => null)
  }

  return c.json(ok(null, 'Logged out successfully'), 200)
})

// ── Get Current User Profile ───────────────────────────────────────────────
// GET /api/v1/auth/me
authRouter.get('/me', requireAuth, async (c) => {
  const user = c.get('user')!

  try {
    const profile = await makeService(c).getProfile(user.sub)
    if (!profile) return c.json(fail('User not found'), 404)
    return c.json(ok(profile), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Failed to fetch profile'), 500)
  }
})

// ── Update User Profile ────────────────────────────────────────────────────
// PATCH /api/v1/auth/me
authRouter.patch('/me', requireAuth, async (c) => {
  const user = c.get('user')!
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  try {
    await makeService(c).updateProfile(user.sub, body)
    const profile = await makeService(c).getProfile(user.sub)
    return c.json(ok(profile, 'Profile updated'), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Failed to update profile'), 500)
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// ── EXPERT (NGO VOLUNTEER) AUTHENTICATION ENDPOINTS ────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

// ── Expert Registration ────────────────────────────────────────────────────
// POST /api/v1/auth/expert/signup
authRouter.post('/expert/signup', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>
  const { fullName, email, password, track, licenseType, licenseNumber, yearsExperience, weeklyHoursDonated, bio } = body

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return c.json(fail('Full professional name is required'), 400)
  }

  if (!email || !isValidEmail(email)) {
    return c.json(fail('A valid professional email address is required'), 400)
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return c.json(fail('Password must be at least 8 characters long'), 400)
  }

  if (!track || !licenseType) {
    return c.json(fail('Discipline track and license/certifying body are required'), 400)
  }

  try {
    const result = await makeService(c).registerExpert({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      track,
      licenseType,
      licenseNumber,
      yearsExperience,
      weeklyHoursDonated: Number(weeklyHoursDonated) || 2,
      bio,
    })
    return c.json(created(result, 'Volunteer practitioner registered successfully'), 201)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Expert registration failed'), 400)
  }
})

// ── Expert Login ───────────────────────────────────────────────────────────
// POST /api/v1/auth/expert/login
authRouter.post('/expert/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>
  const { email, password } = body

  if (!email || !password) {
    return c.json(fail('Email and password are required'), 400)
  }

  try {
    const result = await makeService(c).loginExpert({
      email: email.trim().toLowerCase(),
      password,
    })
    return c.json(ok(result, 'Expert sanctuary unlocked'), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Invalid expert credentials'), 401)
  }
})

// ── Expert Refresh Tokens ──────────────────────────────────────────────────
// POST /api/v1/auth/expert/refresh
authRouter.post('/expert/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (!body.refreshToken) {
    return c.json(fail('refreshToken is required'), 400)
  }

  try {
    const result = await makeService(c).refreshExpertTokens(body.refreshToken)
    return c.json(ok(result, 'Expert tokens refreshed'), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Token refresh failed'), 401)
  }
})

// ── Expert Logout ──────────────────────────────────────────────────────────
// POST /api/v1/auth/expert/logout
authRouter.post('/expert/logout', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>

  if (body.refreshToken) {
    await makeService(c).logoutExpert(body.refreshToken).catch(() => null)
  }

  return c.json(ok(null, 'Expert logged out'), 200)
})

// ── Get Current Expert Profile ─────────────────────────────────────────────
// GET /api/v1/auth/expert/me
authRouter.get('/expert/me', requireAuth, requireExpert, async (c) => {
  const user = c.get('user')!

  try {
    const profile = await makeService(c).getExpertProfile(user.sub)
    if (!profile) return c.json(fail('Expert profile not found'), 404)
    return c.json(ok(profile), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Failed to fetch expert profile'), 500)
  }
})

// ── Public Directory of Verified Pro Bono Experts ──────────────────────────
// GET /api/v1/auth/expert/directory
authRouter.get('/expert/directory', async (c) => {
  try {
    const list = await makeService(c).listDirectoryExperts()
    return c.json(ok(list), 200)
  } catch (err: any) {
    return c.json(fail(err.message ?? 'Failed to list directory'), 500)
  }
})

export default authRouter

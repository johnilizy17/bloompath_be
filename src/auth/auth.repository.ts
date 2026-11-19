/**
 * Auth repository — all DB queries for User and Expert auth flows.
 */

export interface User {
  id: string
  email: string
  passwordHash?: string | null
  role?: 'USER' | 'EXPERT' | 'ADMIN'
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  googleId: string | null
  facebookId: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'BANNED'
  emailVerified: number
  notificationToken: string | null
  createdAt: number
  updatedAt: number
}

export interface Expert {
  id: string
  email: string
  passwordHash: string
  fullName: string
  track: string
  licenseType: string
  licenseNumber: string | null
  yearsExperience: string | null
  weeklyHoursDonated: number
  bio: string | null
  avatarUrl: string | null
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'INACTIVE'
  emailVerified: number
  notificationToken: string | null
  createdAt: number
  updatedAt: number
}

export class AuthRepository {
  constructor(private db: D1Database) {}

  // ── Users ──────────────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .bind(email)
      .first<User>()
  }

  async findUserById(id: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .bind(id)
      .first<User>()
  }

  async findUserByGoogleId(googleId: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE googleId = ? LIMIT 1')
      .bind(googleId)
      .first<User>()
  }

  async findUserByFacebookId(facebookId: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE facebookId = ? LIMIT 1')
      .bind(facebookId)
      .first<User>()
  }

  async createUser(data: {
    email: string
    firstName?: string
    lastName?: string
    avatarUrl?: string
    googleId?: string
    facebookId?: string
    emailVerified?: number
    passwordHash?: string
    role?: 'USER' | 'EXPERT' | 'ADMIN'
  }): Promise<User> {
    const id = crypto.randomUUID()
    await this.db
      .prepare(
        `INSERT INTO users (id, email, firstName, lastName, avatarUrl, googleId, facebookId, emailVerified, passwordHash, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.email,
        data.firstName ?? null,
        data.lastName ?? null,
        data.avatarUrl ?? null,
        data.googleId ?? null,
        data.facebookId ?? null,
        data.emailVerified ?? 0,
        data.passwordHash ?? null,
        data.role ?? 'USER',
      )
      .run()

    return (await this.findUserById(id))!
  }

  async updateUser(
    id: string,
    data: Partial<Pick<User, 'firstName' | 'lastName' | 'avatarUrl' | 'googleId' | 'facebookId' | 'emailVerified' | 'notificationToken' | 'passwordHash'>>,
  ): Promise<void> {
    const fields = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${k} = ?`)
      .join(', ')

    const values = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([, v]) => v)

    if (!fields) return

    await this.db
      .prepare(`UPDATE users SET ${fields} WHERE id = ?`)
      .bind(...values, id)
      .run()
  }

  // ── Experts (NGO Pro Bono Volunteers) ──────────────────────────────────────

  async findExpertByEmail(email: string): Promise<Expert | null> {
    return this.db
      .prepare('SELECT * FROM experts WHERE email = ? LIMIT 1')
      .bind(email)
      .first<Expert>()
  }

  async findExpertById(id: string): Promise<Expert | null> {
    return this.db
      .prepare('SELECT * FROM experts WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Expert>()
  }

  async createExpert(data: {
    email: string
    passwordHash: string
    fullName: string
    track: string
    licenseType: string
    licenseNumber?: string
    yearsExperience?: string
    weeklyHoursDonated?: number
    bio?: string
    avatarUrl?: string
  }): Promise<Expert> {
    const id = crypto.randomUUID()
    await this.db
      .prepare(
        `INSERT INTO experts (id, email, passwordHash, fullName, track, licenseType, licenseNumber, yearsExperience, weeklyHoursDonated, bio, avatarUrl, status, emailVerified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', 1)`,
      )
      .bind(
        id,
        data.email,
        data.passwordHash,
        data.fullName,
        data.track,
        data.licenseType,
        data.licenseNumber ?? null,
        data.yearsExperience ?? '3-5 years',
        data.weeklyHoursDonated ?? 2,
        data.bio ?? null,
        data.avatarUrl ?? null,
      )
      .run()

    return (await this.findExpertById(id))!
  }

  async updateExpert(
    id: string,
    data: Partial<Pick<Expert, 'fullName' | 'bio' | 'weeklyHoursDonated' | 'avatarUrl' | 'notificationToken'>>,
  ): Promise<void> {
    const fields = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${k} = ?`)
      .join(', ')

    const values = Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([, v]) => v)

    if (!fields) return

    await this.db
      .prepare(`UPDATE experts SET ${fields} WHERE id = ?`)
      .bind(...values, id)
      .run()
  }

  async listVerifiedExperts(): Promise<Omit<Expert, 'passwordHash'>[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, email, fullName, track, licenseType, licenseNumber, yearsExperience, weeklyHoursDonated, bio, avatarUrl, status, emailVerified, createdAt, updatedAt
         FROM experts WHERE status = 'VERIFIED' ORDER BY createdAt DESC`,
      )
      .all<Omit<Expert, 'passwordHash'>>()

    return results ?? []
  }

  // ── Expert Refresh Tokens ──────────────────────────────────────────────────

  async createExpertRefreshToken(data: {
    expertId: string
    token: string
    expiresAt: number
  }): Promise<void> {
    const id = crypto.randomUUID()
    await this.db
      .prepare(`INSERT INTO expert_refresh_tokens (id, expertId, token, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind(id, data.expertId, data.token, data.expiresAt)
      .run()
  }

  async findExpertRefreshToken(token: string): Promise<{
    id: string
    expertId: string
    expiresAt: number
    revokedAt: number | null
  } | null> {
    const now = Math.floor(Date.now() / 1000)
    return this.db
      .prepare(
        `SELECT id, expertId, expiresAt, revokedAt FROM expert_refresh_tokens
         WHERE token = ? AND revokedAt IS NULL AND expiresAt > ?
         LIMIT 1`,
      )
      .bind(token, now)
      .first()
  }

  async revokeExpertRefreshToken(token: string): Promise<void> {
    await this.db
      .prepare(`UPDATE expert_refresh_tokens SET revokedAt = unixepoch('now') WHERE token = ?`)
      .bind(token)
      .run()
  }

  async revokeAllExpertRefreshTokens(expertId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE expert_refresh_tokens SET revokedAt = unixepoch('now') WHERE expertId = ? AND revokedAt IS NULL`,
      )
      .bind(expertId)
      .run()
  }

  // ── OTP ───────────────────────────────────────────────────────────────────

  async createOTP(data: {
    email: string
    code: string
    type: 'login' | 'verify_email'
    expiresAt: number
  }): Promise<void> {
    const id = crypto.randomUUID()
    // Invalidate any existing unused OTPs for this email + type
    await this.db
      .prepare(
        `UPDATE email_otps SET usedAt = unixepoch('now') WHERE email = ? AND type = ? AND usedAt IS NULL`,
      )
      .bind(data.email, data.type)
      .run()

    await this.db
      .prepare(
        `INSERT INTO email_otps (id, email, code, type, expiresAt) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, data.email, data.code, data.type, data.expiresAt)
      .run()
  }

  async findValidOTP(
    email: string,
    code: string,
    type: 'login' | 'verify_email',
  ): Promise<{ id: string; expiresAt: number } | null> {
    const now = Math.floor(Date.now() / 1000)
    return this.db
      .prepare(
        `SELECT id, expiresAt FROM email_otps
         WHERE email = ? AND code = ? AND type = ? AND usedAt IS NULL AND expiresAt > ?
         LIMIT 1`,
      )
      .bind(email, code, type, now)
      .first<{ id: string; expiresAt: number }>()
  }

  async markOTPUsed(id: string): Promise<void> {
    await this.db
      .prepare(`UPDATE email_otps SET usedAt = unixepoch('now') WHERE id = ?`)
      .bind(id)
      .run()
  }

  // ── User Refresh tokens ───────────────────────────────────────────────────

  async createRefreshToken(data: {
    userId: string
    token: string
    expiresAt: number
  }): Promise<void> {
    const id = crypto.randomUUID()
    await this.db
      .prepare(`INSERT INTO refresh_tokens (id, userId, token, expiresAt) VALUES (?, ?, ?, ?)`)
      .bind(id, data.userId, data.token, data.expiresAt)
      .run()
  }

  async findRefreshToken(token: string): Promise<{
    id: string
    userId: string
    expiresAt: number
    revokedAt: number | null
  } | null> {
    const now = Math.floor(Date.now() / 1000)
    return this.db
      .prepare(
        `SELECT id, userId, expiresAt, revokedAt FROM refresh_tokens
         WHERE token = ? AND revokedAt IS NULL AND expiresAt > ?
         LIMIT 1`,
      )
      .bind(token, now)
      .first()
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.db
      .prepare(`UPDATE refresh_tokens SET revokedAt = unixepoch('now') WHERE token = ?`)
      .bind(token)
      .run()
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE refresh_tokens SET revokedAt = unixepoch('now') WHERE userId = ? AND revokedAt IS NULL`,
      )
      .bind(userId)
      .run()
  }
}

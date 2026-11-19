import { AuthRepository, type User, type Expert } from './auth.repository'
import { TokenService } from '../utils/token'
import { generateOTP, generateToken, otpExpiresAt, refreshExpiresAt } from '../utils/otp'
import { sendEmail, otpEmailHtml } from '../utils/email'
import { hashPassword, verifyPassword } from '../utils/password'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: Omit<User, 'googleId' | 'facebookId' | 'passwordHash'>
}

export interface ExpertAuthTokens {
  accessToken: string
  refreshToken: string
  expert: Omit<Expert, 'passwordHash'>
}

export class AuthService {
  private repo: AuthRepository
  private tokenService: TokenService

  constructor(
    db: D1Database,
    jwtSecret: string,
    private resendApiKey: string,
    private emailFrom: string,
    private appName: string,
  ) {
    this.repo = new AuthRepository(db)
    this.tokenService = new TokenService(jwtSecret)
  }

  // ── Shared token issuer for users ──────────────────────────────────────────

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email, role: (user.role ?? 'USER') as 'USER' | 'EXPERT' }
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken(payload),
    ])

    await this.repo.createRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshExpiresAt(),
    })

    const { googleId: _g, facebookId: _f, passwordHash: _p, ...safeUser } = user
    return { accessToken, refreshToken, user: safeUser }
  }

  // ── Shared token issuer for experts ────────────────────────────────────────

  private async issueExpertTokens(expert: Expert): Promise<ExpertAuthTokens> {
    const payload = { sub: expert.id, email: expert.email, role: 'EXPERT' as const, name: expert.fullName }
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken(payload),
    ])

    await this.repo.createExpertRefreshToken({
      expertId: expert.id,
      token: refreshToken,
      expiresAt: refreshExpiresAt(),
    })

    const { passwordHash: _p, ...safeExpert } = expert
    return { accessToken, refreshToken, expert: safeExpert }
  }

  // ── USER AUTH: Password Registration & Login ───────────────────────────────

  async registerUser(data: {
    email: string
    password: string
    firstName?: string
    lastName?: string
  }): Promise<AuthTokens> {
    const existing = await this.repo.findUserByEmail(data.email)
    if (existing) {
      throw new Error('An account with this email already exists')
    }

    const passwordHash = await hashPassword(data.password)
    const user = await this.repo.createUser({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerified: 0,
      role: 'USER',
    })

    return this.issueTokens(user)
  }

  async loginUser(data: { email: string; password: string }): Promise<AuthTokens> {
    const user = await this.repo.findUserByEmail(data.email)
    if (!user || !user.passwordHash) {
      throw new Error('Invalid email or password')
    }

    if (user.status === 'BANNED') {
      throw new Error('Account has been suspended')
    }

    const isValid = await verifyPassword(data.password, user.passwordHash)
    if (!isValid) {
      throw new Error('Invalid email or password')
    }

    return this.issueTokens(user)
  }

  // ── EXPERT AUTH: Pro Bono Volunteer Registration & Login ───────────────────

  async registerExpert(data: {
    fullName: string
    email: string
    password: string
    track: string
    licenseType: string
    licenseNumber?: string
    yearsExperience?: string
    weeklyHoursDonated?: number
    bio?: string
  }): Promise<ExpertAuthTokens> {
    const existing = await this.repo.findExpertByEmail(data.email)
    if (existing) {
      throw new Error('An expert volunteer account with this email already exists')
    }

    const passwordHash = await hashPassword(data.password)
    const expert = await this.repo.createExpert({
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      track: data.track,
      licenseType: data.licenseType,
      licenseNumber: data.licenseNumber,
      yearsExperience: data.yearsExperience,
      weeklyHoursDonated: data.weeklyHoursDonated ?? 2,
      bio: data.bio,
    })

    return this.issueExpertTokens(expert)
  }

  async loginExpert(data: { email: string; password: string }): Promise<ExpertAuthTokens> {
    const expert = await this.repo.findExpertByEmail(data.email)
    if (!expert) {
      throw new Error('No expert account found with this email')
    }

    if (expert.status === 'INACTIVE') {
      throw new Error('Your practitioner account is inactive')
    }

    const isValid = await verifyPassword(data.password, expert.passwordHash)
    if (!isValid) {
      throw new Error('Invalid email or password')
    }

    return this.issueExpertTokens(expert)
  }

  async getExpertProfile(expertId: string): Promise<Omit<Expert, 'passwordHash'> | null> {
    const expert = await this.repo.findExpertById(expertId)
    if (!expert) return null
    const { passwordHash: _p, ...safeExpert } = expert
    return safeExpert
  }

  async listDirectoryExperts(): Promise<Omit<Expert, 'passwordHash'>[]> {
    return this.repo.listVerifiedExperts()
  }

  async refreshExpertTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenRecord = await this.repo.findExpertRefreshToken(refreshToken)
    if (!tokenRecord) {
      throw new Error('Invalid or expired refresh token')
    }

    const expert = await this.repo.findExpertById(tokenRecord.expertId)
    if (!expert || expert.status === 'INACTIVE') {
      throw new Error('Expert account no longer active')
    }

    // Token rotation
    await this.repo.revokeExpertRefreshToken(refreshToken)

    const payload = { sub: expert.id, email: expert.email, role: 'EXPERT' as const, name: expert.fullName }
    const [accessToken, newRefreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken(payload),
    ])

    await this.repo.createExpertRefreshToken({
      expertId: expert.id,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt(),
    })

    return { accessToken, refreshToken: newRefreshToken }
  }

  async logoutExpert(refreshToken: string): Promise<void> {
    await this.repo.revokeExpertRefreshToken(refreshToken)
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  async googleAuth(idToken: string): Promise<AuthTokens> {
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    )

    if (!googleRes.ok) {
      throw new Error('Invalid Google ID token')
    }

    const gUser = (await googleRes.json()) as {
      sub: string
      email: string
      given_name?: string
      family_name?: string
      picture?: string
      email_verified?: string
    }

    if (!gUser.email) {
      throw new Error('Google account must have an email address')
    }

    let user = await this.repo.findUserByGoogleId(gUser.sub)

    if (!user) {
      user = await this.repo.findUserByEmail(gUser.email)

      if (user) {
        await this.repo.updateUser(user.id, {
          googleId: gUser.sub,
          emailVerified: 1,
          avatarUrl: user.avatarUrl ?? gUser.picture,
        })
        user = (await this.repo.findUserById(user.id))!
      } else {
        user = await this.repo.createUser({
          email: gUser.email,
          googleId: gUser.sub,
          firstName: gUser.given_name,
          lastName: gUser.family_name,
          avatarUrl: gUser.picture,
          emailVerified: 1,
        })
      }
    }

    if (user.status === 'BANNED') {
      throw new Error('Account has been suspended')
    }

    return this.issueTokens(user)
  }

  // ── Facebook OAuth ──────────────────────────────────────────────────────────

  async facebookAuth(accessToken: string): Promise<AuthTokens> {
    const fbRes = await fetch(
      `https://graph.facebook.com/me?fields=id,email,first_name,last_name,picture.type(large)&access_token=${accessToken}`,
    )

    if (!fbRes.ok) {
      throw new Error('Invalid Facebook access token')
    }

    const fbUser = (await fbRes.json()) as {
      id: string
      email?: string
      first_name?: string
      last_name?: string
      picture?: { data?: { url?: string } }
    }

    if (!fbUser.email) {
      throw new Error('Facebook account does not have an associated email address')
    }

    let user = await this.repo.findUserByFacebookId(fbUser.id)

    if (!user) {
      user = await this.repo.findUserByEmail(fbUser.email)

      if (user) {
        await this.repo.updateUser(user.id, {
          facebookId: fbUser.id,
          avatarUrl: user.avatarUrl ?? fbUser.picture?.data?.url,
        })
        user = (await this.repo.findUserById(user.id))!
      } else {
        user = await this.repo.createUser({
          email: fbUser.email,
          facebookId: fbUser.id,
          firstName: fbUser.first_name,
          lastName: fbUser.last_name,
          avatarUrl: fbUser.picture?.data?.url,
          emailVerified: 1,
        })
      }
    }

    if (user.status === 'BANNED') {
      throw new Error('Account has been suspended')
    }

    return this.issueTokens(user)
  }

  // ── Passwordless Email OTP ─────────────────────────────────────────────────

  async sendEmailOTP(email: string): Promise<void> {
    const code = generateOTP()
    await this.repo.createOTP({
      email,
      code,
      type: 'login',
      expiresAt: otpExpiresAt(),
    })

    await sendEmail(
      {
        to: email,
        subject: `Your ${this.appName} sign-in code`,
        html: otpEmailHtml(code, this.appName),
      },
      this.resendApiKey,
      this.emailFrom,
    )
  }

  async verifyEmailOTP(email: string, code: string): Promise<AuthTokens> {
    const otp = await this.repo.findValidOTP(email, code, 'login')

    if (!otp) {
      throw new Error('Invalid or expired code. Please request a new one.')
    }

    await this.repo.markOTPUsed(otp.id)

    let user = await this.repo.findUserByEmail(email)

    if (!user) {
      user = await this.repo.createUser({
        email,
        emailVerified: 1,
      })
    } else if (!user.emailVerified) {
      await this.repo.updateUser(user.id, { emailVerified: 1 })
      user = (await this.repo.findUserById(user.id))!
    }

    if (user.status === 'BANNED') {
      throw new Error('Account has been suspended')
    }

    return this.issueTokens(user)
  }

  // ── Refresh Tokens ─────────────────────────────────────────────────────────

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenRecord = await this.repo.findRefreshToken(refreshToken)

    if (!tokenRecord) {
      throw new Error('Invalid or expired refresh token')
    }

    const user = await this.repo.findUserById(tokenRecord.userId)
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User account no longer active')
    }

    await this.repo.revokeRefreshToken(refreshToken)

    const payload = { sub: user.id, email: user.email, role: (user.role ?? 'USER') as 'USER' | 'EXPERT' }
    const [accessToken, newRefreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken(payload),
    ])

    await this.repo.createRefreshToken({
      userId: user.id,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt(),
    })

    return { accessToken, refreshToken: newRefreshToken }
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    await this.repo.revokeRefreshToken(refreshToken)
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repo.revokeAllUserRefreshTokens(userId)
  }

  // ── Profile ─────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<Omit<User, 'googleId' | 'facebookId' | 'passwordHash'> | null> {
    const user = await this.repo.findUserById(userId)
    if (!user) return null
    const { googleId: _g, facebookId: _f, passwordHash: _p, ...safeUser } = user
    return safeUser
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; notificationToken?: string },
  ): Promise<void> {
    await this.repo.updateUser(userId, data)
  }
}

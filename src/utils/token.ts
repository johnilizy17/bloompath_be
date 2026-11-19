import { SignJWT, jwtVerify } from 'jose'

export interface TokenPayload {
  sub: string       // user or expert id
  email: string
  role?: 'USER' | 'EXPERT' | 'ADMIN'
  name?: string
  iat?: number
  exp?: number
}

export class TokenService {
  private secret: Uint8Array

  constructor(jwtSecret: string) {
    this.secret = new TextEncoder().encode(jwtSecret)
  }

  async signAccessToken(payload: { sub: string; email: string; role?: 'USER' | 'EXPERT' | 'ADMIN'; name?: string }): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(this.secret)
  }

  async signRefreshToken(payload: { sub: string; email: string; role?: 'USER' | 'EXPERT' | 'ADMIN'; name?: string }): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(this.secret)
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, this.secret)
    return payload as unknown as TokenPayload
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, this.secret)
    return payload as unknown as TokenPayload
  }
}

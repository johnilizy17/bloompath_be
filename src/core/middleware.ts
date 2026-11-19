import type { Context, Next } from 'hono'
import { TokenService } from '../utils/token'
import type { Env, Variables } from '../types'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * Global JWT verification middleware.
 * Runs on every request. Sets c.var.user if token is valid.
 * Non-blocking — routes that need auth must use requireAuth().
 */
export async function verifyJwt(c: AppContext, next: Next) {
  const authorization = c.req.header('Authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next()
  }

  const token = authorization.slice(7)

  try {
    const tokenService = new TokenService(c.env.JWT_SECRET)
    const payload = await tokenService.verifyAccessToken(token)
    c.set('user', payload)
  } catch {
    // Invalid / expired token — let the route guard handle the 401
    c.set('authError', 'Token invalid or expired')
  }

  return next()
}

/**
 * Route-level guard — attach to any route that requires authentication.
 */
export async function requireAuth(c: AppContext, next: Next) {
  const user = c.get('user')

  if (!user?.sub) {
    const authError = c.get('authError')
    return c.json(
      {
        success: false,
        message: authError ?? 'Authentication required',
        hint: 'Include a valid Bearer token in the Authorization header',
      },
      401,
    )
  }

  return next()
}

/**
 * Guard ensuring only accredited NGO experts can access the route.
 */
export async function requireExpert(c: AppContext, next: Next) {
  const user = c.get('user')

  if (!user?.sub || user.role !== 'EXPERT') {
    return c.json(
      {
        success: false,
        message: 'Expert credentials required to access this portal',
      },
      403,
    )
  }

  return next()
}

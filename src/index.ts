import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { verifyJwt } from './core/middleware'
import baseRouter from './core/router'
import { fail } from './utils/response'
import type { Env, Variables } from './types'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── Global middleware ────────────────────────────────────────────────────────

// CORS — adjust origins before going to production
app.use(
  '*',
  cors({
    origin: '*',                         // TODO: tighten to your domain(s) in prod
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
)

// Request logger (visible in wrangler dev + Cloudflare observability)
app.use('*', logger())

// JWT verification — runs globally, non-blocking
app.use('*', verifyJwt)

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/', (c) =>
  c.json({
    name: 'BloomPath API',
    version: '1.0.0',
    status: 'ok',
    docs: '/api/v1',
  }),
)

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }))

// ── API routes ───────────────────────────────────────────────────────────────

app.route('/api/v1', baseRouter)

// ── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json(fail('Route not found'), 404))

// ── Error handler ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error('[UNHANDLED]', err)
  return c.json(fail('An unexpected error occurred'), 500)
})

// Export as Cloudflare Worker
export default app

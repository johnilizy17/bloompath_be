import { Hono } from 'hono'
import { AiService } from './ai.service'
import { AuthRepository } from '../auth/auth.repository'
import { requireAuth } from '../core/middleware'
import { ok, fail } from '../utils/response'
import type { Env, Variables } from '../types'

const aiRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

// All AI routes require authentication
aiRouter.use('*', requireAuth)

// ── Simple chat (no history) ────────────────────────────────────────────────
// POST /api/v1/ai/chat
// Body: { message: string }

aiRouter.post('/chat', async (c) => {
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return c.json(fail('message is required'), 400)
  }

  if (body.message.length > 2000) {
    return c.json(fail('Message too long (max 2000 characters)'), 400)
  }

  try {
    const aiService = new AiService(c.env.AI)
    const result = await aiService.chat(body.message)
    return c.json(ok(result), 200)
  } catch (err: any) {
    console.error('[AI] chat error:', err)
    return c.json(fail('AI service error'), 500)
  }
})

// ── Contextual chat with history ────────────────────────────────────────────
// POST /api/v1/ai/chat/history
// Body: { message: string; history?: { role: 'user'|'assistant'; content: string }[] }

aiRouter.post('/chat/history', async (c) => {
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return c.json(fail('message is required'), 400)
  }

  if (body.message.length > 2000) {
    return c.json(fail('Message too long (max 2000 characters)'), 400)
  }

  try {
    const aiService = new AiService(c.env.AI)
    const result = await aiService.chatWithHistory(body.message, body.history ?? [])

    // Optionally persist the conversation to D1
    const user = c.get('user')!
    await c.env.DB.prepare(
      `INSERT INTO ai_conversations (id, userId, role, content) VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), user.sub, 'user', body.message)
      .run()
    await c.env.DB.prepare(
      `INSERT INTO ai_conversations (id, userId, role, content) VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), user.sub, 'assistant', result.message)
      .run()

    return c.json(ok(result), 200)
  } catch (err: any) {
    console.error('[AI] chat/history error:', err)
    return c.json(fail('AI service error'), 500)
  }
})

// ── Daily affirmation ───────────────────────────────────────────────────────
// POST /api/v1/ai/affirmation
// Body: { context?: string }  — optional context about the user's situation

aiRouter.post('/affirmation', async (c) => {
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  try {
    const aiService = new AiService(c.env.AI)
    const affirmation = await aiService.generateAffirmation(body.context)
    return c.json(ok({ affirmation }), 200)
  } catch (err: any) {
    console.error('[AI] affirmation error:', err)
    return c.json(fail('AI service error'), 500)
  }
})

// ── Journal analysis ────────────────────────────────────────────────────────
// POST /api/v1/ai/journal-analysis
// Body: { entry: string }

aiRouter.post('/journal-analysis', async (c) => {
  let body: Record<string, any> = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  if (!body.entry || typeof body.entry !== 'string' || !body.entry.trim()) {
    return c.json(fail('entry is required'), 400)
  }

  if (body.entry.length > 5000) {
    return c.json(fail('Journal entry too long (max 5000 characters)'), 400)
  }

  try {
    const aiService = new AiService(c.env.AI)
    const result = await aiService.analyzeJournal(body.entry)
    return c.json(ok(result), 200)
  } catch (err: any) {
    console.error('[AI] journal-analysis error:', err)
    return c.json(fail('AI service error'), 500)
  }
})

// ── Get conversation history ────────────────────────────────────────────────
// GET /api/v1/ai/history?limit=20&offset=0

aiRouter.get('/history', async (c) => {
  const user = c.get('user')!
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100)
  const offset = parseInt(c.req.query('offset') ?? '0')

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, role, content, createdAt FROM ai_conversations
       WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    )
      .bind(user.sub, limit, offset)
      .all()

    return c.json(ok({ history: results ? results.reverse() : [] }), 200)
  } catch (err: any) {
    console.error('[AI] history fetch error:', err)
    return c.json(fail('Failed to fetch history'), 500)
  }
})

// ── Clear conversation history ──────────────────────────────────────────────
// DELETE /api/v1/ai/history

aiRouter.delete('/history', async (c) => {
  const user = c.get('user')!

  try {
    await c.env.DB.prepare(`DELETE FROM ai_conversations WHERE userId = ?`)
      .bind(user.sub)
      .run()
    return c.json(ok(null, 'Conversation history cleared'), 200)
  } catch (err: any) {
    return c.json(fail('Failed to clear history'), 500)
  }
})

export default aiRouter

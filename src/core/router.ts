import { Hono } from 'hono'
import authRouter from '../auth/auth.route'
import aiRouter from '../ai/ai.route'
import type { Env, Variables } from '../types'

const baseRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

baseRouter.route('/auth', authRouter)
baseRouter.route('/ai', aiRouter)

export default baseRouter

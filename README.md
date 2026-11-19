# BloomPath Backend

Cloudflare Workers API for BloomPath — built with Hono + D1 + Workers AI.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database | Cloudflare D1 (SQLite) |
| AI | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) |
| Auth | Google OAuth · Facebook OAuth · Passwordless Email OTP |
| Tokens | JWT (HS256) via `jose` |
| Email | Resend API |

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Create the D1 database
```bash
npx wrangler d1 create bloompath-db
```
Copy the `database_id` it outputs and paste it into `wrangler.jsonc`.

### 3. Run migrations
```bash
npm run db:migrate:local      # local dev
npm run db:migrate            # production
```

### 4. Set up local secrets
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your real values
```

### 5. Start dev server
```bash
npm run dev
```

### 6. Set production secrets
```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put FACEBOOK_APP_ID
npx wrangler secret put FACEBOOK_APP_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
```

### 7. Deploy
```bash
npm run deploy
```

---

## API Reference

Base URL: `https://<worker>.workers.dev/api/v1`

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/google` | Sign in with Google ID token |
| `POST` | `/auth/facebook` | Sign in with Facebook access token |
| `POST` | `/auth/email/send-otp` | Send 6-digit OTP to email |
| `POST` | `/auth/email/verify-otp` | Verify OTP → get tokens |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke refresh token |
| `POST` | `/auth/logout-all` | Revoke all sessions (auth required) |
| `GET` | `/auth/me` | Get current user profile (auth required) |
| `PATCH` | `/auth/me` | Update profile (auth required) |

### AI (all require `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ai/chat` | Single-turn AI chat |
| `POST` | `/ai/chat/history` | Multi-turn chat with history |
| `POST` | `/ai/affirmation` | Generate daily affirmation |
| `POST` | `/ai/journal-analysis` | Analyze a journal entry |
| `GET` | `/ai/history` | Get conversation history |
| `DELETE` | `/ai/history` | Clear conversation history |

### Authentication Flow

All protected routes require:
```
Authorization: Bearer <accessToken>
```

**Google:**
```json
POST /auth/google
{ "idToken": "<google_id_token_from_client>" }
```

**Facebook:**
```json
POST /auth/facebook
{ "accessToken": "<facebook_user_access_token_from_client>" }
```

**Email OTP:**
```json
// Step 1
POST /auth/email/send-otp
{ "email": "user@example.com" }

// Step 2
POST /auth/email/verify-otp
{ "email": "user@example.com", "code": "123456" }
```

All auth endpoints return:
```json
{
  "success": true,
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": { "id": "...", "email": "...", "firstName": "...", ... }
  }
}
```
# bloompath_be

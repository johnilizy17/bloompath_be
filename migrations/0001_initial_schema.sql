-- BloomPath Initial Schema
-- Run: wrangler d1 migrations apply bloompath-db

-- Users table (all auth methods converge here)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  firstName TEXT,
  lastName TEXT,
  avatarUrl TEXT,
  -- Auth providers linked to this account
  googleId TEXT UNIQUE,
  facebookId TEXT UNIQUE,
  -- Account state
  status TEXT CHECK(status IN ('ACTIVE', 'INACTIVE', 'BANNED')) DEFAULT 'ACTIVE',
  emailVerified INTEGER DEFAULT 0,
  -- Push notifications
  notificationToken TEXT,
  -- Timestamps
  createdAt INTEGER DEFAULT (unixepoch('now')),
  updatedAt INTEGER DEFAULT (unixepoch('now'))
);

-- OTP codes for passwordless email login
CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  -- type: 'login' | 'verify_email'
  type TEXT CHECK(type IN ('login', 'verify_email')) DEFAULT 'login',
  expiresAt INTEGER NOT NULL,
  usedAt INTEGER,
  createdAt INTEGER DEFAULT (unixepoch('now'))
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  userId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresAt INTEGER NOT NULL,
  revokedAt INTEGER,
  createdAt INTEGER DEFAULT (unixepoch('now')),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- AI conversation history (optional — stores per-user chat context)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  userId TEXT NOT NULL,
  role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  createdAt INTEGER DEFAULT (unixepoch('now')),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_googleId ON users(googleId);
CREATE INDEX IF NOT EXISTS idx_users_facebookId ON users(facebookId);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expiresAt);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_userId ON ai_conversations(userId);

-- Auto-update updatedAt trigger
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updatedAt = unixepoch('now') WHERE id = NEW.id;
END;

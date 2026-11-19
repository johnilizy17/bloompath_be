-- BloomPath Migration 0002: Expert and Password Auth Schema

-- 1. Add password hash and role to users table (if not exists)
ALTER TABLE users ADD COLUMN passwordHash TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';

-- 2. Create experts table for NGO volunteer practitioners
CREATE TABLE IF NOT EXISTS experts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  fullName TEXT NOT NULL,
  track TEXT NOT NULL,
  licenseType TEXT NOT NULL,
  licenseNumber TEXT,
  yearsExperience TEXT DEFAULT '3-5 years',
  weeklyHoursDonated INTEGER DEFAULT 2,
  bio TEXT,
  avatarUrl TEXT,
  status TEXT CHECK(status IN ('PENDING_VERIFICATION', 'VERIFIED', 'INACTIVE')) DEFAULT 'VERIFIED',
  emailVerified INTEGER DEFAULT 1,
  notificationToken TEXT,
  createdAt INTEGER DEFAULT (unixepoch('now')),
  updatedAt INTEGER DEFAULT (unixepoch('now'))
);

-- 3. Expert Refresh Tokens table
CREATE TABLE IF NOT EXISTS expert_refresh_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  expertId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresAt INTEGER NOT NULL,
  revokedAt INTEGER,
  createdAt INTEGER DEFAULT (unixepoch('now')),
  FOREIGN KEY (expertId) REFERENCES experts(id) ON DELETE CASCADE
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_experts_email ON experts(email);
CREATE INDEX IF NOT EXISTS idx_experts_status ON experts(status);
CREATE INDEX IF NOT EXISTS idx_expert_tokens_expertId ON expert_refresh_tokens(expertId);
CREATE INDEX IF NOT EXISTS idx_expert_tokens_token ON expert_refresh_tokens(token);

-- 5. Trigger to auto-update updatedAt on experts
CREATE TRIGGER IF NOT EXISTS update_experts_timestamp
AFTER UPDATE ON experts
BEGIN
  UPDATE experts SET updatedAt = unixepoch('now') WHERE id = NEW.id;
END;

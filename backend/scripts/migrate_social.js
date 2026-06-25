/**
 * Migration: Social Features
 * Adds follows, messages, conversations tables + new user columns
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  console.log('\n🔄 Running social features migration...\n');
  try {
    await client.query('BEGIN');

    // ── Users: new columns ──
    console.log('  → Adding columns to users table...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS skatepark_location TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`);

    // ── Batches: calendar columns ──
    console.log('  → Adding calendar columns to batches...');
    await client.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ`);
    await client.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ`);

    // ── Trick mastery: coach notes ──
    console.log('  → Adding coach fields to trick_mastery...');
    await client.query(`ALTER TABLE trick_mastery ADD COLUMN IF NOT EXISTS notes TEXT`);
    await client.query(`ALTER TABLE trick_mastery ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES users(id) ON DELETE SET NULL`);

    // ── follows table ──
    console.log('  → Creating follows table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
        followed_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (follower_id, followed_id),
        CHECK (follower_id != followed_id)
      )
    `);

    // ── conversations table ──
    console.log('  → Creating conversations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        participant1_id UUID REFERENCES users(id) ON DELETE CASCADE,
        participant2_id UUID REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS conv_participants_unique
      ON conversations (LEAST(participant1_id::text, participant2_id::text), GREATEST(participant1_id::text, participant2_id::text))
    `);

    // ── messages table ──
    console.log('  → Creating messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── indexes ──
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC)`);

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message, '\n');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));

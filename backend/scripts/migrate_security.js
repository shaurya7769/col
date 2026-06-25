require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  console.log('\n🔄 Running security and columns migration...\n');
  try {
    await client.query('BEGIN');

    console.log('  → Adding email_verified column...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`);

    console.log('  → Adding login_attempts column...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0`);

    console.log('  → Adding locked_until column...');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);

    console.log('  → Adding updated_at trigger...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_updated_at') THEN
          CREATE TRIGGER set_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        END IF;
      END
      $$;
    `);

    console.log('  → Updating trick_mastery CHECK constraint to include not_started...');
    await client.query(`
      ALTER TABLE trick_mastery DROP CONSTRAINT IF EXISTS trick_mastery_status_check;
    `);
    await client.query(`
      ALTER TABLE trick_mastery ADD CONSTRAINT trick_mastery_status_check
        CHECK (status IN ('learning', 'mastered', 'not_started'));
    `);

    console.log('  → Creating audit_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB DEFAULT '{}',
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)`);

    console.log('  → Adding indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trick_mastery_user ON trick_mastery(user_id)`);

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

const { Client } = require('pg');

async function migrate() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:playarena2025!@db.wrwvrzqrlepprtqqkdex.supabase.co:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to DB for migration...');
    await client.connect();
    
    console.log('Adding OTP columns to users table...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS otp VARCHAR(10),
      ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
    `);

    console.log('✅ Migration complete: OTP columns added.');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();

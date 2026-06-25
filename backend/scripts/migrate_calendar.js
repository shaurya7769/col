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
    
    console.log('Adding start_time and end_time to batches table...');
    await client.query(`
      ALTER TABLE batches 
      ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
    `);

    console.log('✅ Migration complete: Calendar columns added.');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

migrate();

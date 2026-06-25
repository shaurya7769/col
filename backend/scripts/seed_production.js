const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function seed() {
  const connectionString = 'postgresql://postgres:playarena2025!@db.wrwvrzqrlepprtqqkdex.supabase.co:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to Supabase...');
    await client.connect();
    
    // Hash password for seed users
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('skate2025', salt);

    console.log('🧹 Cleaning database...');
    await client.query('DROP TABLE IF EXISTS trick_mastery, enrollments, likes, comments, posts, batches, users CASCADE;');

    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    let sql = fs.readFileSync(schemaPath, 'utf8');

    // Remove the sample hashes and replace with real bcrypt ones
    sql = sql.replace(/\$2b\$10\$SampleHash/g, hash);

    console.log('🚀 Seeding fresh schema with real hashes...');
    await client.query(sql);

    // Add an admin user explicitly
    const adminHash = await bcrypt.hash('skate2025', salt);
    await client.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ('Admin User', 'admin@skate.academy', $1, 'admin') ON CONFLICT DO NOTHING",
      [adminHash]
    );

    console.log('\n✨ Database seeded successfully!');
    console.log('-----------------------------------');
    console.log('Use these accounts to test:');
    console.log('1. Admin: admin@skate.academy / skate2025');
    console.log('2. Coach: alex@skate.academy / skate2025');
    console.log('3. Student: student@skate.academy / skate2025');
    console.log('-----------------------------------');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    await client.end();
  }
}

seed();

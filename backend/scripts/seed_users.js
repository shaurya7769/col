require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:playarena2025!@db.wrwvrzqrlepprtqqkdex.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  console.log('Connecting to database...', dbUrl.split('@')[1]);
  try {
    const salt = await bcrypt.genSalt(10);
    const pass = await bcrypt.hash('playarena2025', salt);

    const users = [
      { user: 'admin', email: 'admin@escape.app', role: 'admin', park: 'Play Arena' },
      { user: 'coach', email: 'coach@escape.app', role: 'coach', park: 'School of Raya' },
      { user: 'student', email: 'student@escape.app', role: 'student', park: 'Play Arena' },
    ];

    for (let u of users) {
      console.log(`Checking ${u.user}...`);
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (rows.length === 0) {
        await pool.query(
          `INSERT INTO users (username, email, password_hash, role, skatepark_location)
           VALUES ($1, $2, $3, $4, $5)`,
          [u.user, u.email, pass, u.role, u.park]
        );
        console.log(`Created ${u.user} !`);
      } else {
        console.log(`${u.user} already exists.`);
      }
    }
    console.log('\n✅ All demo users are ready! Password: playarena2025');
  } catch (err) {
    console.error('❌ Error seeding:', err.message);
  } finally {
    await pool.end();
  }
}

seed();

// ⚠️ DEPRECATED: All tables are now created by setup_sqlite.js (consolidated).
// Kept for reference only — do not run standalone.

require('dotenv').config();
const { db } = require('../src/utils/db');

function run(sql) {
  db.prepare(sql).run();
}

function addColumn(table, column, def) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`).run();
    console.log(`  Added ${column} to ${table}`);
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log(`  ${column} already exists`);
    } else {
      throw e;
    }
  }
}

// 1-3. Add columns to posts (skipped if already exist)
addColumn('posts', 'edited_at', 'TEXT');
addColumn('posts', 'shares_count', 'INTEGER DEFAULT 0');
addColumn('posts', 'is_private', 'INTEGER DEFAULT 0');

// 4. Create post_shares table
console.log('Creating post_shares table...');
run(`CREATE TABLE IF NOT EXISTS post_shares (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// 5. Create hashtags table
console.log('Creating hashtags table...');
run(`CREATE TABLE IF NOT EXISTS hashtags (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
)`);
console.log('Creating index on hashtags(tag)...');
run('CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON hashtags(tag)');

// 6. Create post_mentions table
console.log('Creating post_mentions table...');
run(`CREATE TABLE IF NOT EXISTS post_mentions (
  id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// 7. Create reports table
console.log('Creating reports table...');
run(`CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending','reviewed','dismissed','actioned')) DEFAULT 'pending',
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
)`);

// 8. Create events table
console.log('Creating events table...');
run(`CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  end_date TEXT,
  location TEXT,
  capacity INTEGER DEFAULT 0,
  is_recurring INTEGER DEFAULT 0,
  recurring_rule TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
  cover_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// 9. Create event_rsvps table
console.log('Creating event_rsvps table...');
run(`CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK(status IN ('going','maybe','declined')) NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (event_id, user_id)
)`);

// 10. Create progress_media table
console.log('Creating progress_media table...');
run(`CREATE TABLE IF NOT EXISTS progress_media (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT CHECK(media_type IN ('image','video')) NOT NULL,
  caption TEXT,
  trick_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
console.log('Creating index on progress_media(user_id, created_at DESC)...');
run('CREATE INDEX IF NOT EXISTS idx_progress_media_user ON progress_media(user_id, created_at DESC)');

console.log('Social/events/gallery extension complete.');

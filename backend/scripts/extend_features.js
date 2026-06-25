// ⚠️ DEPRECATED: All tables are now created by setup_sqlite.js (consolidated).
// Kept for reference only — do not run standalone.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db = require('../src/utils/db');

console.log('\n⚠️  extend_features.js is DEPRECATED. Use setup_sqlite.js instead.\n');

function run(sql) {
  return db.query(sql);
}

try {
  // ── practice_logs ──
  console.log('  → Creating practice_logs table...');
  run(`CREATE TABLE IF NOT EXISTS practice_logs (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    tricks_practiced TEXT,
    mood INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── coach_feedback ──
  console.log('  → Creating coach_feedback table...');
  run(`CREATE TABLE IF NOT EXISTS coach_feedback (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    coach_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    rating INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── achievements ──
  console.log('  → Creating achievements table...');
  run(`CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT DEFAULT '🏆',
    criteria_type TEXT NOT NULL CHECK (criteria_type IN ('tricks_mastered', 'sessions_attended', 'practice_streak', 'comments_made', 'posts_created', 'followers_reached', 'practice_logs', 'goals_completed')),
    criteria_count INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── user_achievements ──
  console.log('  → Creating user_achievements table...');
  run(`CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, achievement_id)
  )`);

  // ── announcements ──
  console.log('  → Creating announcements table...');
  run(`CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    author_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_role TEXT DEFAULT 'all',
    batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
    priority TEXT DEFAULT 'normal',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── notifications ──
  console.log('  → Creating notifications table...');
  run(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message', 'achievement', 'announcement', 'feedback', 'trick_verified', 'goal_completed')),
    reference_id TEXT,
    content TEXT NOT NULL,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── trick_verifications ──
  console.log('  → Creating trick_verifications table...');
  run(`CREATE TABLE IF NOT EXISTS trick_verifications (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    trick_name TEXT NOT NULL,
    coach_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    coach_notes TEXT,
    video_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── session_attendance ──
  console.log('  → Creating session_attendance table...');
  run(`CREATE TABLE IF NOT EXISTS session_attendance (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
    student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT CHECK (status IN ('present', 'absent', 'late', 'excused')) DEFAULT 'present',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // ── goals ──
  console.log('  → Creating goals table...');
  run(`CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_date TEXT,
    status TEXT CHECK (status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  )`);

  // ── Indexes ──
  console.log('  → Creating indexes...');
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_practice_logs_user_date ON practice_logs(user_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_coach_feedback_student ON coach_feedback(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_coach_feedback_coach ON coach_feedback(coach_id)',
    'CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, read, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_trick_verifications_status_coach ON trick_verifications(status, coach_id)',
    'CREATE INDEX IF NOT EXISTS idx_session_attendance_batch_date ON session_attendance(batch_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status)',
  ];
  indexes.forEach(i => run(i));

  // ── Seed achievements ──
  console.log('  → Seeding default achievements...');
  const achievements = [
    ['first_practice', 'First Practice', 'Log your first practice session', '🛹', 'practice_logs', 1],
    ['ten_sessions', 'Dedicated', 'Complete 10 practice sessions', '🔥', 'practice_logs', 10],
    ['fifty_sessions', 'Committed', 'Complete 50 practice sessions', '💪', 'practice_logs', 50],
    ['hundred_minutes', 'Century', 'Log 100 total minutes of practice', '⏱️', 'practice_logs', 100],
    ['five_hundred_minutes', 'Iron Will', 'Log 500 total minutes of practice', '⚔️', 'practice_logs', 500],
    ['first_goal', 'Goal Setter', 'Create your first goal', '🎯', 'goals_completed', 1],
    ['goal_completed', 'Goal Crusher', 'Complete your first goal', '✅', 'goals_completed', 1],
    ['five_goals', 'Achiever', 'Complete 5 goals', '🏅', 'goals_completed', 5],
    ['seven_day_streak', 'Consistent', 'Maintain a 7-day practice streak', '📅', 'practice_streak', 7],
    ['thirty_day_streak', 'Unstoppable', 'Maintain a 30-day practice streak', '🔥', 'practice_streak', 30],
    ['first_trick_mastered', 'First Mastery', 'Master your first trick', '⭐', 'tricks_mastered', 1],
    ['five_tricks_mastered', 'Trick Collector', 'Master 5 tricks', '🏆', 'tricks_mastered', 5],
  ];

  const insertAchievement = db.db.prepare(`
    INSERT OR IGNORE INTO achievements (key, name, description, icon, criteria_type, criteria_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedTx = db.db.transaction((rows) => {
    for (const [key, name, desc, icon, type, count] of rows) {
      insertAchievement.run(key, name, desc, icon, type, count);
    }
  });

  seedTx(achievements);

  console.log(`  → Seeded ${achievements.length} achievements`);
  console.log('\n✅ Feature extension complete!\n');

} catch (err) {
  console.error('\n❌ Extension failed:', err.message, '\n');
  process.exit(1);
}

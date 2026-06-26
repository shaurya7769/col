require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

const db = require('../src/utils/db');

console.log('\n🔄 Setting up consolidated SQLite database...\n');

function run(sql) {
  return db.query(sql);
}

async function setup() {
  try {
    console.log('  → Dropping existing tables...');
    const tables = [
      'likes', 'comments', 'enrollments', 'trick_mastery', 'follows', 'messages',
      'conversations', 'audit_logs', 'announcements', 'notifications', 'post_shares',
      'hashtags', 'post_mentions', 'reports', 'event_rsvps', 'events', 'progress_media',
      'practice_logs', 'coach_feedback', 'user_achievements', 'achievements',
      'trick_verifications', 'session_attendance', 'goals', 'spots', 'posts', 'batches', 'users'
    ];
    db.db.pragma('foreign_keys = OFF');
    for (const t of tables) {
      run(`DROP TABLE IF EXISTS ${t}`);
    }
    db.db.pragma('foreign_keys = ON');

    console.log('  → Creating core tables...');

    // 1. Users Table
    run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK (role IN ('admin', 'coach', 'student')) DEFAULT 'student',
      avatar_url TEXT DEFAULT 'https://i.pravatar.cc/150?u=default',
      bio TEXT DEFAULT '',
      skatepark_location TEXT DEFAULT '',
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      email_verified INTEGER DEFAULT 0,
      login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      otp TEXT,
      otp_expires_at TEXT,
      two_factor_secret TEXT,
      two_factor_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // 2. Posts Table
    run(`CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      media_url TEXT,
      media_type TEXT CHECK (media_type IN ('image', 'video')),
      caption TEXT,
      related_trick TEXT,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      spot_name TEXT,
      edited_at TEXT,
      is_private INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 3. Likes Table
    run(`CREATE TABLE IF NOT EXISTS likes (
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id)
    )`);

    // 4. Comments Table
    run(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 5. Batches Table
    run(`CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      name TEXT NOT NULL,
      description TEXT,
      coach_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      venue TEXT NOT NULL,
      schedule TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 6. Enrollments Table
    run(`CREATE TABLE IF NOT EXISTS enrollments (
      batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      enrolled_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (batch_id, student_id)
    )`);

    // 7. Trick Mastery Table
    run(`CREATE TABLE IF NOT EXISTS trick_mastery (
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      trick_name TEXT NOT NULL,
      status TEXT CHECK (status IN ('learning', 'mastered', 'not_started')) DEFAULT 'learning',
      notes TEXT,
      coach_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, trick_name)
    )`);

    // 8. Follows Table
    run(`CREATE TABLE IF NOT EXISTS follows (
      follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      followed_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, followed_id)
    )`);

    // 9. Conversations Table
    run(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      participant1_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      participant2_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      last_message_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 10. Messages Table
    run(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 11. Audit Logs Table
    run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      event TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      metadata TEXT DEFAULT '{}',
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 12. Announcements Table
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

    // 13. Notifications Table
    run(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message', 'achievement', 'announcement', 'feedback', 'trick_verified', 'goal_completed', 'mention', 'share')),
      reference_id TEXT,
      content TEXT NOT NULL,
      link TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    console.log('  → Creating social & extension tables...');

    // 14. Post Shares Table
    run(`CREATE TABLE IF NOT EXISTS post_shares (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 15. Hashtags Table
    run(`CREATE TABLE IF NOT EXISTS hashtags (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      tag TEXT NOT NULL,
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 16. Post Mentions Table
    run(`CREATE TABLE IF NOT EXISTS post_mentions (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 17. Reports Table (updated schema matches feed.js query)
    run(`CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending','reviewed','dismissed','actioned')) DEFAULT 'pending',
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    )`);

    // 18. Events Table
    run(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
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

    // 19. Event RSVPs Table
    run(`CREATE TABLE IF NOT EXISTS event_rsvps (
      event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      status TEXT CHECK(status IN ('going','maybe','declined')) NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, user_id)
    )`);

    // 20. Progress Media Table
    run(`CREATE TABLE IF NOT EXISTS progress_media (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      media_type TEXT CHECK(media_type IN ('image','video')) NOT NULL,
      caption TEXT,
      trick_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 21. Practice Logs Table
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

    // 22. Coach Feedback Table
    run(`CREATE TABLE IF NOT EXISTS coach_feedback (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      coach_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 23. Achievements Table
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

    // 24. User Achievements Table
    run(`CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT REFERENCES achievements(id) ON DELETE CASCADE,
      earned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, achievement_id)
    )`);

    // 25. Trick Verifications Table
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

    // 26. Session Attendance Table
    run(`CREATE TABLE IF NOT EXISTS session_attendance (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
      student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT CHECK (status IN ('present', 'absent', 'late', 'excused')) DEFAULT 'present',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // 27. Goals Table
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

    // 28. Spots Table
    run(`CREATE TABLE IF NOT EXISTS spots (
      id TEXT PRIMARY KEY DEFAULT (uuid_generate_v4()),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      media_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    console.log('  → Creating indexes...');

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)',
      'CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_enrollments_batch ON enrollments(batch_id)',
      'CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id)',
      'CREATE INDEX IF NOT EXISTS idx_trick_mastery_user ON trick_mastery(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)',
      'CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_practice_logs_user_date ON practice_logs(user_id, date)',
      'CREATE INDEX IF NOT EXISTS idx_coach_feedback_student ON coach_feedback(student_id)',
      'CREATE INDEX IF NOT EXISTS idx_coach_feedback_coach ON coach_feedback(coach_id)',
      'CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(user_id, read, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_trick_verifications_status_coach ON trick_verifications(status, coach_id)',
      'CREATE INDEX IF NOT EXISTS idx_session_attendance_batch_date ON session_attendance(batch_id, date)',
      'CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON hashtags(tag)',
      'CREATE INDEX IF NOT EXISTS idx_progress_media_user ON progress_media(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_spots_location ON spots(latitude, longitude)',
      'CREATE INDEX IF NOT EXISTS idx_posts_geo ON posts(latitude, longitude)',
    ];
    indexes.forEach(i => run(i));

    console.log('  → Creating unique index for conversations...');
    run(`CREATE UNIQUE INDEX IF NOT EXISTS conv_participants_unique ON conversations (
      CASE WHEN participant1_id < participant2_id THEN participant1_id ELSE participant2_id END,
      CASE WHEN participant1_id < participant2_id THEN participant2_id ELSE participant1_id END
    )`);

    console.log('  → Seeding demo data...');

    const coachHash = await bcrypt.hash('CoachPass1!', 10);
    const studentHash = await bcrypt.hash('StudentPass1!', 10);

    const adminResult = db.query(
      `INSERT INTO users (username, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, 1) RETURNING id`,
      ['Admin', 'admin@escape.app', coachHash, 'admin']
    );
    const adminId = adminResult.rows[0]?.id;

    const coachResult = db.query(
      `INSERT INTO users (username, email, password_hash, role, email_verified, avatar_url)
       VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
      ['Coach Alex', 'alex@skate.academy', coachHash, 'coach', 'https://i.pravatar.cc/150?u=alex']
    );
    const coachId = coachResult.rows[0]?.id;

    const studentResult = db.query(
      `INSERT INTO users (username, email, password_hash, role, email_verified, avatar_url)
       VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
      ['SkateStudent', 'student@skate.academy', studentHash, 'student', 'https://i.pravatar.cc/150?u=student']
    );
    const studentId = studentResult.rows[0]?.id;

    if (coachId && studentId) {
      db.query(
        `INSERT INTO posts (user_id, media_url, media_type, caption, related_trick)
         VALUES ($1, $2, $3, $4, $5)`,
        [coachId, 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', 'video', 'Landed the kickflip after 3 weeks of practice! #skate #progress', 'Kickflip']
      );

      const postResult = db.query(
        `INSERT INTO posts (user_id, media_url, media_type, caption)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [studentId, 'https://images.unsplash.com/photo-1564982752979-3f7cb9a4ca47', 'image', 'Sunset session at the park']
      );

      if (postResult.rows[0]?.id) {
        db.query(
          'INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [postResult.rows[0].id, studentId]
        );
      }

      const batchResult = db.query(
        `INSERT INTO batches (name, description, coach_id, venue, schedule)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Morning Shredders', 'Early morning technical session', coachId, 'Burnside Skatepark', 'Mon, Wed, Fri - 8:00 AM']
      );

      if (batchResult.rows[0]?.id) {
        db.query(
          'INSERT INTO enrollments (batch_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [batchResult.rows[0].id, studentId]
        );
      }

      db.query("INSERT INTO trick_mastery (user_id, trick_name, status) VALUES ($1, $2, $3)", [studentId, 'Ollie', 'mastered']);
      db.query("INSERT INTO trick_mastery (user_id, trick_name, status) VALUES ($1, $2, $3)", [studentId, 'Kickflip', 'learning']);
      db.query("INSERT INTO trick_mastery (user_id, trick_name, status) VALUES ($1, $2, $3)", [studentId, 'Heelflip', 'learning']);
    }

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

    console.log('\n✅ Database setup complete!');
    console.log('\n📋 Demo accounts:');
    console.log('   Admin:      admin@escape.app / CoachPass1!');
    console.log('   Coach:      alex@skate.academy / CoachPass1!');
    console.log('   Student:    student@skate.academy / StudentPass1!');
    console.log('\n⚠️  OTP codes sent via Gmail SMTP (if SMTP_USER/PASS configured in .env).');
    console.log('   Falls back to console logging if SMTP not set.\n');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message, '\n');
    process.exit(1);
  }
}

setup();

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:playarena2025!@db.wrwvrzqrlepprtqqkdex.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function resetAndSeed() {
  console.log('🔥 Connecting to database to format and spin the narrative...');
  try {
    // 1. Wipe Everything
    await pool.query('DELETE FROM messages;');
    await pool.query('DELETE FROM follows;');
    await pool.query('DELETE FROM trick_mastery;');
    await pool.query('DELETE FROM posts;');
    await pool.query('DELETE FROM batches;');
    await pool.query('DELETE FROM users;');
    console.log('✅ Database completely cleared of previous records.');

    // 2. Setup Base Passwords
    const salt = await bcrypt.genSalt(10);
    const pass = await bcrypt.hash('playarena2025', salt);

    // 3. Insert Story Characters
    console.log('✅ Injecting Characters (Admin, Coach Mark, Athlete Alex)...');
    const resAdmin = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, skatepark_location, bio, followers_count, following_count) 
       VALUES ('Director', 'admin@escape.app', $1, 'admin', 'Play Arena', 'Platform Director covering overall analytics.', 0, 0) RETURNING id`,
      [pass]
    );
    const resCoach = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, skatepark_location, bio, followers_count, following_count) 
       VALUES ('Coach Mark', 'coach@escape.app', $1, 'coach', 'Play Arena', 'Former pro. Focuses on technical street skating and contest runs.', 1, 1) RETURNING id`,
      [pass]
    );
    const resStudent = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, skatepark_location, bio, followers_count, following_count) 
       VALUES ('AlexTheSkater', 'student@escape.app', $1, 'student', 'Play Arena', 'Pushing for AM circuit next year. Grinding flip tricks.', 1, 1) RETURNING id`,
      [pass]
    );

    const coachId = resCoach.rows[0].id;
    const studentId = resStudent.rows[0].id;
    const adminId = resAdmin.rows[0].id;

    // 4. Followers & Networking
    await pool.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)', [coachId, studentId]);
    await pool.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)', [studentId, coachId]);

    // 5. Athlete Professional Trick Development Plan
    console.log('✅ Generating Athlete Professional Plan & Analytics...');
    
    // Core foundations mastered
    await pool.query(
      `INSERT INTO trick_mastery (user_id, coach_id, trick_name, status, notes) VALUES 
       ($1, $2, 'Ollie', 'mastered', 'Great pop and height. Consistency is 95%.'),
       ($1, $2, 'Frontside 180', 'mastered', 'Smooth landing, good shoulder rotation.'),
       ($1, $2, 'Backside 180', 'mastered', 'Little sketch on the pivot but passed.'),
       ($1, $2, 'Pop Shove-it', 'learning', 'Catching it too late, need to jump forward slightly.'),
       ($1, $2, 'Kickflip', 'learning', 'Flick is strong, but back foot keeps stepping off.')`,
      [studentId, coachId]
    );

    // 6. Social Ecosystem & Progress Posts
    console.log('✅ Generating Social Echoes & Proof of Work...');
    await pool.query(
      `INSERT INTO posts (user_id, media_url, media_type, caption, likes_count, created_at) VALUES 
       ($1, '/sample-kickflip.mp4', 'video', 'Just dropped a complete technical review on Alex''s Kickflip attempts today. We are breaking down the slow-mo right now! The focus is strictly on back-foot retention.', 4, NOW() - INTERVAL '2 days'),
       ($2, '/sample-ollie.jpg', 'image', 'Honestly the kickflips are driving me crazy, but Coach Mark showed me how my shoulders were opening up. Back to the lab tomorrow 🛹🔥', 12, NOW() - INTERVAL '1 day'),
       ($1, '/sample-transition.jpg', 'image', 'Next week we start transition basics on the mini ramp. Ensure your trucks are tightened symmetrically.', 2, NOW())`,
      [coachId, studentId]
    );

    // 7. Calendar Sessions
    console.log('✅ Syncing Calendar Events for Training...');
    const bRes = await pool.query(
      `INSERT INTO batches (name, coach_id, start_time, end_time, venue, description, schedule) VALUES 
       ('Kickflip Clinical Session', $1, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '2 hours', 'Play Arena Zone B', 'Break down foot positioning.', 'Mon/Wed/Fri'),
       ('Transition Basics 101', $1, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days' + INTERVAL '3 hours', 'Play Arena Bowl', 'Bring pads, focus on pumping.', 'Tue/Thu') RETURNING id`,
       [coachId]
    );

    // Enroll the student
    await pool.query('INSERT INTO enrollments (batch_id, student_id) VALUES ($1, $2), ($3, $2)', [bRes.rows[0].id, studentId, bRes.rows[1].id]);

    // 8. Communications / DMs
    console.log('✅ Injecting Coach-to-Athlete Feedback Loop...');
    const chatRes = await pool.query(
      `INSERT INTO conversations (participant1_id, participant2_id) VALUES ($1, $2) RETURNING id`,
      [studentId, coachId]
    );
    const chatId = chatRes.rows[0].id;

    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, created_at) VALUES 
       ($1, $2, 'Hey Coach, I watched the tape you sent from yesterday.', NOW() - INTERVAL '4 hours'),
       ($1, $3, 'Great. Did you notice what your back foot was doing right after the pop?', NOW() - INTERVAL '3 hours'),
       ($1, $2, 'Yeah, stepping straight to the ground. Im jumping away instead of committing.', NOW() - INTERVAL '2 hours'),
       ($1, $3, 'Exactly. For tomorrows session, we are doing 50 attempts holding onto the rail to force commitment. Get ready.', NOW() - INTERVAL '1 hour')`,
      [chatId, studentId, coachId]
    );

    console.log('\\n🚀 ==========================================');
    console.log('STORY GENERATION COMPLETE. The Ecosystem is ALIVE.');
    console.log('Admin:   admin@escape.app    (playarena2025)');
    console.log('Coach:   coach@escape.app    (playarena2025)');
    console.log('Student: student@escape.app  (playarena2025)');
    console.log('==========================================🚀\\n');
    
  } catch (err) {
    console.error('❌ SEED ERROR:', err.message);
  } finally {
    pool.end();
  }
}

resetAndSeed();

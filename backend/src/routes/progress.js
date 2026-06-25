const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { log, AUDIT_EVENTS } = require('../utils/audit');

const router = express.Router();

const createNotification = async (userId, message, type, relatedId = null) => {
  await db.query(
    `INSERT INTO notifications (user_id, content, type, reference_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, message, type, relatedId]
  );
};

const getStudentIdsForCoach = async (coachId) => {
  const { rows } = await db.query(
    `SELECT DISTINCT e.student_id FROM enrollments e
     JOIN batches b ON e.batch_id = b.id
     WHERE b.coach_id = $1`,
    [coachId]
  );
  return rows.map(r => r.student_id);
};

const calculateStreak = async (userId) => {
  const { rows } = await db.query(
    `SELECT DISTINCT date FROM practice_logs
     WHERE user_id = $1 ORDER BY date DESC`,
    [userId]
  );

  if (rows.length === 0) return { current: 0, longest: 0 };

  const rawDates = rows.map(r => r.date);

  const uniqueSorted = [...new Set(rawDates.map(d => {
    const dt = new Date(d + (typeof d === 'string' && d.includes('T') ? '' : 'T00:00:00'));
    return dt.toISOString().split('T')[0];
  }))].sort();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  let current = 0;
  let checkDate = todayStr;
  for (const dateStr of uniqueSorted.reverse()) {
    const d1 = new Date(checkDate + 'T00:00:00');
    const d2 = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
    if (diff === 0 || diff === 1) {
      current++;
      checkDate = dateStr;
    } else if (diff > 1) {
      break;
    }
  }

  let longest = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueSorted.length; i++) {
    const p = new Date(uniqueSorted[i - 1] + 'T00:00:00');
    const c = new Date(uniqueSorted[i] + 'T00:00:00');
    const diff = Math.round((c - p) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      tempStreak++;
    } else {
      longest = Math.max(longest, tempStreak);
      tempStreak = 1;
    }
  }
  longest = Math.max(longest, tempStreak);

  return { current, longest };
};

const checkAchievements = async (userId) => {
  const achievements = [
    { key: 'first_practice', name: 'First Practice', description: 'Log your first practice session' },
    { key: 'ten_sessions', name: 'Dedicated', description: 'Complete 10 practice sessions' },
    { key: 'fifty_sessions', name: 'Committed', description: 'Complete 50 practice sessions' },
    { key: 'hundred_minutes', name: 'Century', description: 'Log 100 total minutes of practice' },
    { key: 'five_hundred_minutes', name: 'Iron Will', description: 'Log 500 total minutes of practice' },
    { key: 'first_goal', name: 'Goal Setter', description: 'Create your first goal' },
    { key: 'goal_completed', name: 'Goal Crusher', description: 'Complete your first goal' },
    { key: 'five_goals', name: 'Achiever', description: 'Complete 5 goals' },
    { key: 'seven_day_streak', name: 'Consistent', description: 'Maintain a 7-day practice streak' },
    { key: 'thirty_day_streak', name: 'Unstoppable', description: 'Maintain a 30-day practice streak' },
    { key: 'first_trick_mastered', name: 'First Mastery', description: 'Master your first trick' },
    { key: 'five_tricks_mastered', name: 'Trick Collector', description: 'Master 5 tricks' },
  ];

  for (const ach of achievements) {
    const existing = await db.query(
      `SELECT 1 FROM user_achievements ua
       JOIN achievements a ON ua.achievement_id = a.id
       WHERE ua.user_id = $1 AND a.key = $2`,
      [userId, ach.key]
    );
    if (existing.rows.length > 0) continue;

    let earned = false;

    switch (ach.key) {
      case 'first_practice': {
        const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM practice_logs WHERE user_id = $1', [userId]);
        earned = rows[0].c >= 1;
        break;
      }
      case 'ten_sessions': {
        const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM practice_logs WHERE user_id = $1', [userId]);
        earned = rows[0].c >= 10;
        break;
      }
      case 'fifty_sessions': {
        const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM practice_logs WHERE user_id = $1', [userId]);
        earned = rows[0].c >= 50;
        break;
      }
      case 'hundred_minutes': {
        const { rows } = await db.query('SELECT COALESCE(SUM(duration_minutes), 0)::int AS t FROM practice_logs WHERE user_id = $1', [userId]);
        earned = rows[0].t >= 100;
        break;
      }
      case 'five_hundred_minutes': {
        const { rows } = await db.query('SELECT COALESCE(SUM(duration_minutes), 0)::int AS t FROM practice_logs WHERE user_id = $1', [userId]);
        earned = rows[0].t >= 500;
        break;
      }
      case 'first_goal': {
        const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM goals WHERE user_id = $1', [userId]);
        earned = rows[0].c >= 1;
        break;
      }
      case 'goal_completed': {
        const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM goals WHERE user_id = $1 AND status = 'completed'", [userId]);
        earned = rows[0].c >= 1;
        break;
      }
      case 'five_goals': {
        const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM goals WHERE user_id = $1 AND status = 'completed'", [userId]);
        earned = rows[0].c >= 5;
        break;
      }
      case 'seven_day_streak': {
        const streak = await calculateStreak(userId);
        earned = streak.current >= 7;
        break;
      }
      case 'thirty_day_streak': {
        const streak = await calculateStreak(userId);
        earned = streak.current >= 30;
        break;
      }
      case 'first_trick_mastered': {
        const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM trick_mastery WHERE user_id = $1 AND status = 'mastered'", [userId]);
        earned = rows[0].c >= 1;
        break;
      }
      case 'five_tricks_mastered': {
        const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM trick_mastery WHERE user_id = $1 AND status = 'mastered'", [userId]);
        earned = rows[0].c >= 5;
        break;
      }
    }

    if (earned) {
      let { rows: achRows } = await db.query('SELECT id FROM achievements WHERE key = $1', [ach.key]);
      let achievementId;
      if (achRows.length === 0) {
        const result = await db.query(
          'INSERT INTO achievements (key, name, description) VALUES ($1, $2, $3) RETURNING id',
          [ach.key, ach.name, ach.description]
        );
        achievementId = result.rows[0].id;
      } else {
        achievementId = achRows[0].id;
      }

      await db.query(
        'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, achievementId]
      );

      await createNotification(userId, `Achievement unlocked: ${ach.name}!`, 'achievement', achievementId);
    }
  }
};

// ============================================================
// TRICKS
// ============================================================

router.get('/pending', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    if (req.user.role === 'coach') {
      const studentIds = await getStudentIdsForCoach(req.user.id);
      if (studentIds.length === 0) {
        return res.json({ success: true, data: [] });
      }
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db.query(
        `SELECT tv.id, tv.trick_name, tv.video_url, tv.status, tv.coach_notes, tv.created_at,
                u.id AS student_id, u.username AS student_username
         FROM trick_verifications tv
         JOIN users u ON tv.user_id = u.id
         WHERE tv.user_id IN (${placeholders}) AND tv.status = 'pending'
         ORDER BY tv.created_at DESC`,
        studentIds
      );
      return res.json({ success: true, data: rows });
    }

    const { rows } = await db.query(
      `SELECT tv.id, tv.trick_name, tv.video_url, tv.status, tv.coach_notes, tv.created_at,
              u.id AS student_id, u.username AS student_username
       FROM trick_verifications tv
       JOIN users u ON tv.user_id = u.id
       WHERE tv.status = 'pending'
       ORDER BY tv.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/verify', auth, authorize('student'), async (req, res, next) => {
  try {
    const { trick_name, video_url } = req.body;
    if (!trick_name) {
      return res.status(400).json({ success: false, message: 'trick_name is required.' });
    }

    const existing = await db.query(
      'SELECT 1 FROM trick_mastery WHERE user_id = $1 AND trick_name = $2',
      [req.user.id, trick_name]
    );
    if (existing.rows.length === 0) {
      await db.query(
        "INSERT INTO trick_mastery (user_id, trick_name, status) VALUES ($1, $2, 'learning')",
        [req.user.id, trick_name]
      );
    }

    const { rows } = await db.query(
      `INSERT INTO trick_verifications (user_id, trick_name, video_url, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [req.user.id, trick_name, video_url || null]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.put('/verify/:id', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { status, coach_notes } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be approved or rejected.' });
    }

    const verification = await db.query(
      'SELECT * FROM trick_verifications WHERE id = $1',
      [req.params.id]
    );
    if (verification.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Verification not found.' });
    }

    const ver = verification.rows[0];

    await db.query(
      `UPDATE trick_verifications SET status = $1, coach_notes = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [status, coach_notes || null, req.user.id, req.params.id]
    );

    if (status === 'approved') {
      await db.query(
        "UPDATE trick_mastery SET status = 'mastered', updated_at = NOW() WHERE user_id = $1 AND trick_name = $2",
        [ver.user_id, ver.trick_name]
      );
      await createNotification(ver.user_id, `Your trick "${ver.trick_name}" has been approved!`, 'trick_approved', ver.id);
      await checkAchievements(ver.user_id);
    } else {
      await createNotification(
        ver.user_id,
        `Your trick "${ver.trick_name}" was not approved.${coach_notes ? ` Notes: ${coach_notes}` : ''}`,
        'trick_rejected',
        ver.id
      );
    }

    await log('trick_verified', req.user.id, {
      verificationId: ver.id,
      userId: ver.user_id,
      trick_name: ver.trick_name,
      status,
    }, req.ip);

    const { rows } = await db.query('SELECT * FROM trick_verifications WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.get('/my-verifications', auth, authorize('student'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM trick_verifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ============================================================
// PRACTICE LOGS
// ============================================================

router.get('/practice-logs', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    if (role === 'student') {
      const { rows } = await db.query(
        'SELECT * FROM practice_logs WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      const countRes = await db.query('SELECT COUNT(*)::int AS count FROM practice_logs WHERE user_id = $1', [userId]);
      return res.json({ success: true, data: rows, page, limit, total: countRes.rows[0].count });
    }

    if (role === 'coach') {
      const studentId = req.query.student_id;
      if (studentId) {
        const { rows } = await db.query(
          `SELECT pl.*, u.username FROM practice_logs pl JOIN users u ON pl.user_id = u.id
           WHERE pl.user_id = $1 ORDER BY pl.date DESC LIMIT $2 OFFSET $3`,
          [studentId, limit, offset]
        );
        return res.json({ success: true, data: rows, page, limit });
      }
      const studentIds = await getStudentIdsForCoach(userId);
      if (studentIds.length === 0) {
        return res.json({ success: true, data: [], page, limit, total: 0 });
      }
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db.query(
        `SELECT pl.*, u.username FROM practice_logs pl
         JOIN users u ON pl.user_id = u.id
         WHERE pl.user_id IN (${placeholders})
         ORDER BY pl.date DESC LIMIT $${studentIds.length + 1} OFFSET $${studentIds.length + 2}`,
        [...studentIds, limit, offset]
      );
      return res.json({ success: true, data: rows, page, limit });
    }

    const { rows } = await db.query(
      `SELECT pl.*, u.username FROM practice_logs pl
       JOIN users u ON pl.user_id = u.id
       ORDER BY pl.date DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ success: true, data: rows, page, limit });
  } catch (err) { next(err); }
});

router.post('/practice-logs', auth, async (req, res, next) => {
  try {
    const { date, duration_minutes, notes, tricks_practiced, mood } = req.body;

    if (!date || isNaN(Date.parse(date))) {
      return res.status(400).json({ success: false, message: 'Valid date is required.' });
    }
    if (!duration_minutes || parseInt(duration_minutes) <= 0) {
      return res.status(400).json({ success: false, message: 'duration_minutes must be a positive number.' });
    }
    if (mood !== undefined && (mood < 1 || mood > 5)) {
      return res.status(400).json({ success: false, message: 'mood must be between 1 and 5.' });
    }

    const { rows } = await db.query(
      `INSERT INTO practice_logs (user_id, date, duration_minutes, notes, tricks_practiced, mood)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.user.id,
        date,
        parseInt(duration_minutes),
        notes || null,
        tricks_practiced ? JSON.stringify(tricks_practiced) : null,
        mood || null,
      ]
    );

    await checkAchievements(req.user.id);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.get('/practice-logs/stats', auth, async (req, res, next) => {
  try {
    const userId = req.user.role === 'coach' && req.query.student_id
      ? req.query.student_id
      : req.user.id;

    const [totalRes, sumRes, moodRes, weekRes, monthRes, streak] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM practice_logs WHERE user_id = $1', [userId]),
      db.query('SELECT COALESCE(SUM(duration_minutes), 0)::int AS total FROM practice_logs WHERE user_id = $1', [userId]),
      db.query('SELECT AVG(CAST(mood AS REAL)) AS avg_mood FROM practice_logs WHERE user_id = $1 AND mood IS NOT NULL', [userId]),
      db.query("SELECT COALESCE(SUM(duration_minutes), 0)::int AS minutes FROM practice_logs WHERE user_id = $1 AND date >= date('now', '-7 days')", [userId]),
      db.query("SELECT COUNT(*)::int AS sessions FROM practice_logs WHERE user_id = $1 AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')", [userId]),
      calculateStreak(userId),
    ]);

    res.json({
      success: true,
      data: {
        total_sessions: totalRes.rows[0].count,
        total_minutes: sumRes.rows[0].total,
        current_streak: streak.current,
        longest_streak: streak.longest,
        average_mood: moodRes.rows[0].avg_mood !== null ? Math.round(moodRes.rows[0].avg_mood * 10) / 10 : null,
        this_week_minutes: weekRes.rows[0].minutes,
        this_month_sessions: monthRes.rows[0].sessions,
      },
    });
  } catch (err) { next(err); }
});

router.delete('/practice-logs/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT user_id FROM practice_logs WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Practice log not found.' });
    }
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this log.' });
    }

    await db.query('DELETE FROM practice_logs WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Practice log deleted.' });
  } catch (err) { next(err); }
});

// ============================================================
// COACH FEEDBACK
// ============================================================

router.get('/feedback', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'student') {
      const { rows } = await db.query(
        `SELECT cf.*, u.username AS coach_username
         FROM coach_feedback cf
         JOIN users u ON cf.coach_id = u.id
         WHERE cf.student_id = $1
         ORDER BY cf.created_at DESC`,
        [userId]
      );
      return res.json({ success: true, data: rows });
    }

    if (role === 'coach') {
      const studentId = req.query.student_id;
      if (studentId) {
        const { rows } = await db.query(
          `SELECT cf.*, u.username AS coach_username
           FROM coach_feedback cf
           JOIN users u ON cf.coach_id = u.id
           WHERE cf.student_id = $1
           ORDER BY cf.created_at DESC`,
          [studentId]
        );
        return res.json({ success: true, data: rows });
      }
      const { rows } = await db.query(
        `SELECT cf.*, u.username AS coach_username
         FROM coach_feedback cf
         JOIN users u ON cf.coach_id = u.id
         WHERE cf.coach_id = $1
         ORDER BY cf.created_at DESC`,
        [userId]
      );
      return res.json({ success: true, data: rows });
    }

    const { rows } = await db.query(
      `SELECT cf.*, u.username AS coach_username
       FROM coach_feedback cf
       JOIN users u ON cf.coach_id = u.id
       ORDER BY cf.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/feedback', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { student_id, content, rating, batch_id } = req.body;

    if (!student_id || !content || rating === undefined) {
      return res.status(400).json({ success: false, message: 'student_id, content, and rating are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be between 1 and 5.' });
    }

    const studentCheck = await db.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'student'",
      [student_id]
    );
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const { rows } = await db.query(
      `INSERT INTO coach_feedback (coach_id, student_id, content, rating, batch_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, student_id, content, rating, batch_id || null]
    );

    const coachRes = await db.query('SELECT username FROM users WHERE id = $1', [req.user.id]);
    const coachUsername = coachRes.rows[0].username;

    await createNotification(
      student_id,
      `Coach ${coachUsername} left you feedback (${rating}/5).`,
      'feedback',
      rows[0].id
    );

    await log('feedback_created', req.user.id, {
      feedbackId: rows[0].id,
      studentId: student_id,
      rating,
    }, req.ip);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// ============================================================
// ACHIEVEMENTS
// ============================================================

router.get('/achievements', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, CASE WHEN ua.achievement_id IS NOT NULL THEN 1 ELSE 0 END AS earned,
              ua.earned_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
       ORDER BY a.id`,
      [req.user.id]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, earned: !!r.earned })) });
  } catch (err) { next(err); }
});

router.get('/achievements/user/:userId', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, ua.earned_at
       FROM achievements a
       JOIN user_achievements ua ON a.id = ua.achievement_id
       WHERE ua.user_id = $1
       ORDER BY ua.earned_at DESC`,
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ============================================================
// GOALS
// ============================================================

router.get('/goals', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const statusFilter = req.query.status;

    let query;
    let params;

    if (role === 'student') {
      query = 'SELECT g.* FROM goals g WHERE g.user_id = $1';
      params = [userId];
    } else if (role === 'coach') {
      const studentId = req.query.student_id;
      if (studentId) {
        query = 'SELECT g.* FROM goals g WHERE g.user_id = $1';
        params = [studentId];
      } else {
        const studentIds = await getStudentIdsForCoach(userId);
        if (studentIds.length === 0) {
          return res.json({ success: true, data: [] });
        }
        const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(', ');
        query = `SELECT g.*, u.username FROM goals g JOIN users u ON g.user_id = u.id WHERE g.user_id IN (${placeholders})`;
        params = studentIds;
      }
    } else {
      query = 'SELECT g.*, u.username FROM goals g JOIN users u ON g.user_id = u.id';
      params = [];
    }

    if (statusFilter) {
      query += ' AND g.status = $' + (params.length + 1);
      params.push(statusFilter);
    }

    query += " ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, CASE WHEN g.target_date IS NULL THEN 1 ELSE 0 END, g.target_date ASC";

    const { rows } = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/goals', auth, async (req, res, next) => {
  try {
    const { title, description, target_date } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required.' });
    }

    const { rows } = await db.query(
      `INSERT INTO goals (user_id, title, description, target_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title, description || null, target_date || null]
    );

    await checkAchievements(req.user.id);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.put('/goals/:id', auth, async (req, res, next) => {
  try {
    const goal = await db.query(
      'SELECT * FROM goals WHERE id = $1',
      [req.params.id]
    );
    if (goal.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Goal not found.' });
    }
    if (goal.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this goal.' });
    }

    const { title, description, target_date, status } = req.body;

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = $' + (params.length + 1)); params.push(title); }
    if (description !== undefined) { updates.push('description = $' + (params.length + 1)); params.push(description); }
    if (target_date !== undefined) { updates.push('target_date = $' + (params.length + 1)); params.push(target_date); }
    if (status !== undefined) {
      updates.push('status = $' + (params.length + 1));
      params.push(status);
      if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    params.push(req.params.id);
    const query = 'UPDATE goals SET ' + updates.join(', ') + ' WHERE id = $' + params.length + ' RETURNING *';

    const { rows } = await db.query(query, params);

    if (status === 'completed') {
      await checkAchievements(goal.rows[0].user_id);
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/goals/:id', auth, async (req, res, next) => {
  try {
    const goal = await db.query(
      'SELECT user_id FROM goals WHERE id = $1',
      [req.params.id]
    );
    if (goal.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Goal not found.' });
    }
    if (goal.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this goal.' });
    }

    await db.query('DELETE FROM goals WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Goal deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;

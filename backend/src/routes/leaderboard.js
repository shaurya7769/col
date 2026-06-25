const express = require('express');
const db = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const LEADERBOARD_QUERIES = {
  tricks: `
    SELECT u.id, u.username, u.avatar_url, COUNT(tm.trick_name) AS score
    FROM users u
    JOIN trick_mastery tm ON u.id = tm.user_id
    WHERE tm.status = 'mastered' AND u.role = 'student'
  `,
  sessions: `
    SELECT u.id, u.username, u.avatar_url, COUNT(pl.id) AS score,
      COALESCE(SUM(pl.duration_minutes), 0) AS total_minutes
    FROM users u
    LEFT JOIN practice_logs pl ON u.id = pl.user_id
    WHERE u.role = 'student'
  `,
  streak: `
    SELECT u.id, u.username, u.avatar_url, COALESCE(s.streak, 0) AS score
    FROM users u
    LEFT JOIN (
      SELECT user_id, MAX(current_streak) AS streak FROM practice_logs GROUP BY user_id
    ) s ON u.id = s.user_id
    WHERE u.role = 'student'
  `,
};

router.get('/', auth, async (req, res, next) => {
  try {
    const type = req.query.type || 'tricks';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const batchId = req.query.batch_id;

    if (!['tricks', 'sessions', 'streak'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be one of: tricks, sessions, streak.' });
    }

    let baseSql = LEADERBOARD_QUERIES[type];
    const params = [];
    let idx = 1;

    if (batchId) {
      baseSql += ` JOIN enrollments e ON u.id = e.student_id AND e.batch_id = $${idx++}`;
    }

    baseSql += ' GROUP BY u.id ORDER BY score DESC';
    baseSql += ` LIMIT $${idx++}`;

    params.push(limit);

    const { rows } = await db.query(baseSql, params);

    const data = rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      username: r.username,
      avatar_url: r.avatar_url,
      score: r.score,
      ...(type === 'sessions' ? { total_minutes: r.total_minutes } : {}),
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/my-rank', auth, async (req, res, next) => {
  try {
    const type = req.query.type || 'tricks';

    if (!['tricks', 'sessions', 'streak'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be one of: tricks, sessions, streak.' });
    }

    let baseSql = LEADERBOARD_QUERIES[type];
    const batchId = req.query.batch_id;
    const params = [];
    let idx = 1;

    if (batchId) {
      baseSql += ` JOIN enrollments e ON u.id = e.student_id AND e.batch_id = $${idx++}`;
    }

    baseSql += ' GROUP BY u.id ORDER BY score DESC';

    const { rows } = await db.query(baseSql, params);

    const currentUserIndex = rows.findIndex(r => r.id === req.user.id);
    const total = rows.length;
    const currentUser = rows[currentUserIndex] || null;

    res.json({
      success: true,
      data: {
        rank: currentUserIndex >= 0 ? currentUserIndex + 1 : null,
        score: currentUser ? currentUser.score : 0,
        ...(type === 'sessions' && currentUser ? { total_minutes: currentUser.total_minutes } : {}),
        total_participants: total,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

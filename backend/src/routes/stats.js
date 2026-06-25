const express = require('express');
const db = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  // Redirect /stats to /stats/summary
  try {
    const { id: userId, role } = req.user;
    if (role === 'coach') {
      const [batchRows, studentRows] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM batches WHERE coach_id = $1', [userId]),
        db.query(`SELECT COUNT(DISTINCT student_id)::int AS count FROM enrollments e JOIN batches b ON e.batch_id = b.id WHERE b.coach_id = $1`, [userId]),
      ]);
      return res.json({ success: true, data: { batches: batchRows.rows[0].count, students: studentRows.rows[0].count } });
    }
    if (role === 'student') {
      const [enrollments, trickCount] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM enrollments WHERE student_id = $1', [userId]),
        db.query("SELECT COUNT(*)::int AS count FROM trick_mastery WHERE user_id = $1 AND status = 'mastered'", [userId]),
      ]);
      return res.json({ success: true, data: { enrollments: enrollments.rows[0].count, tricks_mastered: trickCount.rows[0].count } });
    }
    res.json({ success: true, data: { role: 'admin' } });
  } catch (err) { next(err); }
});

router.get('/summary', auth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;

    if (role === 'coach') {
      const [batchRows, studentRows, topStudents, recentActivity] = await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM batches WHERE coach_id = $1', [userId]),
        db.query(`SELECT COUNT(DISTINCT student_id)::int AS count FROM enrollments e JOIN batches b ON e.batch_id = b.id WHERE b.coach_id = $1`, [userId]),
        db.query(`
          SELECT u.username, COUNT(tm.trick_name)::int AS mastered,
            (SELECT COUNT(*)::int FROM trick_mastery WHERE user_id = u.id) AS total
          FROM users u
          JOIN enrollments e ON u.id = e.student_id
          JOIN batches b ON e.batch_id = b.id
          LEFT JOIN trick_mastery tm ON u.id = tm.user_id AND tm.status = 'mastered'
          WHERE b.coach_id = $1
          GROUP BY u.id, u.username ORDER BY mastered DESC LIMIT 5
        `, [userId]),
        db.query(`
          SELECT b.name, COUNT(e.student_id)::int AS students
          FROM batches b LEFT JOIN enrollments e ON b.id = e.batch_id
          WHERE b.coach_id = $1 GROUP BY b.id, b.name ORDER BY b.created_at DESC LIMIT 5
        `, [userId]),
      ]);
      return res.json({
        success: true,
        data: {
          activeBatches: batchRows.rows[0].count,
          totalStudents: studentRows.rows[0].count,
          topStudents: topStudents.rows.map(s => ({
            name: s.username,
            mastered: s.mastered,
            total: s.total,
            pct: s.total > 0 ? Math.round((s.mastered / s.total) * 100) : 0,
            plainEnglish: `${s.mastered} of ${s.total} tricks nailed`,
          })),
          batchBreakdown: recentActivity.rows,
        },
      });
    }

    if (role === 'student') {
      const [masteryRows, totalRows, batchRows, learningTricks] = await Promise.all([
        db.query("SELECT COUNT(*)::int AS count FROM trick_mastery WHERE user_id = $1 AND status = 'mastered'", [userId]),
        db.query('SELECT COUNT(*)::int AS count FROM trick_mastery WHERE user_id = $1', [userId]),
        db.query(`
          SELECT b.name, b.venue, b.schedule, b.start_time FROM batches b
          JOIN enrollments e ON b.id = e.batch_id WHERE e.student_id = $1
          ORDER BY b.start_time IS NULL, b.start_time ASC LIMIT 1
        `, [userId]),
        db.query("SELECT trick_name FROM trick_mastery WHERE user_id = $1 AND status = 'learning'", [userId]),
      ]);

      const mastered = masteryRows.rows[0].count;
      const total = totalRows.rows[0].count;
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      const level = mastered >= 15 ? 'Pro Skater' : mastered >= 8 ? 'Advanced' : mastered >= 4 ? 'Intermediate' : 'Beginner';

      return res.json({
        success: true,
        data: {
          masteredTricks: mastered,
          totalTricks: total,
          progressPct: pct,
          level,
          plainEnglish: total > 0
            ? `You've mastered ${mastered} out of ${total} tricks — that puts you at ${pct}%! ${pct >= 80 ? 'You\'re crushing it! 🔥' : pct >= 50 ? 'Keep pushing, you\'re halfway there!' : 'Great start — keep practicing!'}`
            : 'No tricks logged yet. Ask your coach to get started!',
          nextSession: batchRows.rows[0] || null,
          roadmap: learningTricks.rows.map(t => t.trick_name),
        },
      });
    }

    if (role !== 'admin')
      return res.status(403).json({ success: false, message: 'Unauthorized.' });

    const [u, b, p, c, roles, growth, locs] = await Promise.all([
      db.query('SELECT COUNT(*)::int AS count FROM users'),
      db.query('SELECT COUNT(*)::int AS count FROM batches'),
      db.query('SELECT COUNT(*)::int AS count FROM posts'),
      db.query('SELECT COUNT(*)::int AS count FROM comments'),
      db.query("SELECT role, COUNT(*)::int AS value FROM users GROUP BY role"),
      db.query(`
        SELECT strftime('%Y-%m-%d', created_at) AS date, COUNT(*) AS users
        FROM users WHERE created_at >= datetime('now', '-7 days')
        GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY date
      `),
      db.query(`SELECT skatepark_location AS name, COUNT(*)::int AS value FROM users WHERE skatepark_location IS NOT NULL GROUP BY skatepark_location ORDER BY value DESC LIMIT 5`),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers: u.rows[0].count, totalBatches: b.rows[0].count, status: 'ONLINE',
        rolesDistribution: roles.rows, growth: growth.rows, locationBreakdown: locs.rows,
        activity: [{ name: 'Posts', value: p.rows[0].count }, { name: 'Comments', value: c.rows[0].count }],
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;

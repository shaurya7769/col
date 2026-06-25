const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { log, AUDIT_EVENTS } = require('../utils/audit');

const router = express.Router();

/** GET /api/admin/users */
router.get('/users', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, username, email, role, skatepark_location, avatar_url,
             followers_count, following_count, created_at AS "createdAt"
      FROM users ORDER BY created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/** PUT /api/admin/users/:id/role */
router.put('/users/:id/role', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['admin', 'coach', 'student'].includes(role))
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    if (String(req.user.id) === id)
      return res.status(403).json({ success: false, message: 'Cannot change your own role.' });

    const { rows } = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
      [role, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    await log(AUDIT_EVENTS.ROLE_CHANGE, rows[0].id, { newRole: role, changedBy: req.user.id }, req.ip);
    res.json({ success: true, message: `Role updated to ${role}`, data: rows[0] });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/users/:id */
router.delete('/users/:id', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (String(req.user.id) === id)
      return res.status(403).json({ success: false, message: 'Cannot delete yourself.' });
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/posts/:id — admin delete any post */
router.delete('/posts/:id', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { rowCount } = await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ success: false, message: 'Post not found.' });
    res.json({ success: true, message: 'Post removed.' });
  } catch (err) { next(err); }
});

/** GET /api/admin/overview — all posts with user info */
router.get('/posts', auth, authorize('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.caption, p.media_type AS "mediaType", p.media_url AS "mediaUrl",
             p.likes_count AS likes, p.created_at AS "createdAt",
             u.username, u.role
      FROM posts p JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/** GET /api/admin/full-stats */
router.get('/full-stats', auth, authorize('admin'), async (req, res, next) => {
  try {
    const [usersRes, batchesRes, postsRes, commentsRes, rolesRes, growthRes, locationRes, trickRes] =
      await Promise.all([
        db.query('SELECT COUNT(*)::int AS count FROM users'),
        db.query('SELECT COUNT(*)::int AS count FROM batches'),
        db.query('SELECT COUNT(*)::int AS count FROM posts'),
        db.query('SELECT COUNT(*)::int AS count FROM comments'),
        db.query("SELECT role, COUNT(*)::int AS value FROM users GROUP BY role"),
        db.query(`
          SELECT strftime('%Y-%m-%d', created_at) AS date, COUNT(*) AS users
          FROM users WHERE created_at >= datetime('now', '-30 days')
          GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY date
        `),
        db.query(`
          SELECT skatepark_location AS location, COUNT(*)::int AS count
          FROM users WHERE skatepark_location IS NOT NULL
          GROUP BY skatepark_location ORDER BY count DESC LIMIT 8
        `),
        db.query(`
          SELECT trick_name AS name, COUNT(*) AS learners,
                 SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) AS mastered
          FROM trick_mastery GROUP BY trick_name ORDER BY learners DESC LIMIT 10
        `),
      ]);

    res.json({
      success: true,
      data: {
        totalUsers: usersRes.rows[0].count,
        totalBatches: batchesRes.rows[0].count,
        totalPosts: postsRes.rows[0].count,
        totalComments: commentsRes.rows[0].count,
        status: 'ONLINE',
        rolesDistribution: rolesRes.rows.map(r => ({ name: r.role, value: r.value })),
        growth: growthRes.rows,
        locationBreakdown: locationRes.rows,
        trickLeaderboard: trickRes.rows,
        activity: [
          { name: 'Posts', value: postsRes.rows[0].count },
          { name: 'Comments', value: commentsRes.rows[0].count },
        ],
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;

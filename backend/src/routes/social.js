const express = require('express');
const db = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/social/follow/:userId
 */
router.post('/follow/:userId', auth, async (req, res, next) => {
  try {
    const followedId = req.params.userId;
    const followerId = req.user.id;
    if (followedId === followerId)
      return res.status(400).json({ success: false, message: "You can't follow yourself." });

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        'INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [followerId, followedId]
      );
      if (rowCount > 0) {
        await client.query('UPDATE users SET following_count = following_count + 1 WHERE id = $1', [followerId]);
        await client.query('UPDATE users SET followers_count = followers_count + 1 WHERE id = $1', [followedId]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ success: true, isFollowing: true });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/social/follow/:userId
 */
router.delete('/follow/:userId', auth, async (req, res, next) => {
  try {
    const followedId = req.params.userId;
    const followerId = req.user.id;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        'DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2',
        [followerId, followedId]
      );
      if (rowCount > 0) {
        await client.query('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1', [followerId]);
        await client.query('UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = $1', [followedId]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.json({ success: true, isFollowing: false });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/profile/:username
 */
router.get('/profile/:username', auth, async (req, res, next) => {
  try {
    const { username } = req.params;
    const viewerId = req.user.id;

    const { rows } = await db.query(
      `SELECT id, username, email, role, avatar_url, bio, skatepark_location, followers_count, following_count, created_at
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found.' });

    const profile = rows[0];

    const [followCheck, postsResult, tricksResult] = await Promise.all([
      db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2', [viewerId, profile.id]),
      db.query(
        `SELECT p.id, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.caption,
                p.likes_count AS likes, p.created_at AS "createdAt", p.related_trick AS "relatedTrick"
         FROM posts p WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 30`,
        [profile.id]
      ),
      db.query(
        `SELECT trick_name AS "trickName", status, notes, updated_at AS "updatedAt"
         FROM trick_mastery WHERE user_id = $1 ORDER BY status DESC, updated_at DESC`,
        [profile.id]
      ),
    ]);

    const mastered = tricksResult.rows.filter(t => t.status === 'mastered').length;
    const total = tricksResult.rows.length;
    const level = mastered >= 15 ? 'Pro' : mastered >= 8 ? 'Advanced' : mastered >= 4 ? 'Intermediate' : 'Beginner';

    res.json({
      success: true,
      data: {
        ...profile,
        isFollowing: followCheck.rows.length > 0,
        isOwnProfile: viewerId === profile.id,
        posts: postsResult.rows,
        trickProgress: tricksResult.rows,
        analytics: { mastered, total, level, progressPct: total > 0 ? Math.round((mastered / total) * 100) : 0 },
      },
    });
  } catch (err) { next(err); }
});

/**
 * PUT /api/social/profile — update own profile
 */
router.put('/profile', auth, async (req, res, next) => {
  try {
    const { bio, avatar_url, skatepark_location } = req.body;
    const { rows } = await db.query(
      `UPDATE users SET
         bio = COALESCE($1, bio),
         avatar_url = COALESCE($2, avatar_url),
         skatepark_location = COALESCE($3, skatepark_location),
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, username, email, role, avatar_url, bio, skatepark_location, followers_count, following_count`,
      [bio || null, avatar_url || null, skatepark_location || null, req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/followers/:userId
 */
router.get('/followers/:userId', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.avatar_url, u.role, u.followers_count, u.skatepark_location
       FROM users u JOIN follows f ON u.id = f.follower_id
       WHERE f.followed_id = $1 ORDER BY f.created_at DESC`,
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/following/:userId
 */
router.get('/following/:userId', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.avatar_url, u.role, u.followers_count, u.skatepark_location
       FROM users u JOIN follows f ON u.id = f.followed_id
       WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/**
 * GET /api/social/search — search users and posts
 */
router.get('/search', auth, async (req, res, next) => {
  try {
    const { q, type = 'users' } = req.query;
    if (!q || q.trim().length < 1) return res.json({ success: true, data: [] });
    const term = `%${q.trim()}%`;

    if (type === 'posts') {
      const { rows } = await db.query(
        `SELECT p.id, p.media_url AS "mediaUrl", p.media_type AS "mediaType", p.caption,
                p.related_trick AS "relatedTrick", p.likes_count AS likes, p.created_at AS "createdAt",
                u.username AS "user_username", u.avatar_url AS "user_avatar"
         FROM posts p JOIN users u ON p.user_id = u.id
         WHERE p.caption LIKE $1 OR p.related_trick LIKE $1
         ORDER BY p.created_at DESC LIMIT 24`,
        [term]
      );
      const data = rows.map(r => ({ ...r, user: { username: r.user_username, avatar: r.user_avatar } }));
      return res.json({ success: true, data });
    }

    const { rows } = await db.query(
      `SELECT id, username, avatar_url, role, followers_count, skatepark_location, bio
       FROM users WHERE username ILIKE $1 OR skatepark_location ILIKE $1
       ORDER BY followers_count DESC LIMIT 24`,
      [term]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;

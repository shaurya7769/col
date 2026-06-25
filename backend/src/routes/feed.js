const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { audit, AUDIT_EVENTS } = require('../utils/audit');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

// ============================================
// Helpers
// ============================================

function parseHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#([\w]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
}

function parseMentions(text) {
  if (!text) return [];
  const matches = text.match(/@(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))];
}

async function saveHashtags(postId, text) {
  await db.query('DELETE FROM hashtags WHERE post_id = $1', [postId]);
  const tags = parseHashtags(text);
  if (tags.length === 0) return;
  const values = tags.map((_, i) => `($1, $${i + 2})`).join(', ');
  const params = [postId, ...tags];
  await db.query(`INSERT INTO hashtags (post_id, tag) VALUES ${values}`, params);
}

async function saveMentions(postId, text, commentId = null, actorUsername = 'Someone') {
  const usernames = parseMentions(text);
  if (usernames.length === 0) return;
  if (commentId) {
    await db.query('DELETE FROM post_mentions WHERE post_id = $1 AND comment_id = $2', [postId, commentId]);
  } else {
    await db.query('DELETE FROM post_mentions WHERE post_id = $1 AND comment_id IS NULL', [postId]);
  }
  if (usernames.length === 0) return;
  const usernamePlaceholders = usernames.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: users } = await db.query(
    `SELECT id, username FROM users WHERE LOWER(username) IN (${usernamePlaceholders})`,
    usernames
  );
  if (users.length === 0) return;
  for (const user of users) {
    await db.query(
      'INSERT INTO post_mentions (post_id, user_id, comment_id) VALUES ($1, $2, $3)',
      [postId, user.id, commentId]
    );
    await db.query(
      `INSERT INTO notifications (user_id, type, reference_id, content)
       VALUES ($1, 'mention', $2, $3)`,
      [user.id, postId, `${actorUsername} mentioned you in a post`]
    );
  }
}

// ============================================
// GET /api/feed — Fetch latest social posts
// ============================================
router.get('/', auth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const feedQuery = `
      SELECT 
        p.id, 
        p.media_url AS "mediaUrl", 
        p.media_type AS "mediaType", 
        p.caption, 
        p.related_trick AS "relatedTrick", 
        p.likes_count AS "likes",
        p.user_id AS "userId",
        p.created_at AS "createdAt",
        u.username AS "user_username",
        u.avatar_url AS "user_avatar",
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    
    const { rows } = await db.query(feedQuery, [limit, offset]);
    const data = rows.map(r => ({
      ...r, user: { username: r.user_username, avatar: r.user_avatar },
    }));
    res.json({ success: true, data, page, limit });
  } catch (err) {
    next(err);
  }
});

const { upload, uploadToSupabase } = require('../utils/storage');

// ============================================
// POST /api/feed — Create a new post (with media upload)
// ============================================
router.post('/', auth, upload.single('mediaFile'), async (req, res, next) => {
  try {
    let { mediaUrl, mediaType, caption, relatedTrick } = req.body;

    // Detect media type automatically if file is uploaded
    if (req.file) {
       mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
       // Upload buffer to Supabase
       mediaUrl = await uploadToSupabase(req.file);
    }

    const insertQuery = `
      INSERT INTO posts (user_id, media_url, media_type, caption, related_trick)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, media_url AS "mediaUrl", media_type AS "mediaType", caption, related_trick AS "relatedTrick", likes_count AS "likes", created_at AS "createdAt"
    `;

    const { rows } = await db.query(insertQuery, [
      req.user.id,
      mediaUrl || null,
      mediaType || null,
      caption || null,
      relatedTrick || null,
    ]);

    const postId = rows[0].id;
    const captionText = caption || '';
    await saveHashtags(postId, captionText);
    await saveMentions(postId, captionText, null, req.user.username);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ============================================
// DELETE /api/feed/:id — Delete own post
// ============================================
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    // Only allow owner or admin to delete
    const check = await db.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    if (check.rows[0].user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this post.' });
    }

    await db.query('DELETE FROM posts WHERE id = $1', [postId]);
    res.json({ success: true, message: 'Post deleted.' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// PUT /api/feed/:id — Edit post caption and/or related_trick
// ============================================
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;
    const { caption, relatedTrick } = req.body;

    if (caption === undefined && relatedTrick === undefined) {
      return res.status(400).json({ success: false, message: 'Nothing to update.' });
    }

    const check = await db.query('SELECT user_id, caption FROM posts WHERE id = $1', [postId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this post.' });
    }

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (caption !== undefined) {
      setClauses.push(`caption = $${paramIndex++}`);
      params.push(caption);
    }
    if (relatedTrick !== undefined) {
      setClauses.push(`related_trick = $${paramIndex++}`);
      params.push(relatedTrick);
    }

    setClauses.push(`edited_at = NOW()`);
    params.push(postId);

    const updateQuery = `
      UPDATE posts SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, media_url AS "mediaUrl", media_type AS "mediaType", caption, related_trick AS "relatedTrick", likes_count AS "likes", created_at AS "createdAt", edited_at AS "editedAt"
    `;

    const { rows } = await db.query(updateQuery, params);

    // Re-parse hashtags and mentions if caption changed
    if (caption !== undefined) {
      await saveHashtags(postId, caption || '');
      await saveMentions(postId, caption || '', null, req.user.username);
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ============================================
// POST /api/feed/:id/like — Toggle a like
// ============================================
router.post('/:id/like', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Check if already liked
      const existing = await client.query(
        'SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      );

      if (existing.rows.length > 0) {
        // Unlike
        await client.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
        await client.query('UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1', [postId]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Post unliked', liked: false });
      } else {
        // Like
        await client.query('INSERT INTO likes (post_id, user_id) VALUES ($1, $2)', [postId, userId]);
        await client.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1', [postId]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Post liked', liked: true });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ============================================
// POST /api/feed/:id/share — Share/reshare a post
// ============================================
router.post('/:id/share', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;

    const postCheck = await db.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    await db.query(
      'INSERT INTO post_shares (post_id, user_id) VALUES ($1, $2)',
      [postId, userId]
    );

    await db.query(
      'UPDATE posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1',
      [postId]
    );

    const ownerId = postCheck.rows[0].user_id;
    if (ownerId !== userId) {
      await db.query(
        `INSERT INTO notifications (user_id, type, reference_id, content)
         VALUES ($1, 'share', $2, $3)`,
        [ownerId, postId, `${req.user.username} shared your post`]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================
// POST /api/feed/:id/report — Report a post
// ============================================
router.post('/:id/report', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Reason is required.' });
    }

    const postCheck = await db.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    await db.query(
      'INSERT INTO reports (post_id, user_id, reason, status) VALUES ($1, $2, $3, $4)',
      [postId, userId, reason.trim(), 'pending']
    );

    res.json({ success: true, message: 'Post reported. Our team will review it.' });
  } catch (err) {
    next(err);
  }
});

// ============================================
// GET /api/feed/:id/comments — Get comments
// ============================================
router.get('/:id/comments', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;

    const commentsQuery = `
      SELECT 
        c.id, c.content, c.created_at AS "createdAt",
        u.username AS "user_username", u.avatar_url AS "user_avatar"
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `;

    const { rows } = await db.query(commentsQuery, [postId]);
    const data = rows.map(r => ({
      ...r, user: { username: r.user_username, avatar: r.user_avatar },
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================
// POST /api/feed/:id/comments — Add comment
// ============================================
router.post('/:id/comments', auth, async (req, res, next) => {
  try {
    const { id: postId } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment content is required.' });
    }

    const insertQuery = `
      INSERT INTO comments (post_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, content, created_at AS "createdAt"
    `;

    const { rows } = await db.query(insertQuery, [postId, req.user.id, content.trim()]);

    // Get the user info for response
    const userResult = await db.query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );

    await saveMentions(postId, content || '', rows[0].id, req.user.username);

    res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        user: {
          username: userResult.rows[0].username,
          avatar: userResult.rows[0].avatar_url,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================
// GET /api/hashtags/trending — Trending hashtags
// ============================================
router.get('/hashtags/trending', auth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const { rows } = await db.query(
      `SELECT tag, COUNT(*)::int AS count
       FROM hashtags
       GROUP BY tag
       ORDER BY count DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ============================================
// GET /api/hashtags/:tag — Posts by hashtag
// ============================================
router.get('/hashtags/:tag', auth, async (req, res, next) => {
  try {
    const { tag } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT 
        p.id, 
        p.media_url AS "mediaUrl", 
        p.media_type AS "mediaType", 
        p.caption, 
        p.related_trick AS "relatedTrick", 
        p.likes_count AS "likes",
        p.user_id AS "userId",
        p.created_at AS "createdAt",
        u.username AS "user_username",
        u.avatar_url AS "user_avatar",
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN hashtags ph ON ph.post_id = p.id
      WHERE ph.tag = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
      [tag.toLowerCase(), limit, offset]
    );

    const data = rows.map(r => ({
      ...r, user: { username: r.user_username, avatar: r.user_avatar },
    }));
    res.json({ success: true, data, page, limit });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

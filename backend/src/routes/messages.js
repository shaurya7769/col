const express = require('express');
const db = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/messages/conversations — list all threads
 */
router.get('/conversations', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(`
      SELECT
        c.id,
        c.last_message_at AS "lastMessageAt",
        CASE WHEN c.participant1_id = $1 THEN p2.id    ELSE p1.id    END AS "otherUserId",
        CASE WHEN c.participant1_id = $1 THEN p2.username ELSE p1.username END AS "otherUsername",
        CASE WHEN c.participant1_id = $1 THEN p2.avatar_url ELSE p1.avatar_url END AS "otherAvatar",
        CASE WHEN c.participant1_id = $1 THEN p2.role ELSE p1.role END AS "otherRole",
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
        (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND read = false) AS "unreadCount"
      FROM conversations c
      JOIN users p1 ON c.participant1_id = p1.id
      JOIN users p2 ON c.participant2_id = p2.id
      WHERE c.participant1_id = $1 OR c.participant2_id = $1
      ORDER BY c.last_message_at DESC
    `, [userId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/**
 * POST /api/messages/conversations — get or create DM thread
 */
router.post('/conversations', auth, async (req, res, next) => {
  try {
    const { otherUserId } = req.body;
    const userId = req.user.id;
    if (!otherUserId)
      return res.status(400).json({ success: false, message: 'otherUserId is required.' });
    if (otherUserId === userId)
      return res.status(400).json({ success: false, message: "Can't message yourself." });

    const existing = await db.query(
      `SELECT id FROM conversations
       WHERE (participant1_id = $1 AND participant2_id = $2)
          OR (participant1_id = $2 AND participant2_id = $1)`,
      [userId, otherUserId]
    );
    if (existing.rows.length > 0)
      return res.json({ success: true, data: existing.rows[0] });

    const { rows } = await db.query(
      'INSERT INTO conversations (participant1_id, participant2_id) VALUES ($1, $2) RETURNING id',
      [userId, otherUserId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/**
 * GET /api/messages/conversations/:id — messages in thread
 */
router.get('/conversations/:id', auth, async (req, res, next) => {
  try {
    const { id: convId } = req.params;
    const userId = req.user.id;

    const check = await db.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)',
      [convId, userId]
    );
    if (check.rows.length === 0)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    const { rows } = await db.query(`
      SELECT m.id, m.content, m.read, m.created_at AS "createdAt",
             m.sender_id AS "senderId",
             u.username AS "senderUsername", u.avatar_url AS "senderAvatar"
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [convId]);

    // Mark as read
    await db.query(
      'UPDATE messages SET read = true WHERE conversation_id = $1 AND sender_id != $2 AND read = false',
      [convId, userId]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/**
 * POST /api/messages/conversations/:id — send message
 */
router.post('/conversations/:id', auth, async (req, res, next) => {
  try {
    const { id: convId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim())
      return res.status(400).json({ success: false, message: 'Message content required.' });

    const check = await db.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)',
      [convId, userId]
    );
    if (check.rows.length === 0)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    const client = await db.getClient();
    let newMsg;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
        [convId, userId, content.trim()]
      );
      await client.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [convId]);
      await client.query('COMMIT');
      newMsg = rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }

    res.status(201).json({ success: true, data: newMsg });
  } catch (err) { next(err); }
});

/**
 * GET /api/messages/unread-count — total unread across all convos
 */
router.get('/unread-count', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE m.sender_id != $1 AND m.read = false
         AND (c.participant1_id = $1 OR c.participant2_id = $1)`,
      [req.user.id]
    );
    res.json({ success: true, count: rows[0].count });
  } catch (err) { next(err); }
});

module.exports = router;

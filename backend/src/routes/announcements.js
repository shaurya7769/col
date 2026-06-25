const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { log, AUDIT_EVENTS } = require('../utils/audit');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    const { batch_id } = req.query;

    let conditions = [];
    let params = [];
    let idx = 1;

    if (role === 'student') {
      conditions.push(`(a.target_role IN ('all', 'student') OR a.batch_id IN (SELECT batch_id FROM enrollments WHERE student_id = $${idx++}))`);
      params.push(userId);
    }

    if (batch_id) {
      conditions.push(`a.batch_id = $${idx++}`);
      params.push(batch_id);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT a.*, u.username AS author_username, u.avatar_url AS author_avatar_url
      FROM announcements a
      JOIN users u ON a.author_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
    `, params);

    const data = rows.map(({ author_username, author_avatar_url, ...rest }) => ({
      ...rest,
      author: { username: author_username, avatar_url: author_avatar_url }
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    let { title, content, target_role, batch_id, priority } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    target_role = target_role || 'all';
    priority = priority || 'normal';

    const { rows } = await db.query(`
      INSERT INTO announcements (author_id, title, content, target_role, batch_id, priority)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.user.id, title, content, target_role, batch_id || null, priority]);

    const announcement = rows[0];

    const notifContent = `New announcement: ${title}`;
    if (target_role === 'all') {
      await db.query(`
        INSERT INTO notifications (user_id, type, content, reference_id)
        SELECT id, 'announcement', $1, $2 FROM users
      `, [notifContent, announcement.id]);
    } else if (target_role === 'student') {
      await db.query(`
        INSERT INTO notifications (user_id, type, content, reference_id)
        SELECT id, 'announcement', $1, $2 FROM users WHERE role = 'student'
      `, [notifContent, announcement.id]);
    } else if (batch_id) {
      await db.query(`
        INSERT INTO notifications (user_id, type, content, reference_id)
        SELECT e.student_id, 'announcement', $1, $2
        FROM enrollments e WHERE e.batch_id = $3
      `, [notifContent, announcement.id, batch_id]);
    }

    await log(AUDIT_EVENTS.ANNOUNCEMENT_CREATED, req.user.id, {
      announcement_id: announcement.id, title, target_role
    }, req.ip);

    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM announcements WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    const announcement = rows[0];
    if (announcement.author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this announcement.' });
    }

    await db.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);

    await log(AUDIT_EVENTS.ANNOUNCEMENT_DELETED, req.user.id, {
      announcement_id: req.params.id, title: announcement.title
    }, req.ip);

    res.json({ success: true, message: 'Announcement deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

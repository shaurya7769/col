const express = require('express');
const db = require('../utils/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);

    const { rows: [{ count }] } = await db.query(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE user_id = $1 AND read = 0
    `, [req.user.id]);

    res.json({ success: true, data: rows, unread_count: count });
  } catch (err) {
    next(err);
  }
});

router.get('/unread-count', auth, async (req, res, next) => {
  try {
    const { rows: [{ count }] } = await db.query(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE user_id = $1 AND read = 0
    `, [req.user.id]);

    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', auth, async (req, res, next) => {
  try {
    await db.query(`
      UPDATE notifications SET read = 1
      WHERE user_id = $1 AND read = 0
    `, [req.user.id]);

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', auth, async (req, res, next) => {
  try {
    const { rowCount } = await db.query(`
      UPDATE notifications SET read = 1
      WHERE id = $1 AND user_id = $2 AND read = 0
    `, [req.params.id, req.user.id]);

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found or already read.' });
    }

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

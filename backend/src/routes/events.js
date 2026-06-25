const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { log, AUDIT_EVENTS } = require('../utils/audit');

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;
    const upcomingOnly = req.query.upcoming_only === 'true';

    let whereClause = '';
    const params = [];
    let idx = 1;

    if (upcomingOnly) {
      whereClause = `WHERE e.date >= datetime('now')`;
    }

    const { rows } = await db.query(`
      SELECT e.*,
        u.username AS creator_username,
        u.avatar_url AS creator_avatar_url,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status = 'going') AS rsvp_going,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status = 'maybe') AS rsvp_maybe,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status = 'declined') AS rsvp_declined,
        (SELECT status FROM event_rsvps WHERE event_id = e.id AND user_id = $${idx}) AS my_rsvp
      FROM events e
      JOIN users u ON e.created_by = u.id
      ${whereClause}
      ORDER BY e.date ASC
      LIMIT $${idx + 1} OFFSET $${idx + 2}
    `, [req.user.id, limit, offset]);

    const { rows: [{ count }] } = await db.query(`
      SELECT COUNT(*) AS count FROM events e ${whereClause}
    `, params);

    const data = rows.map(r => ({
      ...r,
      creator: { username: r.creator_username, avatar_url: r.creator_avatar_url },
      rsvp_counts: { going: r.rsvp_going, maybe: r.rsvp_maybe, declined: r.rsvp_declined },
      my_rsvp: r.my_rsvp,
    }));

    res.json({ success: true, data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
});

router.post('/', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { title, description, date, end_date, location, capacity, cover_url, is_recurring, recurring_rule } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'Title and date are required.' });
    }

    const { rows } = await db.query(`
      INSERT INTO events (title, description, date, end_date, location, capacity, cover_url, is_recurring, recurring_rule, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [title, description || null, date, end_date || null, location || null, capacity || 0, cover_url || null, is_recurring ? 1 : 0, recurring_rule || null, req.user.id]);

    await log(AUDIT_EVENTS.ANNOUNCEMENT_CREATED, req.user.id, {
      event_id: rows[0].id, title
    }, req.ip);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.*,
        u.username AS creator_username,
        u.avatar_url AS creator_avatar_url
      FROM events e
      JOIN users u ON e.created_by = u.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const rsvpRows = await db.query(`
      SELECT u.id, u.username, u.avatar_url, r.status
      FROM event_rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = $1
      ORDER BY r.created_at ASC
    `, [req.params.id]);

    const event = rows[0];
    const data = {
      ...event,
      creator: { username: event.creator_username, avatar_url: event.creator_avatar_url },
      rsvps: rsvpRows.rows,
    };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const event = rows[0];
    if (event.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this event.' });
    }

    const { title, description, date, end_date, location, capacity, cover_url, is_recurring, recurring_rule } = req.body;

    const { rows: updated } = await db.query(`
      UPDATE events SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        date = COALESCE($3, date),
        end_date = COALESCE($4, end_date),
        location = COALESCE($5, location),
        capacity = COALESCE($6, capacity),
        cover_url = COALESCE($7, cover_url),
        is_recurring = COALESCE($8, is_recurring),
        recurring_rule = COALESCE($9, recurring_rule)
      WHERE id = $10
      RETURNING *
    `, [title || null, description || null, date || null, end_date || null, location || null, capacity ?? null, cover_url || null, is_recurring ?? null, recurring_rule || null, req.params.id]);

    await log(AUDIT_EVENTS.ANNOUNCEMENT_CREATED, req.user.id, {
      event_id: req.params.id, title: updated[0].title, action: 'updated'
    }, req.ip);

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const event = rows[0];
    if (event.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this event.' });
    }

    await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);

    await log(AUDIT_EVENTS.ANNOUNCEMENT_DELETED, req.user.id, {
      event_id: req.params.id, title: event.title
    }, req.ip);

    res.json({ success: true, message: 'Event deleted.' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rsvp', auth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['going', 'maybe', 'declined'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of: going, maybe, declined.' });
    }

    const { rows: eventRows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const event = eventRows[0];

    if (event.capacity > 0 && status === 'going') {
      const { rows: [{ count }] } = await db.query(
        "SELECT COUNT(*) AS count FROM event_rsvps WHERE event_id = $1 AND status = 'going'",
        [req.params.id]
      );
      if (count >= event.capacity) {
        return res.status(400).json({ success: false, message: 'Event is at full capacity.' });
      }
    }

    await db.query(`
      INSERT INTO event_rsvps (event_id, user_id, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = $3
    `, [req.params.id, req.user.id, status]);

    const { rows: counts } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = $1 AND status = 'going') AS going,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = $1 AND status = 'maybe') AS maybe,
        (SELECT COUNT(*) FROM event_rsvps WHERE event_id = $1 AND status = 'declined') AS declined
    `, [req.params.id]);

    res.json({ success: true, data: { status, counts: counts[0] } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/rsvps', auth, async (req, res, next) => {
  try {
    const { rows: eventRows } = await db.query('SELECT id FROM events WHERE id = $1', [req.params.id]);
    if (eventRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const { rows } = await db.query(`
      SELECT u.id, u.username, u.avatar_url, r.status, r.created_at
      FROM event_rsvps r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = $1
      ORDER BY r.created_at ASC
    `, [req.params.id]);

    const grouped = { going: [], maybe: [], declined: [] };
    rows.forEach(r => {
      grouped[r.status].push(r);
    });

    res.json({ success: true, data: grouped });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

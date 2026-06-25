const express = require('express');
const db = require('../utils/db');
const { auth, authorize } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

/** GET /api/batches */
router.get('/', auth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    let query, params = [];
    if (role === 'coach') {
      query = 'SELECT * FROM batches WHERE coach_id = $1 ORDER BY created_at DESC';
      params = [userId];
    } else if (role === 'student') {
      query = `SELECT b.* FROM batches b JOIN enrollments e ON b.id = e.batch_id WHERE e.student_id = $1 ORDER BY b.created_at DESC`;
      params = [userId];
    } else {
      query = 'SELECT * FROM batches ORDER BY created_at DESC';
    }
    const { rows } = await db.query(query, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

/** POST /api/batches */
router.post('/', auth, authorize('coach', 'admin'), validate(schemas.createBatch), async (req, res, next) => {
  try {
    const { name, description, venue, schedule, start_time, end_time } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Session name is required.' });
    const coachId = req.user.role === 'coach' ? req.user.id : (req.body.coachId || req.user.id);

    const { rows } = await db.query(
      `INSERT INTO batches (name, description, coach_id, venue, schedule, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, description || null, coachId, venue || 'TBA', schedule || '', start_time || null, end_time || null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/** GET /api/batches/:id */
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;

    const batchResult = await db.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (batchResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Session not found.' });

    const batch = batchResult.rows[0];

    // Authorization: admin, batch coach, or enrolled student
    if (role !== 'admin' && batch.coach_id !== userId) {
      const enrolled = await db.query(
        'SELECT 1 FROM enrollments WHERE batch_id = $1 AND student_id = $2',
        [req.params.id, userId]
      );
      if (enrolled.rows.length === 0)
        return res.status(403).json({ success: false, message: 'Not authorized to view this session.' });
    }

    const studentsResult = await db.query(`
      SELECT u.id, u.username, u.avatar_url, u.skatepark_location, e.enrolled_at,
        (SELECT json_agg(json_build_object('trick', trick_name, 'status', status, 'notes', notes))
         FROM trick_mastery WHERE user_id = u.id) AS tricks
      FROM users u JOIN enrollments e ON u.id = e.student_id
      WHERE e.batch_id = $1
    `, [req.params.id]);

    res.json({ success: true, data: { ...batch, students: studentsResult.rows } });
  } catch (err) { next(err); }
});

/** PUT /api/batches/:id */
router.put('/:id', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    if (req.user.role === 'coach') {
      const check = await db.query('SELECT coach_id FROM batches WHERE id = $1', [req.params.id]);
      if (!check.rows.length) return res.status(404).json({ success: false, message: 'Session not found.' });
      if (check.rows[0].coach_id !== req.user.id)
        return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    const { name, description, venue, schedule, start_time, end_time } = req.body;
    const { rows } = await db.query(
      `UPDATE batches SET name=COALESCE($1,name), description=COALESCE($2,description),
       venue=COALESCE($3,venue), schedule=COALESCE($4,schedule),
       start_time=COALESCE($5,start_time), end_time=COALESCE($6,end_time)
       WHERE id=$7 RETURNING *`,
      [name, description, venue, schedule, start_time, end_time, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/** POST /api/batches/:id/enroll */
router.post('/:id/enroll', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId required.' });
    const [studentCheck, batchCheck] = await Promise.all([
      db.query("SELECT id FROM users WHERE id = $1 AND role = 'student'", [studentId]),
      db.query('SELECT id FROM batches WHERE id = $1', [req.params.id]),
    ]);
    if (!studentCheck.rows.length) return res.status(404).json({ success: false, message: 'Student not found.' });
    if (!batchCheck.rows.length) return res.status(404).json({ success: false, message: 'Session not found.' });

    const { rowCount } = await db.query(
      'INSERT INTO enrollments (batch_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
      [req.params.id, studentId]
    );
    res.status(rowCount > 0 ? 201 : 200).json({
      success: true,
      message: rowCount > 0 ? 'Student enrolled!' : 'Already enrolled.',
    });
  } catch (err) { next(err); }
});

/** DELETE /api/batches/:id/unenroll/:studentId */
router.delete('/:id/unenroll/:studentId', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM enrollments WHERE batch_id = $1 AND student_id = $2',
      [req.params.id, req.params.studentId]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'Enrollment not found.' });
    res.json({ success: true, message: 'Student removed from session.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/batches/:id/tricks — coach enters/updates trick for a student
 */
router.post('/:id/tricks', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { studentId, trickName, status, notes } = req.body;
    if (!studentId || !trickName || !status)
      return res.status(400).json({ success: false, message: 'studentId, trickName, and status required.' });
    if (!['learning', 'mastered', 'not_started'].includes(status))
      return res.status(400).json({ success: false, message: 'Status must be: learning, mastered, or not_started.' });

    const { rows } = await db.query(
      `INSERT INTO trick_mastery (user_id, trick_name, status, notes, coach_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, trick_name) DO UPDATE
         SET status = $3, notes = $4, coach_id = $5, updated_at = NOW()
       RETURNING *`,
      [studentId, trickName, status, notes || null, req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/** 
 * GET /api/batches/:id/students/:studentId/progress
 */
router.get('/:id/students/:studentId/progress', auth, authorize('coach', 'admin'), async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;

    if (role === 'coach') {
      const enrollmentCheck = await db.query(
        `SELECT 1 FROM enrollments e JOIN batches b ON e.batch_id = b.id
         WHERE e.batch_id = $1 AND e.student_id = $2 AND b.coach_id = $3`,
        [req.params.id, req.params.studentId, userId]
      );
      if (enrollmentCheck.rows.length === 0)
        return res.status(403).json({ success: false, message: 'Not authorized to view this student\'s progress.' });
    }

    const { rows: tricks } = await db.query(
      `SELECT trick_name AS "trickName", status, notes, updated_at AS "updatedAt"
       FROM trick_mastery WHERE user_id = $1 ORDER BY status DESC, trick_name ASC`,
      [req.params.studentId]
    );
    const mastered = tricks.filter(t => t.status === 'mastered').length;
    const total = tricks.length;
    res.json({
      success: true,
      data: {
        tricks,
        summary: {
          mastered, total,
          progressPct: total > 0 ? Math.round((mastered / total) * 100) : 0,
          level: mastered >= 15 ? 'Pro' : mastered >= 8 ? 'Advanced' : mastered >= 4 ? 'Intermediate' : 'Beginner',
          plainEnglish: `Out of ${total} tricks tracked, ${mastered} have been fully mastered. ${total > 0 ? `That's ${Math.round((mastered / total) * 100)}% complete!` : ''}`,
        },
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;

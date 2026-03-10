const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT dr.*, u.full_name as submitted_by_name FROM daily_reports dr LEFT JOIN users u ON dr.submitted_by = u.id';
  const params = [];
  if (site_id) { stmt += ' WHERE dr.site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY dr.report_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, upload.array('photos', 10), (req, res) => {
  const { site_id, report_date, work_completed, labour_count, machinery_used, material_used, weather, problems } = req.body;
  if (!site_id || !report_date) return res.status(400).json({ error: 'site_id and report_date required' });
  const photos = req.files ? req.files.map(f => f.filename).join(',') : null;
  const result = db.prepare(`
    INSERT INTO daily_reports (site_id, report_date, work_completed, labour_count, machinery_used, material_used, weather, photos, problems, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, report_date, work_completed || null, labour_count || 0, machinery_used || null, material_used || null, weather || null, photos, problems || null, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM daily_reports WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

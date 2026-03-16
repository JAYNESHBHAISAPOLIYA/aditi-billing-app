const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dpr?site_id=...
router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM dpr_records';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY report_date DESC';
  const records = db.prepare(stmt).all(...params);
  // Parse JSON fields
  const parsed = records.map(r => ({
    ...r,
    work_done: r.work_done ? JSON.parse(r.work_done) : [],
    materials_used: r.materials_used ? JSON.parse(r.materials_used) : [],
  }));
  res.json(parsed);
});

// GET /api/dpr/:id
router.get('/:id', authenticate, (req, res) => {
  const record = db.prepare('SELECT * FROM dpr_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...record,
    work_done: record.work_done ? JSON.parse(record.work_done) : [],
    materials_used: record.materials_used ? JSON.parse(record.materials_used) : [],
  });
});

// DELETE /api/dpr/:id
router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM dpr_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

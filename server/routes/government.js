const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM government_payments';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY payment_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, upload.single('receipt'), (req, res) => {
  const { site_id, department_name, payment_type, amount, payment_date, notes } = req.body;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });
  const result = db.prepare(`
    INSERT INTO government_payments (site_id, department_name, payment_type, amount, payment_date, receipt_path, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, department_name || null, payment_type || null, amount || 0, payment_date || null, req.file ? req.file.filename : null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['department_name', 'payment_type', 'amount', 'payment_date', 'notes'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE government_payments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM government_payments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

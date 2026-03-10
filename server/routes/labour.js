const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM labour_records';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY created_at DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, (req, res) => {
  const { site_id, worker_name, labour_type, work_type, wage_type, wage_amount, attendance_days, total_days_worked, total_salary, payment_status, month, notes } = req.body;
  if (!site_id || !worker_name) return res.status(400).json({ error: 'site_id and worker_name required' });
  const salary = total_salary || ((wage_amount || 0) * (total_days_worked || attendance_days || 0));
  const result = db.prepare(`
    INSERT INTO labour_records (site_id, worker_name, labour_type, work_type, wage_type, wage_amount, attendance_days, total_days_worked, total_salary, payment_status, month, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, worker_name, labour_type || null, work_type || null, wage_type || 'daily', wage_amount || 0, attendance_days || 0, total_days_worked || 0, salary, payment_status || 'pending', month || null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['worker_name', 'labour_type', 'work_type', 'wage_type', 'wage_amount', 'attendance_days', 'total_days_worked', 'total_salary', 'payment_status', 'month', 'notes'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE labour_records SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM labour_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

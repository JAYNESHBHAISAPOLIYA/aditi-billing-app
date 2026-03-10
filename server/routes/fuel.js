const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM fuel_expenses';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY expense_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, upload.single('bill'), (req, res) => {
  const { site_id, vehicle_name, fuel_type, quantity, rate, total_cost, expense_date } = req.body;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });
  const cost = total_cost || ((quantity || 0) * (rate || 0));
  const result = db.prepare(`
    INSERT INTO fuel_expenses (site_id, vehicle_name, fuel_type, quantity, rate, total_cost, expense_date, bill_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, vehicle_name || null, fuel_type || null, quantity || 0, rate || 0, cost, expense_date || null, req.file ? req.file.filename : null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['vehicle_name', 'fuel_type', 'quantity', 'rate', 'total_cost', 'expense_date'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE fuel_expenses SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM fuel_expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

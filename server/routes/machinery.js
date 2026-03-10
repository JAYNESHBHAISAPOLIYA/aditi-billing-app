const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM machinery_expenses';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY expense_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, upload.single('invoice'), (req, res) => {
  const { site_id, machine_name, owner_vendor, hours_used, rate, total_cost, expense_date } = req.body;
  if (!site_id || !machine_name) return res.status(400).json({ error: 'site_id and machine_name required' });
  const cost = total_cost || ((hours_used || 0) * (rate || 0));
  const result = db.prepare(`
    INSERT INTO machinery_expenses (site_id, machine_name, owner_vendor, hours_used, rate, total_cost, expense_date, invoice_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, machine_name, owner_vendor || null, hours_used || 0, rate || 0, cost, expense_date || null, req.file ? req.file.filename : null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['machine_name', 'owner_vendor', 'hours_used', 'rate', 'total_cost', 'expense_date'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE machinery_expenses SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM machinery_expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM boq_items';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY item_number';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, (req, res) => {
  const { site_id, item_number, description, quantity, unit, rate, total_amount, work_completed_pct, remaining_work, actual_cost } = req.body;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });
  const total = total_amount || ((quantity || 0) * (rate || 0));
  const remaining = remaining_work !== undefined ? remaining_work : (quantity || 0);
  const result = db.prepare(`
    INSERT INTO boq_items (site_id, item_number, description, quantity, unit, rate, total_amount, work_completed_pct, remaining_work, actual_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, item_number || null, description || null, quantity || 0, unit || null, rate || 0, total, work_completed_pct || 0, remaining, actual_cost || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['item_number', 'description', 'quantity', 'unit', 'rate', 'total_amount', 'work_completed_pct', 'remaining_work', 'actual_cost'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE boq_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM boq_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM sale_bills';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY bill_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, (req, res) => {
  const { site_id, bill_number, work_description, bill_amount, bill_date, approved_amount, payment_status, payment_received_date } = req.body;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });
  const result = db.prepare(`
    INSERT INTO sale_bills (site_id, bill_number, work_description, bill_amount, bill_date, approved_amount, payment_status, payment_received_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, bill_number || null, work_description || null, bill_amount || 0, bill_date || null, approved_amount || 0, payment_status || 'pending', payment_received_date || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['bill_number', 'work_description', 'bill_amount', 'bill_date', 'approved_amount', 'payment_status', 'payment_received_date'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE sale_bills SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM sale_bills WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

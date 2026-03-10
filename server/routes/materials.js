const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

// List materials for a site
router.get('/', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = 'SELECT * FROM material_purchases';
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' ORDER BY purchase_date DESC';
  res.json(db.prepare(stmt).all(...params));
});

// Add material purchase
router.post('/', authenticate, upload.single('invoice'), (req, res) => {
  const { site_id, material_name, supplier, quantity, unit, rate, total_amount, purchase_date, notes } = req.body;
  if (!site_id || !material_name) return res.status(400).json({ error: 'site_id and material_name required' });
  const amount = total_amount || (quantity * rate) || 0;
  const result = db.prepare(`
    INSERT INTO material_purchases (site_id, material_name, supplier, quantity, unit, rate, total_amount, purchase_date, invoice_path, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_id, material_name, supplier || null, quantity || 0, unit || null, rate || 0, amount, purchase_date || null, req.file ? req.file.filename : null, notes || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Update material purchase
router.put('/:id', authenticate, (req, res) => {
  const fields = ['material_name', 'supplier', 'quantity', 'unit', 'rate', 'total_amount', 'purchase_date', 'notes'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE material_purchases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// Delete material purchase
router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM material_purchases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

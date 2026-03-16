const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/sor - list SOR rates
router.get('/', authenticate, (req, res) => {
  const { category, search, state, year } = req.query;
  let stmt = 'SELECT * FROM sor_rates WHERE 1=1';
  const params = [];
  if (category) { stmt += ' AND category = ?'; params.push(category); }
  if (state) { stmt += ' AND state = ?'; params.push(state); }
  if (year) { stmt += ' AND year = ?'; params.push(year); }
  if (search) {
    stmt += ' AND (description LIKE ? OR item_code LIKE ? OR keywords LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  stmt += ' ORDER BY category, item_code';
  res.json(db.prepare(stmt).all(...params));
});

// GET /api/sor/:id
router.get('/:id', authenticate, (req, res) => {
  const sor = db.prepare('SELECT * FROM sor_rates WHERE id = ?').get(req.params.id);
  if (!sor) return res.status(404).json({ error: 'Not found' });
  res.json(sor);
});

// POST /api/sor - create SOR rate
router.post('/', authenticate, (req, res) => {
  const { state, year, item_code, description, unit, rate, category, keywords } = req.body;
  if (!item_code || !description || !unit || rate === undefined) {
    return res.status(400).json({ error: 'item_code, description, unit, rate required' });
  }
  const result = db.prepare(`
    INSERT INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(state || 'Gujarat', year || '2024-25', item_code, description, unit, rate, category || null, keywords || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/sor/:id - update SOR rate
router.put('/:id', authenticate, (req, res) => {
  const fields = ['state', 'year', 'item_code', 'description', 'unit', 'rate', 'category', 'keywords'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE sor_rates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// DELETE /api/sor/:id
router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM sor_rates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/sor - list SOR rates with optional search
router.get('/', authenticate, (req, res) => {
  const { q, category, year } = req.query;
  let stmt = 'SELECT * FROM sor_rates WHERE 1=1';
  const params = [];

  if (q) {
    stmt += ' AND (description LIKE ? OR item_code LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) { stmt += ' AND category = ?'; params.push(category); }
  if (year) { stmt += ' AND year = ?'; params.push(year); }
  stmt += ' ORDER BY category, item_code';

  res.json(db.prepare(stmt).all(...params));
});

// GET /api/sor/:id
router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM sor_rates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/sor - create SOR rate
router.post('/', authenticate, (req, res) => {
  const { state = 'Gujarat', year = '2024-25', item_code, description, unit, rate, category } = req.body;
  if (!description || !unit || rate === undefined) {
    return res.status(400).json({ error: 'description, unit, rate required' });
  }
  const result = db.prepare(`
    INSERT INTO sor_rates (state, year, item_code, description, unit, rate, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(state, year, item_code || null, description, unit, rate, category || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/sor/:id
router.put('/:id', authenticate, (req, res) => {
  const fields = ['state', 'year', 'item_code', 'description', 'unit', 'rate', 'category'];
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

// POST /api/sor/match - fuzzy match a description against SOR rates
router.post('/match', authenticate, (req, res) => {
  const { description, keywords } = req.body;
  if (!description && (!keywords || !keywords.length)) {
    return res.status(400).json({ error: 'description or keywords required' });
  }

  const allRates = db.prepare('SELECT * FROM sor_rates').all();
  const scored = allRates.map(rate => {
    const haystack = `${rate.description} ${rate.item_code || ''} ${rate.category || ''}`.toLowerCase();
    const needle = (description || '').toLowerCase();

    // Keyword score
    let score = 0;
    const searchTerms = [
      ...needle.split(/\s+/).filter(w => w.length > 2),
      ...(keywords || []).map(k => k.toLowerCase())
    ];
    for (const term of searchTerms) {
      if (haystack.includes(term)) score += 10;
    }
    // Exact phrase boost
    if (needle && haystack.includes(needle)) score += 50;

    return { ...rate, match_score: Math.min(100, score) };
  });

  const matches = scored
    .filter(r => r.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  res.json(matches);
});

module.exports = router;

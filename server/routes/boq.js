const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateRaBill } = require('../utils/raBill');

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
  const fields = ['item_number', 'description', 'quantity', 'unit', 'rate', 'total_amount', 'work_completed_pct', 'remaining_work', 'actual_cost', 'qty_used'];
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

// GET /api/boq/sor-rates — list all SOR rates with optional keyword search
router.get('/sor-rates', authenticate, (req, res) => {
  const { q, category } = req.query;
  let stmt = 'SELECT * FROM sor_rates WHERE 1=1';
  const params = [];
  if (q) { stmt += ' AND (description LIKE ? OR keywords LIKE ? OR item_code LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category) { stmt += ' AND category = ?'; params.push(category); }
  stmt += ' ORDER BY category, item_code';
  res.json(db.prepare(stmt).all(...params));
});

// POST /api/boq/sor-rates — add a new SOR rate
router.post('/sor-rates', authenticate, (req, res) => {
  const { item_code, description, unit, rate, category, keywords, state, year } = req.body;
  if (!description || !unit || rate === undefined) return res.status(400).json({ error: 'description, unit, rate required' });
  const result = db.prepare(`
    INSERT INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(state || 'Gujarat', year || '2024-25', item_code || null, description, unit, rate, category || null, keywords || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /api/boq/ra-bill/:site_id — generate RA Bill Excel
router.get('/ra-bill/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { bill_no, bill_period_from, bill_period_to, bill_date } = req.query;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(site_id);

  const items = boqItems.map((item, idx) => ({
    sr_no: idx + 1,
    schedule: item.item_number ? item.item_number.split('-')[0] : 'B-1',
    description: item.description || '',
    unit: item.unit || '',
    tender_qty: item.quantity || 0,
    tender_rate: item.rate || 0,
    prev_qty: 0,
    prev_amount: 0,
    this_qty: item.qty_used || 0,
    this_amount: (item.qty_used || 0) * (item.rate || 0),
    upto_qty: item.qty_used || 0,
    upto_amount: (item.qty_used || 0) * (item.rate || 0),
  }));

  try {
    const excelBuffer = await generateRaBill({
      bill_no: bill_no || 1,
      bill_period_from: bill_period_from || '',
      bill_period_to: bill_period_to || '',
      bill_date: bill_date || new Date().toISOString().split('T')[0],
      work_name: site.site_name,
      work_order_no: site.tender_number || '',
      agency_name: site.contractor_name || '',
      items,
    });

    const safeName = site.site_name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RA_Bill_${bill_no || 1}_${safeName}.xlsx"`);
    res.send(Buffer.from(excelBuffer));
  } catch (err) {
    console.error('RA bill error:', err);
    res.status(500).json({ error: err.message || 'Excel generation failed' });
  }
});

// GET /api/boq/dpr-records/:site_id
router.get('/dpr-records/:site_id', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM dpr_records WHERE site_id = ? ORDER BY report_date DESC').all(req.params.site_id);
  res.json(rows);
});

module.exports = router;

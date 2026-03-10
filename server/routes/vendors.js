const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY vendor_name').all();
  res.json(vendors);
});

router.get('/:id', authenticate, (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  // Get purchase history
  const purchases = db.prepare('SELECT * FROM material_purchases WHERE supplier = ? ORDER BY purchase_date DESC').all(vendor.vendor_name);
  res.json({ ...vendor, purchases });
});

router.post('/', authenticate, (req, res) => {
  const { vendor_name, contact_number, material_type, address, payment_pending, total_purchase } = req.body;
  if (!vendor_name) return res.status(400).json({ error: 'vendor_name required' });
  const result = db.prepare(`
    INSERT INTO vendors (vendor_name, contact_number, material_type, address, payment_pending, total_purchase)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(vendor_name, contact_number || null, material_type || null, address || null, payment_pending || 0, total_purchase || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', authenticate, (req, res) => {
  const fields = ['vendor_name', 'contact_number', 'material_type', 'address', 'payment_pending', 'total_purchase'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

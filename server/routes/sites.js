const express = require('express');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// List all sites
router.get('/', authenticate, (req, res) => {
  let sites;
  if (req.user.role === 'owner') {
    sites = db.prepare(`
      SELECT s.*, u.full_name as manager_name
      FROM sites s LEFT JOIN users u ON s.assigned_manager_id = u.id
      ORDER BY s.created_at DESC
    `).all();
  } else if (req.user.role === 'site_manager') {
    sites = db.prepare(`
      SELECT s.*, u.full_name as manager_name
      FROM sites s LEFT JOIN users u ON s.assigned_manager_id = u.id
      WHERE s.assigned_manager_id = ? OR s.id = ?
      ORDER BY s.created_at DESC
    `).all(req.user.id, req.user.assigned_site_id || 0);
  } else {
    sites = db.prepare(`
      SELECT s.*, u.full_name as manager_name
      FROM sites s LEFT JOIN users u ON s.assigned_manager_id = u.id
      ORDER BY s.created_at DESC
    `).all();
  }
  res.json(sites);
});

// Get single site
router.get('/:id', authenticate, (req, res) => {
  const site = db.prepare(`
    SELECT s.*, u.full_name as manager_name
    FROM sites s LEFT JOIN users u ON s.assigned_manager_id = u.id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

// Create site (owner only)
router.post('/', authenticate, authorize('owner'), (req, res) => {
  const { site_name, site_location, project_type, tender_number, start_date, completion_date, estimated_cost, contractor_name, department_name, assigned_manager_id } = req.body;
  if (!site_name) return res.status(400).json({ error: 'Site name is required' });
  const result = db.prepare(`
    INSERT INTO sites (site_name, site_location, project_type, tender_number, start_date, completion_date, estimated_cost, contractor_name, department_name, assigned_manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(site_name, site_location || null, project_type || null, tender_number || null, start_date || null, completion_date || null, estimated_cost || 0, contractor_name || null, department_name || null, assigned_manager_id || null);
  res.status(201).json({ id: result.lastInsertRowid, site_name });
});

// Update site
router.put('/:id', authenticate, authorize('owner'), (req, res) => {
  const fields = ['site_name', 'site_location', 'project_type', 'tender_number', 'start_date', 'completion_date', 'estimated_cost', 'contractor_name', 'department_name', 'assigned_manager_id', 'progress_percentage', 'status'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// Delete site (owner only)
router.delete('/:id', authenticate, authorize('owner'), (req, res) => {
  db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get site dashboard summary
router.get('/:id/summary', authenticate, (req, res) => {
  const siteId = req.params.id;
  const material = db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM material_purchases WHERE site_id = ?').get(siteId);
  const labour = db.prepare('SELECT COALESCE(SUM(total_salary),0) as total FROM labour_records WHERE site_id = ?').get(siteId);
  const office = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM office_expenses WHERE site_id = ?').get(siteId);
  const fuel = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM fuel_expenses WHERE site_id = ?').get(siteId);
  const machinery = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM machinery_expenses WHERE site_id = ?').get(siteId);
  const government = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM government_payments WHERE site_id = ?').get(siteId);
  const billing = db.prepare('SELECT COALESCE(SUM(bill_amount),0) as total_billed, COALESCE(SUM(approved_amount),0) as total_received FROM sale_bills WHERE site_id = ?').get(siteId);

  const totalExpenses = material.total + labour.total + office.total + fuel.total + machinery.total + government.total;
  res.json({
    material_cost: material.total,
    labour_cost: labour.total,
    office_cost: office.total,
    fuel_cost: fuel.total,
    machinery_cost: machinery.total,
    government_cost: government.total,
    total_expenses: totalExpenses,
    total_billed: billing.total_billed,
    payment_received: billing.total_received,
    profit_loss: billing.total_received - totalExpenses
  });
});

module.exports = router;

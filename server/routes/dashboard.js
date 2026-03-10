const express = require('express');
const { db } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Owner dashboard - investment & progress for all sites
router.get('/dashboard', authenticate, authorize('owner'), (req, res) => {
  const sites = db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
  const siteSummaries = sites.map(site => {
    const material = db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM material_purchases WHERE site_id = ?').get(site.id);
    const labour = db.prepare('SELECT COALESCE(SUM(total_salary),0) as total FROM labour_records WHERE site_id = ?').get(site.id);
    const office = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM office_expenses WHERE site_id = ?').get(site.id);
    const fuel = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM fuel_expenses WHERE site_id = ?').get(site.id);
    const machinery = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM machinery_expenses WHERE site_id = ?').get(site.id);
    const government = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM government_payments WHERE site_id = ?').get(site.id);
    const billing = db.prepare('SELECT COALESCE(SUM(bill_amount),0) as total_billed, COALESCE(SUM(approved_amount),0) as total_received FROM sale_bills WHERE site_id = ?').get(site.id);

    const totalExpenses = material.total + labour.total + office.total + fuel.total + machinery.total + government.total;

    return {
      site_id: site.id,
      site_name: site.site_name,
      status: site.status,
      progress_percentage: site.progress_percentage,
      estimated_cost: site.estimated_cost,
      completion_date: site.completion_date,
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
    };
  });

  // Aggregate totals
  const totals = siteSummaries.reduce((acc, s) => ({
    total_material: acc.total_material + s.material_cost,
    total_labour: acc.total_labour + s.labour_cost,
    total_office: acc.total_office + s.office_cost,
    total_fuel: acc.total_fuel + s.fuel_cost,
    total_machinery: acc.total_machinery + s.machinery_cost,
    total_government: acc.total_government + s.government_cost,
    total_expenses: acc.total_expenses + s.total_expenses,
    total_billed: acc.total_billed + s.total_billed,
    total_received: acc.total_received + s.payment_received,
    total_profit_loss: acc.total_profit_loss + s.profit_loss
  }), {
    total_material: 0, total_labour: 0, total_office: 0, total_fuel: 0,
    total_machinery: 0, total_government: 0, total_expenses: 0,
    total_billed: 0, total_received: 0, total_profit_loss: 0
  });

  // Monthly spending data for charts
  const monthlySpending = db.prepare(`
    SELECT strftime('%Y-%m', purchase_date) as month, SUM(total_amount) as amount, 'material' as type
    FROM material_purchases WHERE purchase_date IS NOT NULL GROUP BY month
    UNION ALL
    SELECT strftime('%Y-%m', created_at) as month, SUM(total_salary) as amount, 'labour' as type
    FROM labour_records WHERE created_at IS NOT NULL GROUP BY month
    UNION ALL
    SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as amount, 'office' as type
    FROM office_expenses WHERE expense_date IS NOT NULL GROUP BY month
    UNION ALL
    SELECT strftime('%Y-%m', expense_date) as month, SUM(total_cost) as amount, 'fuel' as type
    FROM fuel_expenses WHERE expense_date IS NOT NULL GROUP BY month
    UNION ALL
    SELECT strftime('%Y-%m', expense_date) as month, SUM(total_cost) as amount, 'machinery' as type
    FROM machinery_expenses WHERE expense_date IS NOT NULL GROUP BY month
    ORDER BY month
  `).all();

  res.json({ sites: siteSummaries, totals, monthlySpending });
});

// Site-wise expense report
router.get('/site-expenses', authenticate, (req, res) => {
  const { site_id } = req.query;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });

  const materials = db.prepare('SELECT * FROM material_purchases WHERE site_id = ? ORDER BY purchase_date DESC').all(site_id);
  const labour = db.prepare('SELECT * FROM labour_records WHERE site_id = ? ORDER BY created_at DESC').all(site_id);
  const office = db.prepare('SELECT * FROM office_expenses WHERE site_id = ? ORDER BY expense_date DESC').all(site_id);
  const fuel = db.prepare('SELECT * FROM fuel_expenses WHERE site_id = ? ORDER BY expense_date DESC').all(site_id);
  const machinery = db.prepare('SELECT * FROM machinery_expenses WHERE site_id = ? ORDER BY expense_date DESC').all(site_id);
  const government = db.prepare('SELECT * FROM government_payments WHERE site_id = ? ORDER BY payment_date DESC').all(site_id);
  const sales = db.prepare('SELECT * FROM sale_bills WHERE site_id = ? ORDER BY bill_date DESC').all(site_id);

  res.json({ materials, labour, office, fuel, machinery, government, sales });
});

// Vendor report
router.get('/vendor-report', authenticate, (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY payment_pending DESC').all();
  res.json(vendors);
});

// Material consumption report
router.get('/material-report', authenticate, (req, res) => {
  const { site_id } = req.query;
  let stmt = `
    SELECT material_name, SUM(quantity) as total_quantity, unit, SUM(total_amount) as total_cost, COUNT(*) as purchase_count
    FROM material_purchases
  `;
  const params = [];
  if (site_id) { stmt += ' WHERE site_id = ?'; params.push(site_id); }
  stmt += ' GROUP BY material_name, unit ORDER BY total_cost DESC';
  res.json(db.prepare(stmt).all(...params));
});

// Profit/Loss report
router.get('/profit-loss', authenticate, authorize('owner'), (req, res) => {
  const sites = db.prepare('SELECT id, site_name FROM sites').all();
  const report = sites.map(site => {
    const expenses = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(total_amount),0) FROM material_purchases WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_salary),0) FROM labour_records WHERE site_id = ?) +
        (SELECT COALESCE(SUM(amount),0) FROM office_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_cost),0) FROM fuel_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_cost),0) FROM machinery_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(amount),0) FROM government_payments WHERE site_id = ?) as total
    `).get(site.id, site.id, site.id, site.id, site.id, site.id);
    const revenue = db.prepare('SELECT COALESCE(SUM(approved_amount),0) as total FROM sale_bills WHERE site_id = ?').get(site.id);
    return {
      site_id: site.id,
      site_name: site.site_name,
      total_expenses: expenses.total,
      total_revenue: revenue.total,
      profit_loss: revenue.total - expenses.total
    };
  });
  res.json(report);
});

module.exports = router;

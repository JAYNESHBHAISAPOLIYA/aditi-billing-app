const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all alerts
router.get('/', authenticate, (req, res) => {
  const { site_id, unread } = req.query;
  let stmt = 'SELECT a.*, s.site_name FROM alerts a LEFT JOIN sites s ON a.site_id = s.id WHERE 1=1';
  const params = [];
  if (site_id) { stmt += ' AND a.site_id = ?'; params.push(site_id); }
  if (unread === 'true') { stmt += ' AND a.is_read = 0'; }
  stmt += ' ORDER BY a.created_at DESC LIMIT 100';
  res.json(db.prepare(stmt).all(...params));
});

// Mark alert as read
router.put('/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE alerts SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Mark all alerts as read
router.put('/read-all', authenticate, (req, res) => {
  db.prepare('UPDATE alerts SET is_read = 1').run();
  res.json({ success: true });
});

// Generate alerts (called periodically or on demand)
router.post('/generate', authenticate, (req, res) => {
  const sites = db.prepare('SELECT * FROM sites WHERE status = ?').all('active');

  for (const site of sites) {
    // Check for pending labour payments
    const pendingLabour = db.prepare("SELECT COUNT(*) as cnt FROM labour_records WHERE site_id = ? AND payment_status = 'pending'").get(site.id);
    if (pendingLabour.cnt > 0) {
      const existing = db.prepare("SELECT id FROM alerts WHERE site_id = ? AND alert_type = 'labour_payment' AND is_read = 0").get(site.id);
      if (!existing) {
        db.prepare("INSERT INTO alerts (site_id, alert_type, message) VALUES (?, 'labour_payment', ?)").run(site.id, `${pendingLabour.cnt} pending labour payments at ${site.site_name}`);
      }
    }

    // Check for vendor payment due
    const pendingVendors = db.prepare('SELECT COUNT(*) as cnt FROM vendors WHERE payment_pending > 0').get();
    if (pendingVendors.cnt > 0) {
      const existing = db.prepare("SELECT id FROM alerts WHERE alert_type = 'vendor_payment' AND is_read = 0").get();
      if (!existing) {
        db.prepare("INSERT INTO alerts (site_id, alert_type, message) VALUES (NULL, 'vendor_payment', ?)").run(`${pendingVendors.cnt} vendors have pending payments`);
      }
    }

    // Check for pending bill approval
    const pendingBills = db.prepare("SELECT COUNT(*) as cnt FROM sale_bills WHERE site_id = ? AND payment_status = 'pending'").get(site.id);
    if (pendingBills.cnt > 0) {
      const existing = db.prepare("SELECT id FROM alerts WHERE site_id = ? AND alert_type = 'bill_approval' AND is_read = 0").get(site.id);
      if (!existing) {
        db.prepare("INSERT INTO alerts (site_id, alert_type, message) VALUES (?, 'bill_approval', ?)").run(site.id, `${pendingBills.cnt} bills pending approval at ${site.site_name}`);
      }
    }

    // Check for project delay
    if (site.completion_date) {
      const today = new Date().toISOString().split('T')[0];
      if (today > site.completion_date && site.progress_percentage < 100) {
        const existing = db.prepare("SELECT id FROM alerts WHERE site_id = ? AND alert_type = 'project_delay' AND is_read = 0").get(site.id);
        if (!existing) {
          db.prepare("INSERT INTO alerts (site_id, alert_type, message) VALUES (?, 'project_delay', ?)").run(site.id, `Project "${site.site_name}" is past completion date`);
        }
      }
    }

    // Check for budget overrun
    const totalExpenses = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(total_amount),0) FROM material_purchases WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_salary),0) FROM labour_records WHERE site_id = ?) +
        (SELECT COALESCE(SUM(amount),0) FROM office_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_cost),0) FROM fuel_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(total_cost),0) FROM machinery_expenses WHERE site_id = ?) +
        (SELECT COALESCE(SUM(amount),0) FROM government_payments WHERE site_id = ?) as total
    `).get(site.id, site.id, site.id, site.id, site.id, site.id);

    if (site.estimated_cost > 0 && totalExpenses.total > site.estimated_cost) {
      const existing = db.prepare("SELECT id FROM alerts WHERE site_id = ? AND alert_type = 'budget_overrun' AND is_read = 0").get(site.id);
      if (!existing) {
        db.prepare("INSERT INTO alerts (site_id, alert_type, message) VALUES (?, 'budget_overrun', ?)").run(site.id, `Budget overrun at ${site.site_name}: spent ₹${totalExpenses.total.toLocaleString()} of ₹${site.estimated_cost.toLocaleString()}`);
      }
    }
  }

  res.json({ success: true });
});

module.exports = router;

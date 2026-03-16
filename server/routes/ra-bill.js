const express = require('express');
const path = require('path');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Indian number formatting ─────────────────────────────────────────────
function formatINR(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── POST /api/ra-bill/generate ───────────────────────────────────────────
router.post('/generate', authenticate, async (req, res) => {
  const { site_id, bill_no, bill_period_from, bill_period_to, bill_date } = req.body;
  if (!site_id) return res.status(400).json({ error: 'site_id required' });

  const ExcelJS = require('exceljs');

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(site_id);

  // Build RA bill data per item
  const billItems = boqItems.map((b, idx) => {
    const prevQty = 0; // Simplified: no previous bill tracking
    const thisQty = b.qty_used || 0;
    const uptoQty = b.qty_used || 0;
    const rate = b.sor_rate || b.rate || 0;
    const thisAmt = thisQty * rate;
    const uptoAmt = uptoQty * rate;
    return {
      sr_no: idx + 1,
      schedule: b.item_number || '',
      description: b.description || '',
      unit: b.unit || '',
      tender_qty: b.qty_tender || b.quantity || 0,
      tender_rate: rate,
      prev_qty: prevQty,
      prev_amount: prevQty * rate,
      this_qty: thisQty,
      this_amount: thisAmt,
      upto_qty: uptoQty,
      upto_amount: uptoAmt,
    };
  });

  const grossAmount = billItems.reduce((s, i) => s + i.this_amount, 0);
  const tpDeduction = grossAmount * 0.036; // T.P. -3.60%
  const afterTp = grossAmount - tpDeduction;
  const priceVariation = 0; // Clause-59, user can override
  const afterPv = afterTp + priceVariation;
  const retention = afterPv * 0.05; // 5% retention
  const netPayable = afterPv - retention;

  // Save RA bill record
  const existing = db.prepare('SELECT id FROM ra_bills WHERE site_id = ? AND bill_no = ?').get(site_id, bill_no || 1);
  if (!existing) {
    db.prepare(`INSERT INTO ra_bills (site_id, bill_no, bill_period_from, bill_period_to, bill_date, gross_amount, tp_deduction, price_variation, retention, net_amount) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(site_id, bill_no || 1, bill_period_from || '', bill_period_to || '', bill_date || new Date().toISOString().split('T')[0], grossAmount, tpDeduction, priceVariation, retention, netPayable);
  }

  // ── Build Excel ───────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aditi Billing App';
  wb.lastModifiedBy = 'System';
  wb.created = new Date();

  const lightBlue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
  const thinBorder = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };
  const boldFont = { bold: true };
  const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const rightAlign = { horizontal: 'right', vertical: 'middle' };

  // ── Sheet 1: Payment Abstract ─────────────────────────────────────────
  const ws1 = wb.addWorksheet('Payment Abstract');
  ws1.columns = [
    { width: 6 }, { width: 12 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  const companyName = 'GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR';
  const projectTitle = site.site_name || 'HALOL WSS SWAP-III under AMRUT 2.0 & SJMMSVY UGD PHASE II';

  const header1 = ws1.addRow([companyName]);
  ws1.mergeCells(`A1:G1`);
  header1.font = { bold: true, size: 14 };
  header1.alignment = centerAlign;
  header1.fill = lightBlue;

  const header2 = ws1.addRow([projectTitle]);
  ws1.mergeCells(`A2:G2`);
  header2.font = boldFont;
  header2.alignment = centerAlign;
  header2.fill = lightBlue;

  const workRow = ws1.addRow([site.site_location ? `Work Location: ${site.site_location}` : 'Work: Construction of Water Supply Distribution System']);
  ws1.mergeCells(`A3:G3`);
  workRow.alignment = { wrapText: true };

  const woRow = ws1.addRow([`Work Order No: ${site.tender_number || 'N/A'} | Start Date: ${site.start_date || '-'}`]);
  ws1.mergeCells(`A4:G4`);

  const agencyRow = ws1.addRow([`Agency/Contractor: ${site.contractor_name || 'As per Contract'}`]);
  ws1.mergeCells(`A5:G5`);

  const billTitleRow = ws1.addRow([`RA Bill - ${bill_no || 1}`]);
  ws1.mergeCells(`A6:G6`);
  billTitleRow.font = boldFont;
  billTitleRow.alignment = centerAlign;

  const summaryRow = ws1.addRow(['GROSS PAYMENT SUMMARY OF ABSTRACT']);
  ws1.mergeCells(`A7:G7`);
  summaryRow.font = boldFont;
  summaryRow.alignment = centerAlign;
  summaryRow.fill = lightBlue;

  const thRow = ws1.addRow(['Sr.No', 'Schedule No', site.site_name || 'Work Name', 'BOQ Quoted Amt', 'Upto Date Amt', 'Prev Bill Amt', 'This Bill Amt']);
  thRow.eachCell(c => { c.font = boldFont; c.fill = lightBlue; c.border = thinBorder; c.alignment = centerAlign; });
  ws1.views = [{ state: 'frozen', ySplit: 8 }];

  const boqQuoted = billItems.reduce((s, i) => s + (i.tender_qty * i.tender_rate), 0);
  const uptoTotal = billItems.reduce((s, i) => s + i.upto_amount, 0);
  const prevTotal = billItems.reduce((s, i) => s + i.prev_amount, 0);

  const dataRow = ws1.addRow([1, 'B-1', site.site_name || 'Halol WSS', `₹${formatINR(boqQuoted)}`, `₹${formatINR(uptoTotal)}`, `₹${formatINR(prevTotal)}`, `₹${formatINR(grossAmount)}`]);
  dataRow.eachCell(c => { c.border = thinBorder; c.alignment = rightAlign; });
  dataRow.getCell(1).alignment = centerAlign;
  dataRow.getCell(2).alignment = centerAlign;
  dataRow.getCell(3).alignment = { ...rightAlign, horizontal: 'left' };

  // ── Sheet 2: Statement of Accounts ───────────────────────────────────
  const ws2 = wb.addWorksheet('STATEMENT OF ACCOUNTS');
  ws2.columns = [{ width: 5 }, { width: 50 }, { width: 20 }];

  const ws2Title = ws2.addRow(['', 'STATEMENT OF ACCOUNTS']);
  ws2.mergeCells('B1:C1');
  ws2Title.font = { bold: true, size: 12 };
  ws2Title.getCell('B1').alignment = centerAlign;
  ws2Title.getCell('B1').fill = lightBlue;

  ws2.addRow(['', `RA Bill No: ${bill_no || 1} | Period: ${bill_period_from || '-'} to ${bill_period_to || '-'}`]);
  ws2.addRow([]);

  const stmtData = [
    ['A', `${site.site_name || 'Halol WSS'} Amount`, grossAmount],
    ['B', 'Halol UGD Amount', 0],
    ['C', 'Total (A+B)', grossAmount],
    ['D', 'T.P. -3.60% of C', -tpDeduction],
    ['E', 'C - D (After TP Deduction)', afterTp],
    ['F', 'Price Variation (Clause-59)', priceVariation],
    ['G', 'E + F', afterPv],
    ['H', '5% Retention of G', -retention],
    ['I', 'G - H  ← Net Payable Amount (Excl. GST)', netPayable],
  ];

  for (const [label, desc, amount] of stmtData) {
    const r = ws2.addRow([label, desc, amount >= 0 ? `₹${formatINR(amount)}` : `-₹${formatINR(Math.abs(amount))}`]);
    r.getCell(1).font = boldFont;
    r.getCell(3).alignment = rightAlign;
    r.eachCell(c => { c.border = thinBorder; });
    if (label === 'I') {
      r.font = { bold: true, color: { argb: 'FF006600' } };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    }
  }

  // ── Sheet 3: Abstract Sheet ───────────────────────────────────────────
  const ws3 = wb.addWorksheet('Abstract Sheet');
  ws3.columns = [
    { width: 6 }, { width: 12 }, { width: 40 }, { width: 8 },
    { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 },
  ];

  const absTitle = ws3.addRow([companyName]);
  ws3.mergeCells('A1:M1');
  absTitle.font = { bold: true, size: 13 };
  absTitle.alignment = centerAlign;
  absTitle.fill = lightBlue;

  const absTitle2 = ws3.addRow([projectTitle]);
  ws3.mergeCells('A2:M2');
  absTitle2.font = boldFont;
  absTitle2.alignment = centerAlign;

  const absBillRow = ws3.addRow([`RA Bill - ${bill_no || 1} | Period: ${bill_period_from || '-'} to ${bill_period_to || '-'} | Date: ${bill_date || '-'}`]);
  ws3.mergeCells('A3:M3');

  ws3.addRow([]);

  const absHeader = ws3.addRow([
    'Sr', 'Schedule', 'Description', 'Unit',
    'Tender Qty', 'Tender Rate', 'Tender Amt',
    'Prev Qty', 'Prev Amt',
    'This Qty', 'This Amt',
    'Upto Qty', 'Upto Amt',
  ]);
  absHeader.eachCell(c => { c.font = boldFont; c.fill = lightBlue; c.border = thinBorder; c.alignment = centerAlign; });
  ws3.views = [{ state: 'frozen', ySplit: 5 }];

  const amtFmt = '##,##,##0.00';

  let rowIdx = 6;
  for (const item of billItems) {
    const r = ws3.addRow([
      item.sr_no, item.schedule, item.description, item.unit,
      item.tender_qty, item.tender_rate, item.tender_qty * item.tender_rate,
      item.prev_qty, item.prev_amount,
      item.this_qty, item.this_amount,
      item.upto_qty, item.upto_amount,
    ]);
    r.eachCell((c, col) => {
      c.border = thinBorder;
      if (col >= 5) {
        c.alignment = rightAlign;
        if (col >= 7 && col !== 8 && col !== 10 && col !== 12) c.numFmt = amtFmt;
      }
    });
    rowIdx++;
  }

  // Grand total row
  const totalRow = ws3.addRow([
    '', '', 'GRAND TOTAL', '',
    { formula: `SUM(E6:E${rowIdx - 1})` }, '',
    { formula: `SUM(G6:G${rowIdx - 1})` },
    { formula: `SUM(H6:H${rowIdx - 1})` },
    { formula: `SUM(I6:I${rowIdx - 1})` },
    { formula: `SUM(J6:J${rowIdx - 1})` },
    { formula: `SUM(K6:K${rowIdx - 1})` },
    { formula: `SUM(L6:L${rowIdx - 1})` },
    { formula: `SUM(M6:M${rowIdx - 1})` },
  ]);
  totalRow.font = boldFont;
  totalRow.fill = lightBlue;
  totalRow.eachCell((c, col) => {
    c.border = thinBorder;
    if (col >= 5) { c.alignment = rightAlign; c.numFmt = amtFmt; }
  });

  // ── Send Excel file ────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="RA_Bill_${bill_no || 1}_${site.site_name?.replace(/\s+/g, '_') || 'bill'}.xlsx"`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
});

// GET /api/ra-bill/list/:site_id
router.get('/list/:site_id', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM ra_bills WHERE site_id = ? ORDER BY bill_no DESC').all(req.params.site_id));
});

module.exports = router;

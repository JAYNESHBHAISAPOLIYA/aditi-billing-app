const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Generate RA Bill Excel: GET /api/ra-bill/:siteId
router.get('/:siteId', authenticate, async (req, res) => {
  const { siteId } = req.params;
  const { bill_no, bill_period_from, bill_period_to, bill_date } = req.query;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(siteId);

  const billData = {
    bill_no: bill_no || '1',
    bill_period_from: bill_period_from || new Date().toISOString().split('T')[0],
    bill_period_to: bill_period_to || new Date().toISOString().split('T')[0],
    bill_date: bill_date || new Date().toISOString().split('T')[0],
    site_name: site.site_name,
    site_location: site.site_location || '',
    contractor_name: site.contractor_name || '',
    department_name: site.department_name || 'GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR',
    items: boqItems.map(b => ({
      sr_no: b.item_number || String(b.id),
      schedule: 'B-1',
      description: b.description || '',
      unit: b.unit || '',
      tender_qty: b.qty_tender || b.quantity || 0,
      tender_rate: b.sor_rate || b.rate || 0,
      prev_qty: 0,
      prev_amount: 0,
      this_qty: b.qty_used || 0,
      this_amount: (b.qty_used || 0) * (b.sor_rate || b.rate || 0),
      upto_qty: b.qty_used || 0,
      upto_amount: (b.qty_used || 0) * (b.sor_rate || b.rate || 0),
    })),
  };

  try {
    const excelBuffer = await generateRaBill(billData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RA_Bill_${site.site_name.replace(/\s+/g, '_')}_${billData.bill_no}.xlsx"`);
    res.send(excelBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate RA Bill: ' + err.message });
  }
});

async function generateRaBill(billData) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Aditi Construction ERP';
  wb.created = new Date();

  const LIGHT_BLUE = 'FFDDEEFF';
  const BORDER_THIN = { style: 'thin', color: { argb: 'FF000000' } };
  const ALL_BORDERS = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

  function applyBorder(cell) {
    cell.border = ALL_BORDERS;
  }

  function headerStyle(cell, bold = true, fill = true) {
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    cell.font = { bold, size: 11, name: 'Arial' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  }

  function amountFormat(cell, value) {
    cell.value = typeof value === 'number' ? value : 0;
    cell.numFmt = '##,##,##0.00';
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    applyBorder(cell);
  }

  function mergeAndSet(ws, range, value, bold = true, size = 11, center = true) {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(':')[0]);
    cell.value = value;
    cell.font = { bold, size, name: 'Arial' };
    cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  }

  // ─── Sheet 1: Payment Abstract ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Payment Abstract');
  ws1.columns = [
    { width: 8 }, { width: 14 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }
  ];

  mergeAndSet(ws1, 'A1:G1', billData.department_name, true, 14);
  mergeAndSet(ws1, 'A2:G2', `${billData.site_name} - ${billData.site_location}`, true, 12);
  mergeAndSet(ws1, 'A3:G3', `Work: ${billData.site_name}`, false, 11);
  mergeAndSet(ws1, 'A4:G4', `Bill Period: ${billData.bill_period_from} to ${billData.bill_period_to}  |  Bill Date: ${billData.bill_date}`, false, 11);
  mergeAndSet(ws1, 'A5:G5', `Agency/Contractor: ${billData.contractor_name}`, false, 11);
  mergeAndSet(ws1, 'A6:G6', `RA Bill - ${billData.bill_no}`, true, 12);
  mergeAndSet(ws1, 'A7:G7', 'GROSS PAYMENT SUMMARY OF ABSTRACT', true, 12);

  // Header row
  const hdr = ws1.getRow(8);
  hdr.height = 30;
  const headers8 = ['Sr.No', 'Schedule No', 'Description', 'BOQ Quoted Amt', 'Upto Date Amt', 'Prev Bill Amt', 'This Bill Amt'];
  headers8.forEach((h, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = h;
    headerStyle(cell);
  });

  const totals = billData.items.reduce((acc, it) => {
    acc.boq += it.tender_qty * it.tender_rate;
    acc.upto += it.upto_amount;
    acc.prev += it.prev_amount;
    acc.this += it.this_amount;
    return acc;
  }, { boq: 0, upto: 0, prev: 0, this: 0 });

  const row9 = ws1.getRow(9);
  row9.getCell(1).value = '1'; applyBorder(row9.getCell(1));
  row9.getCell(2).value = 'B-1'; applyBorder(row9.getCell(2));
  row9.getCell(3).value = billData.site_name; applyBorder(row9.getCell(3));
  amountFormat(row9.getCell(4), totals.boq);
  amountFormat(row9.getCell(5), totals.upto);
  amountFormat(row9.getCell(6), totals.prev);
  amountFormat(row9.getCell(7), totals.this);

  // Freeze panes at row 8
  ws1.views = [{ state: 'frozen', ySplit: 8 }];

  // ─── Sheet 2: Statement of Accounts ────────────────────────────────────────
  const ws2 = wb.addWorksheet('STATEMENT OF ACCOUNTS');
  ws2.columns = [{ width: 6 }, { width: 55 }, { width: 22 }];

  mergeAndSet(ws2, 'A1:C1', 'STATEMENT OF ACCOUNTS', true, 13);
  mergeAndSet(ws2, 'A2:C2', `RA Bill No. ${billData.bill_no}  |  ${billData.site_name}`, false, 11);

  const stmtHeaders = ['', 'Description', 'Amount (₹)'];
  stmtHeaders.forEach((h, i) => {
    const cell = ws2.getRow(3).getCell(i + 1);
    cell.value = h;
    headerStyle(cell);
  });

  const A = totals.upto;
  const D = +(A * 0.036).toFixed(2);
  const E = +(A - D).toFixed(2);
  const F = 0;
  const G = +(E + F).toFixed(2);
  const H = +(G * 0.05).toFixed(2);
  const I = +(G - H).toFixed(2);

  const stmtRows = [
    ['A', `${billData.site_name} - Gross Amount`, A],
    ['B', 'UGD Amount', 0],
    ['C', 'Total (A + B)', A],
    ['D', 'T.P. Deduction -3.60% of C', -D],
    ['E', 'Net Amount (C - D)', E],
    ['F', 'Price Variation (Clause-59)', F],
    ['G', 'Amount (E + F)', G],
    ['H', '5% Retention of G', -H],
    ['I', 'Net Payable (G - H) — Excl. GST', I],
  ];

  stmtRows.forEach((r, idx) => {
    const row = ws2.getRow(4 + idx);
    row.getCell(1).value = r[0]; applyBorder(row.getCell(1));
    row.getCell(2).value = r[1]; applyBorder(row.getCell(2));
    amountFormat(row.getCell(3), r[2]);
    if (r[0] === 'I') {
      row.getCell(3).font = { bold: true, size: 12, color: { argb: 'FF1A5276' } };
    }
  });

  // ─── Sheet 3: Abstract Sheet ────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Abstract Sheet');
  ws3.columns = [
    { width: 8 }, { width: 10 }, { width: 40 }, { width: 10 },
    { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 },
  ];

  mergeAndSet(ws3, 'A1:L1', `ABSTRACT SHEET — ${billData.site_name} — RA Bill No. ${billData.bill_no}`, true, 13);

  const absHeaders = [
    'Sr.No', 'Schedule', 'Description', 'Unit',
    'Tender Qty', 'Tender Amt', 'Prev Qty', 'Prev Amt',
    'This Qty', 'This Amt', 'Upto Qty', 'Upto Amt',
  ];
  const hdrRow = ws3.getRow(2);
  hdrRow.height = 35;
  absHeaders.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = h;
    headerStyle(cell);
  });

  ws3.views = [{ state: 'frozen', ySplit: 2 }];

  // Group items by schedule
  const scheduleGroups = {};
  for (const item of billData.items) {
    const sch = item.schedule || 'B-1';
    if (!scheduleGroups[sch]) scheduleGroups[sch] = [];
    scheduleGroups[sch].push(item);
  }

  let rowIdx = 3;
  const grandTotal = { tAmt: 0, pAmt: 0, thAmt: 0, uAmt: 0 };

  for (const [sch, items] of Object.entries(scheduleGroups)) {
    // Schedule header
    const schRow = ws3.getRow(rowIdx++);
    ws3.mergeCells(`A${rowIdx - 1}:L${rowIdx - 1}`);
    const schCell = ws3.getCell(`A${rowIdx - 1}`);
    schCell.value = `Schedule ${sch}`;
    schCell.font = { bold: true, size: 11 };
    schCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    schCell.alignment = { horizontal: 'left', vertical: 'middle' };
    applyBorder(schCell);

    const subTotal = { tAmt: 0, pAmt: 0, thAmt: 0, uAmt: 0 };

    for (const item of items) {
      const r = ws3.getRow(rowIdx++);
      const tAmt = item.tender_qty * item.tender_rate;

      r.getCell(1).value = item.sr_no; applyBorder(r.getCell(1));
      r.getCell(2).value = sch; applyBorder(r.getCell(2));
      r.getCell(3).value = item.description; applyBorder(r.getCell(3));
      r.getCell(4).value = item.unit; applyBorder(r.getCell(4));
      r.getCell(5).value = item.tender_qty; applyBorder(r.getCell(5)); r.getCell(5).numFmt = '#,##0.00';
      amountFormat(r.getCell(6), tAmt);
      r.getCell(7).value = item.prev_qty; applyBorder(r.getCell(7)); r.getCell(7).numFmt = '#,##0.00';
      amountFormat(r.getCell(8), item.prev_amount);
      r.getCell(9).value = item.this_qty; applyBorder(r.getCell(9)); r.getCell(9).numFmt = '#,##0.00';
      amountFormat(r.getCell(10), item.this_amount);
      r.getCell(11).value = item.upto_qty; applyBorder(r.getCell(11)); r.getCell(11).numFmt = '#,##0.00';
      amountFormat(r.getCell(12), item.upto_amount);

      subTotal.tAmt += tAmt;
      subTotal.pAmt += item.prev_amount;
      subTotal.thAmt += item.this_amount;
      subTotal.uAmt += item.upto_amount;
    }

    // Sub-total row
    const stRow = ws3.getRow(rowIdx++);
    ws3.mergeCells(`A${rowIdx - 1}:D${rowIdx - 1}`);
    const stCell = ws3.getCell(`A${rowIdx - 1}`);
    stCell.value = `Sub-total Schedule ${sch}`;
    stCell.font = { bold: true };
    stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    applyBorder(stCell);
    const stCells = [stRow.getCell(5), stRow.getCell(6), stRow.getCell(7), stRow.getCell(8), stRow.getCell(9), stRow.getCell(10), stRow.getCell(11), stRow.getCell(12)];
    stCells.forEach(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } }; c.font = { bold: true }; applyBorder(c); });
    amountFormat(stRow.getCell(6), subTotal.tAmt);
    amountFormat(stRow.getCell(8), subTotal.pAmt);
    amountFormat(stRow.getCell(10), subTotal.thAmt);
    amountFormat(stRow.getCell(12), subTotal.uAmt);

    grandTotal.tAmt += subTotal.tAmt;
    grandTotal.pAmt += subTotal.pAmt;
    grandTotal.thAmt += subTotal.thAmt;
    grandTotal.uAmt += subTotal.uAmt;
  }

  // Grand total
  const gtRow = ws3.getRow(rowIdx);
  ws3.mergeCells(`A${rowIdx}:D${rowIdx}`);
  const gtCell = ws3.getCell(`A${rowIdx}`);
  gtCell.value = 'GRAND TOTAL';
  gtCell.font = { bold: true, size: 12 };
  gtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
  applyBorder(gtCell);
  [5, 6, 7, 8, 9, 10, 11, 12].forEach(col => {
    const c = gtRow.getCell(col);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    c.font = { bold: true };
    applyBorder(c);
  });
  amountFormat(gtRow.getCell(6), grandTotal.tAmt);
  amountFormat(gtRow.getCell(8), grandTotal.pAmt);
  amountFormat(gtRow.getCell(10), grandTotal.thAmt);
  amountFormat(gtRow.getCell(12), grandTotal.uAmt);

  return wb.xlsx.writeBuffer();
}

module.exports = router;
module.exports.generateRaBill = generateRaBill;

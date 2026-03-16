const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const ExcelJS = require('exceljs');

const router = express.Router();

// Helper: Indian number formatter
function inrFmt(num) {
  if (!num) return '0.00';
  return Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET /api/ra-bill/:site_id - Generate RA Bill Excel for a site
router.get('/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { bill_no = '1', bill_from, bill_to, bill_date } = req.query;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  // Fetch BOQ items
  const boqItems = db.prepare(`
    SELECT * FROM boq_items WHERE site_id = ? ORDER BY CAST(item_number AS INTEGER), item_number
  `).all(site_id);

  // Build bill data
  const billData = {
    bill_no,
    bill_period_from: bill_from || site.start_date || '2024-01-01',
    bill_period_to: bill_to || new Date().toISOString().split('T')[0],
    bill_date: bill_date || new Date().toISOString().split('T')[0],
    site_name: site.site_name,
    site_location: site.site_location,
    tender_number: site.tender_number,
    contractor_name: site.contractor_name || 'Aditi Construction Pvt Ltd',
    items: boqItems.map(b => ({
      sr_no: b.item_number,
      schedule: b.item_code ? b.item_code.split('-')[0] + '-' + b.item_code.split('-')[1] : 'A',
      description: b.description,
      unit: b.unit,
      tender_qty: b.qty_tender || b.quantity || 0,
      tender_rate: b.rate || 0,
      prev_qty: 0,
      prev_amount: 0,
      this_qty: b.qty_used || 0,
      this_amount: (b.qty_used || 0) * (b.rate || 0),
      upto_qty: b.qty_used || 0,
      upto_amount: (b.qty_used || 0) * (b.rate || 0),
    }))
  };

  try {
    const excelBytes = await generateRABill(billData);
    const filename = `RA_Bill_${bill_no}_${site_name_safe(site.site_name)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBytes);
  } catch (err) {
    console.error('RA Bill generation error:', err);
    res.status(500).json({ error: `Excel generation failed: ${err.message}` });
  }
});

function site_name_safe(name) {
  return (name || 'Site').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
}

// Core Excel generation function
async function generateRABill(billData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aditi Construction ERP';
  workbook.lastModifiedBy = 'Aditi Construction ERP';
  workbook.created = new Date();

  // ─── SHEET 1: Payment Abstract ───────────────────────────────────────────────
  const abstractSheet = workbook.addWorksheet('Payment Abstract');
  abstractSheet.columns = [
    { width: 8 },   // A: Sr.No
    { width: 15 },  // B: Schedule No
    { width: 30 },  // C: Nagarpalika/Work
    { width: 18 },  // D: BOQ Quoted Amt
    { width: 18 },  // E: Upto Date Amt
    { width: 18 },  // F: Prev Bill Amt
    { width: 18 },  // G: This Bill Amt
    { width: 12 },  // H: extra
    { width: 12 },  // I: extra
    { width: 12 },  // J: extra
  ];

  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
  const THIN_BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };

  function mergedCell(sheet, rowNum, fromCol, toCol, value, opts = {}) {
    sheet.mergeCells(rowNum, fromCol, rowNum, toCol);
    const cell = sheet.getCell(rowNum, fromCol);
    cell.value = value;
    cell.alignment = { horizontal: opts.align || 'center', vertical: 'middle', wrapText: true };
    if (opts.bold) cell.font = { bold: true, size: opts.size || 11 };
    if (opts.fill) cell.fill = opts.fill;
    if (opts.border) cell.border = THIN_BORDER;
    return cell;
  }

  // Row 1: Company header
  mergedCell(abstractSheet, 1, 1, 10, 'GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR', { bold: true, size: 14, align: 'center' });
  abstractSheet.getRow(1).height = 24;

  // Row 2: Project name
  mergedCell(abstractSheet, 2, 1, 10, `${billData.site_name}`, { bold: true, align: 'center' });

  // Row 3: Full work name
  mergedCell(abstractSheet, 3, 1, 10, `Work: ${billData.site_name}, Location: ${billData.site_location || ''}`, { align: 'left' });
  abstractSheet.getRow(3).height = 30;

  // Row 4: Work Order details
  mergedCell(abstractSheet, 4, 1, 10, `Tender No: ${billData.tender_number || 'N/A'} | Bill Period: ${billData.bill_period_from} to ${billData.bill_period_to}`, { align: 'left' });

  // Row 5: Agency name
  mergedCell(abstractSheet, 5, 1, 10, `Agency: ${billData.contractor_name}`, { align: 'left' });

  // Row 6: RA Bill number
  mergedCell(abstractSheet, 6, 1, 10, `RA Bill - ${billData.bill_no}`, { bold: true, align: 'center' });

  // Row 7: Section title
  mergedCell(abstractSheet, 7, 1, 10, 'GROSS PAYMENT SUMMARY OF ABSTRACT', { bold: true, align: 'center', fill: HEADER_FILL, border: true });

  // Row 8: Table headers
  const hdrRow8 = abstractSheet.getRow(8);
  ['Sr.No', 'Schedule No', 'Work / Nagarpalika', 'BOQ Quoted Amt (₹)', 'Upto Date Amt (₹)', 'Prev Bill Amt (₹)', 'This Bill Amt (₹)'].forEach((h, i) => {
    const cell = hdrRow8.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  hdrRow8.height = 30;

  // Calculate totals
  const boqQuoted = billData.items.reduce((s, i) => s + i.tender_qty * i.tender_rate, 0);
  const uptoDate = billData.items.reduce((s, i) => s + i.upto_amount, 0);
  const prevAmt = billData.items.reduce((s, i) => s + i.prev_amount, 0);
  const thisAmt = billData.items.reduce((s, i) => s + i.this_amount, 0);

  // Row 9: Site data
  const dataRow9 = abstractSheet.getRow(9);
  [1, billData.site_name.slice(0, 15), billData.site_name, boqQuoted, uptoDate, prevAmt, thisAmt].forEach((v, i) => {
    const cell = dataRow9.getCell(i + 1);
    cell.value = v;
    cell.border = THIN_BORDER;
    if (i >= 3) {
      cell.numFmt = '##,##,##0.00';
      cell.alignment = { horizontal: 'right' };
    }
  });
  dataRow9.height = 20;

  // Freeze panes at row 8
  abstractSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9', activeCell: 'A9' }];

  // ─── SHEET 2: Statement of Accounts ──────────────────────────────────────────
  const soaSheet = workbook.addWorksheet('STATEMENT OF ACCOUNTS');
  soaSheet.columns = [
    { width: 5 },   // A: Row label
    { width: 50 },  // B: Description
    { width: 20 },  // C: Amount
  ];

  const netTotal = uptoDate;
  const tpDeduction = netTotal * 0.036; // 3.60%
  const afterTP = netTotal - tpDeduction;
  const priceVariation = 0;
  const afterPV = afterTP + priceVariation;
  const retention = afterPV * 0.05;
  const netPayable = afterPV - retention;

  const soaRows = [
    { label: 'A', desc: `${billData.site_name} amount`, amt: uptoDate },
    { label: 'B', desc: 'Other works amount', amt: 0 },
    { label: 'C', desc: 'Total (A+B)', amt: uptoDate },
    { label: 'D', desc: 'T.P. -3.60% of C', amt: -tpDeduction },
    { label: 'E', desc: 'C - D', amt: afterTP },
    { label: 'F', desc: 'Price Variation (Clause-59)', amt: priceVariation },
    { label: 'G', desc: 'E + F', amt: afterPV },
    { label: 'H', desc: '5% Retention of G', amt: -retention },
    { label: 'I', desc: 'G - H (Net Payable, excl. GST)', amt: netPayable },
  ];

  // Header row for SOA
  const soaTitle = soaSheet.getRow(1);
  soaSheet.mergeCells(1, 1, 1, 3);
  soaTitle.getCell(1).value = 'STATEMENT OF ACCOUNTS';
  soaTitle.getCell(1).font = { bold: true, size: 13 };
  soaTitle.getCell(1).alignment = { horizontal: 'center' };
  soaTitle.getCell(1).fill = HEADER_FILL;

  soaSheet.mergeCells(2, 1, 2, 3);
  soaSheet.getRow(2).getCell(1).value = `RA Bill No: ${billData.bill_no} | Date: ${billData.bill_date}`;
  soaSheet.getRow(2).getCell(1).alignment = { horizontal: 'center' };

  const soaHdr = soaSheet.getRow(3);
  ['Row', 'Description', 'Amount (₹)'].forEach((h, i) => {
    soaHdr.getCell(i + 1).value = h;
    soaHdr.getCell(i + 1).font = { bold: true };
    soaHdr.getCell(i + 1).fill = HEADER_FILL;
    soaHdr.getCell(i + 1).border = THIN_BORDER;
    soaHdr.getCell(i + 1).alignment = { horizontal: 'center' };
  });

  soaRows.forEach((row, idx) => {
    const r = soaSheet.getRow(4 + idx);
    r.getCell(1).value = row.label;
    r.getCell(2).value = row.desc;
    r.getCell(3).value = row.amt;
    r.getCell(3).numFmt = '##,##,##0.00';
    r.getCell(3).alignment = { horizontal: 'right' };
    [1, 2, 3].forEach(c => { r.getCell(c).border = THIN_BORDER; });
    if (row.label === 'I') {
      [1, 2, 3].forEach(c => {
        r.getCell(c).font = { bold: true };
        r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
      });
    }
  });

  // ─── SHEET 3: Abstract Sheet (BOQ items) ─────────────────────────────────────
  const boqSheet = workbook.addWorksheet('Abstract Sheet');
  boqSheet.columns = [
    { width: 8 },   // Sr
    { width: 12 },  // Schedule
    { width: 40 },  // Description
    { width: 10 },  // Unit
    { width: 12 },  // Tender Qty
    { width: 14 },  // Tender Rate
    { width: 14 },  // Tender Amt
    { width: 12 },  // Prev Qty
    { width: 14 },  // Prev Amt
    { width: 12 },  // This Qty
    { width: 14 },  // This Amt
    { width: 12 },  // Upto Qty
    { width: 14 },  // Upto Amt
  ];

  // Title
  boqSheet.mergeCells(1, 1, 1, 13);
  boqSheet.getRow(1).getCell(1).value = 'ABSTRACT SHEET - BILL OF QUANTITIES';
  boqSheet.getRow(1).getCell(1).font = { bold: true, size: 13 };
  boqSheet.getRow(1).getCell(1).alignment = { horizontal: 'center' };
  boqSheet.getRow(1).getCell(1).fill = HEADER_FILL;

  boqSheet.mergeCells(2, 1, 2, 13);
  boqSheet.getRow(2).getCell(1).value = `Site: ${billData.site_name} | RA Bill No: ${billData.bill_no} | Date: ${billData.bill_date}`;
  boqSheet.getRow(2).getCell(1).alignment = { horizontal: 'center' };

  // Column headers
  const boqHdrRow = boqSheet.getRow(3);
  const boqHeaders = ['Sr.No', 'Schedule', 'Description', 'Unit',
    'Tender Qty', 'Tender Rate', 'Tender Amt (₹)',
    'Prev Qty', 'Prev Amt (₹)',
    'This Qty', 'This Amt (₹)',
    'Upto Qty', 'Upto Amt (₹)'];
  boqHeaders.forEach((h, i) => {
    boqHdrRow.getCell(i + 1).value = h;
    boqHdrRow.getCell(i + 1).font = { bold: true };
    boqHdrRow.getCell(i + 1).fill = HEADER_FILL;
    boqHdrRow.getCell(i + 1).border = THIN_BORDER;
    boqHdrRow.getCell(i + 1).alignment = { horizontal: 'center', wrapText: true };
  });
  boqHdrRow.height = 30;

  // Group items by schedule
  const scheduleGroups = {};
  for (const item of billData.items) {
    const sch = item.schedule || 'A';
    if (!scheduleGroups[sch]) scheduleGroups[sch] = [];
    scheduleGroups[sch].push(item);
  }

  let currentRow = 4;
  let grandTender = 0, grandPrev = 0, grandThis = 0, grandUpto = 0;

  for (const [schedule, items] of Object.entries(scheduleGroups)) {
    // Schedule header
    boqSheet.mergeCells(currentRow, 1, currentRow, 13);
    const schCell = boqSheet.getRow(currentRow).getCell(1);
    schCell.value = `Schedule: ${schedule}`;
    schCell.font = { bold: true, italic: true };
    schCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };
    boqSheet.getRow(currentRow).height = 18;
    currentRow++;

    let subTenderAmt = 0, subPrevAmt = 0, subThisAmt = 0, subUptoAmt = 0;

    for (const item of items) {
      const tenderAmt = item.tender_qty * item.tender_rate;
      const r = boqSheet.getRow(currentRow);
      r.getCell(1).value = item.sr_no;
      r.getCell(2).value = item.schedule;
      r.getCell(3).value = item.description;
      r.getCell(4).value = item.unit;
      r.getCell(5).value = item.tender_qty;
      r.getCell(6).value = item.tender_rate;
      r.getCell(7).value = tenderAmt;
      r.getCell(8).value = item.prev_qty;
      r.getCell(9).value = item.prev_amount;
      r.getCell(10).value = item.this_qty;
      r.getCell(11).value = item.this_amount;
      r.getCell(12).value = item.upto_qty;
      r.getCell(13).value = item.upto_amount;

      // Format number cells
      [5, 6, 7, 8, 9, 10, 11, 12, 13].forEach(col => {
        r.getCell(col).numFmt = '##,##,##0.00';
        r.getCell(col).alignment = { horizontal: 'right' };
      });
      for (let c = 1; c <= 13; c++) r.getCell(c).border = THIN_BORDER;
      r.height = 18;

      subTenderAmt += tenderAmt;
      subPrevAmt += item.prev_amount;
      subThisAmt += item.this_amount;
      subUptoAmt += item.upto_amount;
      currentRow++;
    }

    // Sub-total row
    const subRow = boqSheet.getRow(currentRow);
    boqSheet.mergeCells(currentRow, 1, currentRow, 6);
    subRow.getCell(1).value = `Sub-Total (${schedule})`;
    subRow.getCell(1).font = { bold: true };
    subRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEECC' } };
    subRow.getCell(7).value = subTenderAmt;
    subRow.getCell(9).value = subPrevAmt;
    subRow.getCell(11).value = subThisAmt;
    subRow.getCell(13).value = subUptoAmt;
    [7, 9, 11, 13].forEach(col => {
      subRow.getCell(col).numFmt = '##,##,##0.00';
      subRow.getCell(col).alignment = { horizontal: 'right' };
      subRow.getCell(col).font = { bold: true };
    });
    for (let c = 1; c <= 13; c++) subRow.getCell(c).border = THIN_BORDER;
    subRow.height = 20;
    currentRow++;

    grandTender += subTenderAmt;
    grandPrev += subPrevAmt;
    grandThis += subThisAmt;
    grandUpto += subUptoAmt;
  }

  // Grand total row
  const gtRow = boqSheet.getRow(currentRow);
  boqSheet.mergeCells(currentRow, 1, currentRow, 6);
  gtRow.getCell(1).value = 'GRAND TOTAL';
  gtRow.getCell(1).font = { bold: true, size: 12 };
  gtRow.getCell(1).fill = HEADER_FILL;
  gtRow.getCell(7).value = grandTender;
  gtRow.getCell(9).value = grandPrev;
  gtRow.getCell(11).value = grandThis;
  gtRow.getCell(13).value = grandUpto;
  [7, 9, 11, 13].forEach(col => {
    gtRow.getCell(col).numFmt = '##,##,##0.00';
    gtRow.getCell(col).alignment = { horizontal: 'right' };
    gtRow.getCell(col).font = { bold: true, size: 12 };
    gtRow.getCell(col).fill = HEADER_FILL;
  });
  for (let c = 1; c <= 13; c++) gtRow.getCell(c).border = THIN_BORDER;
  gtRow.height = 24;

  // Freeze panes at row 3 (after headers)
  boqSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4', activeCell: 'A4' }];

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = router;

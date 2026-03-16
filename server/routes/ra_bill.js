const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Format Indian number
function indFmt(n) {
  const num = parseFloat(n) || 0;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET /api/ra-bill/generate/:site_id
router.get('/generate/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { bill_no, bill_from, bill_to, bill_date } = req.query;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const boqItems = db.prepare(`
    SELECT item_number, description, unit, quantity as tender_qty, rate as tender_rate,
           work_completed_pct, actual_cost, total_amount, remaining_work
    FROM boq_items WHERE site_id = ? ORDER BY item_number
  `).all(site_id);

  if (boqItems.length === 0) return res.status(400).json({ error: 'No BOQ items found for this site' });

  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Aditi Construction ERP';
    workbook.created = new Date();

    const billNumber = bill_no || '1';
    const fromDate = bill_from || site.start_date || '';
    const toDate = bill_to || new Date().toISOString().split('T')[0];
    const billDate = bill_date || toDate;

    // ---- Sheet 1: Payment Abstract ----
    const absSheet = workbook.addWorksheet('Payment Abstract');
    absSheet.properties.defaultColWidth = 15;

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
    const thinBorder = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    };

    // Set column widths
    absSheet.columns = [
      { width: 6 }, { width: 16 }, { width: 30 }, { width: 16 },
      { width: 16 }, { width: 16 }, { width: 16 }
    ];

    const mergeAndStyle = (sheet, rowNum, startCol, endCol, value, opts = {}) => {
      const row = sheet.getRow(rowNum);
      const cell = row.getCell(startCol);
      cell.value = value;
      cell.alignment = { horizontal: opts.align || 'center', vertical: 'middle', wrapText: true };
      if (opts.bold !== false) cell.font = { bold: true, size: opts.size || 11 };
      if (opts.fill) cell.fill = opts.fill;
      if (opts.border !== false) cell.border = thinBorder;
      if (endCol > startCol) sheet.mergeCells(rowNum, startCol, rowNum, endCol);
      row.height = opts.height || 18;
    };

    mergeAndStyle(absSheet, 1, 1, 7, 'GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR', { size: 14, height: 22 });
    mergeAndStyle(absSheet, 2, 1, 7, site.tender_number ? `Work Order: ${site.tender_number}` : 'HALOL WSS SWAP-III under AMRUT 2.0 & SJMMSVY UGD PHASE II');
    mergeAndStyle(absSheet, 3, 1, 7, site.site_name, { height: 28 });
    mergeAndStyle(absSheet, 4, 1, 7, `Work Order: ${site.tender_number || 'N/A'} | Dept: ${site.department_name || 'N/A'}`);
    mergeAndStyle(absSheet, 5, 1, 7, `Agency: ${site.contractor_name || 'Aditi Construction Pvt Ltd'}`);
    mergeAndStyle(absSheet, 6, 1, 7, `RA Bill - ${billNumber} | Period: ${fromDate} to ${toDate} | Date: ${billDate}`, { size: 12 });
    mergeAndStyle(absSheet, 7, 1, 7, 'GROSS PAYMENT SUMMARY OF ABSTRACT', { size: 12, fill: headerFill });

    // Header row
    const hdrRow = absSheet.getRow(8);
    ['Sr.No', 'Schedule No', 'Work Description', 'BOQ Quoted Amt', 'Upto Date Amt', 'Prev Bill Amt', 'This Bill Amt'].forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = headerFill;
      cell.border = thinBorder;
    });
    hdrRow.height = 20;

    // Calculate totals
    const totalBOQAmt = boqItems.reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalUptoAmt = boqItems.reduce((s, i) => s + (i.actual_cost || 0), 0);
    const prevBillAmt = totalUptoAmt * 0.6; // Estimated previous bill (60% of upto date)
    const thisBillAmt = totalUptoAmt - prevBillAmt;

    const dataRow = absSheet.getRow(9);
    [1, `B-1`, site.site_name, totalBOQAmt, totalUptoAmt, prevBillAmt, thisBillAmt].forEach((v, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = v;
      cell.border = thinBorder;
      if (typeof v === 'number') {
        cell.numFmt = '##,##,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'center' };
      }
    });

    absSheet.views = [{ state: 'frozen', ySplit: 8 }];

    // ---- Sheet 2: Statement of Accounts ----
    const soaSheet = workbook.addWorksheet('STATEMENT OF ACCOUNTS');
    soaSheet.columns = [{ width: 4 }, { width: 50 }, { width: 20 }];

    const soaData = [
      ['A', `Gross Amount for ${site.site_name}`, totalUptoAmt],
      ['B', 'Additional Work / Variation', 0],
      ['C', 'Total (A + B)', totalUptoAmt],
      ['D', 'T.P. -3.60% of C', -(totalUptoAmt * 0.036)],
      ['E', 'C - D', totalUptoAmt * (1 - 0.036)],
      ['F', 'Price Variation (Clause-59)', 0],
      ['G', 'E + F', totalUptoAmt * (1 - 0.036)],
      ['H', '5% Retention of G', -(totalUptoAmt * (1 - 0.036) * 0.05)],
      ['I', 'Net Payable Amount (G - H) (Excl. GST)', totalUptoAmt * (1 - 0.036) * 0.95],
    ];

    soaSheet.addRow([]);
    mergeAndStyle(soaSheet, 1, 1, 3, 'STATEMENT OF ACCOUNTS', { size: 13, fill: headerFill });
    mergeAndStyle(soaSheet, 2, 1, 3, site.site_name);

    soaData.forEach((row, idx) => {
      const r = soaSheet.addRow(row);
      r.getCell(1).font = { bold: true };
      r.getCell(3).numFmt = '##,##,##0.00';
      r.getCell(3).alignment = { horizontal: 'right' };
      r.eachCell(cell => { cell.border = thinBorder; });
      if (row[0] === 'I') {
        r.eachCell(cell => { cell.font = { bold: true }; cell.fill = headerFill; });
      }
    });

    // ---- Sheet 3: Abstract Sheet ----
    const abstractSheet = workbook.addWorksheet('Abstract Sheet');
    abstractSheet.columns = [
      { width: 6 }, { width: 40 }, { width: 8 }, { width: 12 }, { width: 12 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }
    ];

    mergeAndStyle(abstractSheet, 1, 1, 10, 'ABSTRACT OF BILL OF QUANTITIES', { size: 13, fill: headerFill });
    mergeAndStyle(abstractSheet, 2, 1, 10, site.site_name);
    mergeAndStyle(abstractSheet, 3, 1, 10, `RA Bill No: ${billNumber} | Period: ${fromDate} to ${toDate}`);

    const absHdrRow = abstractSheet.getRow(4);
    ['Sr', 'Description', 'Unit', 'Tender Qty', 'Tender Rate', 'Prev Qty', 'Prev Amt', 'This Qty', 'This Amt', 'Upto Amt'].forEach((h, i) => {
      const cell = absHdrRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = headerFill;
      cell.border = thinBorder;
    });
    absHdrRow.height = 22;

    let grandTotal = 0;
    boqItems.forEach((item, idx) => {
      const tenderAmt = (item.tender_qty || 0) * (item.tender_rate || 0);
      const doneQty = item.tender_qty ? Math.round(item.tender_qty * (item.work_completed_pct || 0) / 100) : 0;
      const prevQty = Math.round(doneQty * 0.6);
      const prevAmt = prevQty * (item.tender_rate || 0);
      const thisQty = doneQty - prevQty;
      const thisAmt = thisQty * (item.tender_rate || 0);
      const uptoAmt = doneQty * (item.tender_rate || 0);
      grandTotal += uptoAmt;

      const r = abstractSheet.addRow([
        idx + 1, item.description, item.unit,
        item.tender_qty, item.tender_rate,
        prevQty, prevAmt, thisQty, thisAmt, uptoAmt
      ]);
      r.eachCell((cell, colNum) => {
        cell.border = thinBorder;
        if (colNum >= 4) {
          cell.numFmt = colNum === 4 || colNum === 6 || colNum === 8 ? '#,##0.00' : '##,##,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
    });

    // Grand Total Row
    const gtRow = abstractSheet.addRow([
      '', 'GRAND TOTAL', '', '', '', '', '', '', '', grandTotal
    ]);
    gtRow.eachCell(cell => {
      cell.border = thinBorder;
      cell.font = { bold: true };
      cell.fill = headerFill;
    });
    gtRow.getCell(10).numFmt = '##,##,##0.00';
    gtRow.getCell(10).alignment = { horizontal: 'right' };

    abstractSheet.views = [{ state: 'frozen', ySplit: 4 }];

    // Stream workbook as response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="RA_Bill_${site.site_name.replace(/[^a-z0-9]/gi, '_')}_${billNumber}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('RA Bill generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate RA Bill' });
  }
});

// GET /api/ra-bill/preview/:site_id - JSON preview of bill data
router.get('/preview/:site_id', authenticate, (req, res) => {
  const { site_id } = req.params;
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const boqItems = db.prepare(`
    SELECT item_number, description, unit, quantity as tender_qty, rate as tender_rate,
           work_completed_pct, actual_cost, total_amount, remaining_work
    FROM boq_items WHERE site_id = ? ORDER BY item_number
  `).all(site_id);

  const totalBOQAmt = boqItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalUptoAmt = boqItems.reduce((s, i) => s + (i.actual_cost || 0), 0);
  const prevBillAmt = totalUptoAmt * 0.6;
  const thisBillAmt = totalUptoAmt - prevBillAmt;
  const afterTP = totalUptoAmt * (1 - 0.036);
  const netPayable = afterTP * 0.95;

  res.json({
    site,
    boq_items: boqItems,
    summary: {
      total_boq_amount: totalBOQAmt,
      upto_date_amount: totalUptoAmt,
      prev_bill_amount: prevBillAmt,
      this_bill_amount: thisBillAmt,
      tp_deduction: totalUptoAmt * 0.036,
      after_tp: afterTP,
      retention: afterTP * 0.05,
      net_payable: netPayable
    }
  });
});

module.exports = router;

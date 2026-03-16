const ExcelJS = require('exceljs');

/**
 * Generate a Government RA Bill Excel file (GUDCL Halol WSS format).
 * @param {Object} billData
 * @returns {Promise<Buffer>} Excel file as Buffer
 */
async function generateRaBill(billData) {
  const {
    bill_no = 1,
    bill_period_from = '',
    bill_period_to = '',
    bill_date = '',
    work_name = '',
    work_order_no = '',
    agency_name = '',
    items = [],
  } = billData;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aditi Construction ERP';
  workbook.created = new Date();

  // ─────────────────────────────────────────────────────────────────
  // Helper styles
  // ─────────────────────────────────────────────────────────────────
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
  const boldFont = { bold: true };
  const titleFont = { bold: true, size: 14 };
  const subTitleFont = { bold: true, size: 12 };
  const thinBorder = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  };
  const amountFmt = '##,##,##0.00';
  const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const rightAlign = { horizontal: 'right', vertical: 'middle' };
  const leftAlign = { horizontal: 'left', vertical: 'middle', wrapText: true };

  function applyBorder(cell) { cell.border = thinBorder; }
  function styleHeader(cell, fill = true) {
    cell.font = boldFont;
    cell.alignment = centerAlign;
    cell.border = thinBorder;
    if (fill) cell.fill = headerFill;
  }
  function applyAmount(cell) {
    cell.numFmt = amountFmt;
    cell.alignment = rightAlign;
    cell.border = thinBorder;
  }

  // Group items by schedule
  const schedules = {};
  for (const item of items) {
    const sched = item.schedule || 'General';
    if (!schedules[sched]) schedules[sched] = [];
    schedules[sched].push(item);
  }

  // Pre-compute schedule totals
  const schedTotals = {};
  for (const [sched, rows] of Object.entries(schedules)) {
    schedTotals[sched] = {
      tender_amt: rows.reduce((s, r) => s + ((r.tender_qty || 0) * (r.tender_rate || 0)), 0),
      upto_amt:   rows.reduce((s, r) => s + (r.upto_amount || 0), 0),
      prev_amt:   rows.reduce((s, r) => s + (r.prev_amount || 0), 0),
      this_amt:   rows.reduce((s, r) => s + (r.this_amount || 0), 0),
    };
  }
  const grandTotals = Object.values(schedTotals).reduce((acc, t) => ({
    tender_amt: acc.tender_amt + t.tender_amt,
    upto_amt:   acc.upto_amt   + t.upto_amt,
    prev_amt:   acc.prev_amt   + t.prev_amt,
    this_amt:   acc.this_amt   + t.this_amt,
  }), { tender_amt: 0, upto_amt: 0, prev_amt: 0, this_amt: 0 });

  const thisAmt = grandTotals.this_amt;
  const prevAmt = grandTotals.prev_amt;

  // ─────────────────────────────────────────────────────────────────
  // Sheet 3: Abstract Sheet (build first so we have references)
  // ─────────────────────────────────────────────────────────────────
  const abstractSheet = workbook.addWorksheet('Abstract Sheet');

  abstractSheet.columns = [
    { key: 'sr',        width: 6  },
    { key: 'schedule',  width: 12 },
    { key: 'desc',      width: 40 },
    { key: 'unit',      width: 8  },
    { key: 'tender_qty',width: 10 },
    { key: 'tender_rate',width: 12 },
    { key: 'tender_amt',width: 14 },
    { key: 'prev_qty',  width: 10 },
    { key: 'prev_amt',  width: 14 },
    { key: 'this_qty',  width: 10 },
    { key: 'this_amt',  width: 14 },
    { key: 'upto_qty',  width: 10 },
    { key: 'upto_amt',  width: 14 },
  ];

  // Header rows
  const ah1 = abstractSheet.addRow(['GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR', '', '', '', '', '', '', '', '', '', '', '', '']);
  abstractSheet.mergeCells(`A${ah1.number}:M${ah1.number}`);
  Object.assign(ah1.getCell(1), { font: titleFont, alignment: centerAlign, fill: headerFill });

  const ah2 = abstractSheet.addRow([`HALOL WSS SWAP-III under AMRUT 2.0 & SJMMSVY UGD PHASE II`, '', '', '', '', '', '', '', '', '', '', '', '']);
  abstractSheet.mergeCells(`A${ah2.number}:M${ah2.number}`);
  Object.assign(ah2.getCell(1), { font: subTitleFont, alignment: centerAlign, fill: headerFill });

  const ah3 = abstractSheet.addRow([work_name || 'Work Name', '', '', '', '', '', '', '', '', '', '', '', '']);
  abstractSheet.mergeCells(`A${ah3.number}:M${ah3.number}`);
  Object.assign(ah3.getCell(1), { font: boldFont, alignment: { horizontal: 'center', wrapText: true } });
  abstractSheet.getRow(ah3.number).height = 30;

  const ah4 = abstractSheet.addRow([`RA Bill No. ${bill_no}   |   Period: ${bill_period_from} to ${bill_period_to}   |   Date: ${bill_date}`, '', '', '', '', '', '', '', '', '', '', '', '']);
  abstractSheet.mergeCells(`A${ah4.number}:M${ah4.number}`);
  ah4.getCell(1).alignment = centerAlign;

  const ah5 = abstractSheet.addRow([`Agency: ${agency_name}`, '', '', '', '', '', '', '', '', '', '', '', '']);
  abstractSheet.mergeCells(`A${ah5.number}:M${ah5.number}`);
  ah5.getCell(1).alignment = centerAlign;

  // Column headers
  const headerLabels = ['Sr\nNo', 'Schedule\nNo', 'Description of Work', 'Unit',
    'Tender\nQty', 'Tender\nRate', 'Tender\nAmount',
    'Prev Bill\nQty', 'Prev Bill\nAmount',
    'This Bill\nQty', 'This Bill\nAmount',
    'Upto Date\nQty', 'Upto Date\nAmount'];
  const ach = abstractSheet.addRow(headerLabels);
  ach.height = 40;
  ach.eachCell(cell => styleHeader(cell));
  abstractSheet.views = [{ state: 'frozen', ySplit: ach.number }];

  // Data rows
  let srNo = 1;
  for (const [sched, rows] of Object.entries(schedules)) {
    // Schedule group header
    const sgRow = abstractSheet.addRow(['', sched, `Schedule: ${sched}`, '', '', '', '', '', '', '', '', '', '']);
    abstractSheet.mergeCells(`C${sgRow.number}:M${sgRow.number}`);
    sgRow.getCell(1).font = boldFont; sgRow.getCell(2).font = boldFont; sgRow.getCell(3).font = boldFont;
    sgRow.eachCell(applyBorder);

    for (const item of rows) {
      const tAmt = (item.tender_qty || 0) * (item.tender_rate || 0);
      const dataRow = abstractSheet.addRow([
        srNo++, sched, item.description || '', item.unit || '',
        item.tender_qty || 0, item.tender_rate || 0, tAmt,
        item.prev_qty || 0, item.prev_amount || 0,
        item.this_qty || 0, item.this_amount || 0,
        item.upto_qty || 0, item.upto_amount || 0,
      ]);
      dataRow.getCell(1).alignment = centerAlign; dataRow.getCell(1).border = thinBorder;
      dataRow.getCell(2).alignment = centerAlign; dataRow.getCell(2).border = thinBorder;
      dataRow.getCell(3).alignment = leftAlign;   dataRow.getCell(3).border = thinBorder;
      dataRow.getCell(4).alignment = centerAlign; dataRow.getCell(4).border = thinBorder;
      for (let c = 5; c <= 13; c++) applyAmount(dataRow.getCell(c));
    }

    // Sub-total row
    const t = schedTotals[sched];
    const stRow = abstractSheet.addRow(['', '', `Sub-Total: ${sched}`, '', '', '', t.tender_amt, '', t.prev_amt, '', t.this_amt, '', t.upto_amt]);
    stRow.getCell(1).border = thinBorder; stRow.getCell(2).border = thinBorder;
    stRow.getCell(3).font = boldFont; stRow.getCell(3).border = thinBorder;
    stRow.getCell(4).border = thinBorder; stRow.getCell(5).border = thinBorder; stRow.getCell(6).border = thinBorder;
    for (const c of [7, 9, 11, 13]) { stRow.getCell(c).font = boldFont; applyAmount(stRow.getCell(c)); }
    stRow.getCell(8).border = thinBorder; stRow.getCell(10).border = thinBorder; stRow.getCell(12).border = thinBorder;
    stRow.fill = headerFill;
  }

  // Grand total row
  const gtRow = abstractSheet.addRow(['', '', 'GRAND TOTAL', '', '', '', grandTotals.tender_amt, '', grandTotals.prev_amt, '', grandTotals.this_amt, '', grandTotals.upto_amt]);
  gtRow.getCell(3).font = { bold: true, size: 12 };
  for (let c = 1; c <= 13; c++) {
    gtRow.getCell(c).font = Object.assign({}, boldFont, { size: 12 });
    gtRow.getCell(c).border = thinBorder;
  }
  for (const c of [7, 9, 11, 13]) applyAmount(gtRow.getCell(c));
  gtRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };

  // ─────────────────────────────────────────────────────────────────
  // Sheet 2: Statement of Accounts
  // ─────────────────────────────────────────────────────────────────
  const stmtSheet = workbook.addWorksheet('STATEMENT OF ACCOUNTS');
  stmtSheet.columns = [
    { key: 'label', width: 6  },
    { key: 'desc',  width: 60 },
    { key: 'amt',   width: 20 },
  ];

  const stTitle = stmtSheet.addRow(['STATEMENT OF ACCOUNTS', '', '']);
  stmtSheet.mergeCells(`A${stTitle.number}:C${stTitle.number}`);
  stTitle.getCell(1).font = titleFont;
  stTitle.getCell(1).alignment = centerAlign;
  stTitle.getCell(1).fill = headerFill;

  const stH = stmtSheet.addRow(['Ref', 'Particulars', 'Amount (₹)']);
  stH.eachCell(c => styleHeader(c));

  const tp = 0.036; // 3.60%
  const totalC = thisAmt;
  const tpAmt = totalC * tp;
  const afterTP = totalC - tpAmt;
  const priceVar = 0;
  const afterPV = afterTP + priceVar;
  const retention = afterPV * 0.05;
  const netPayable = afterPV - retention;

  const stmtRows = [
    ['A', 'Halol WSS - This Bill Amount', thisAmt],
    ['B', 'Halol UGD - This Bill Amount (if applicable)', 0],
    ['C', 'Total (A + B)', totalC],
    ['D', 'T.P. @ 3.60% of C', -tpAmt],
    ['E', 'Net Amount after T.P. (C - D)', afterTP],
    ['F', 'Price Variation (Clause-59)', priceVar],
    ['G', 'Total (E + F)', afterPV],
    ['H', '5% Retention of G', -retention],
    ['I', 'Net Payable Amount (G - H)  [Excl. GST]', netPayable],
  ];

  for (const [ref, desc, amt] of stmtRows) {
    const r = stmtSheet.addRow([ref, desc, amt]);
    r.getCell(1).font = boldFont; r.getCell(1).alignment = centerAlign; applyBorder(r.getCell(1));
    r.getCell(2).alignment = leftAlign; applyBorder(r.getCell(2));
    r.getCell(3).numFmt = amountFmt; r.getCell(3).alignment = rightAlign; applyBorder(r.getCell(3));
    if (ref === 'I') { r.font = boldFont; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } }; }
  }

  // ─────────────────────────────────────────────────────────────────
  // Sheet 1: Payment Abstract
  // ─────────────────────────────────────────────────────────────────
  const paySheet = workbook.addWorksheet('Payment Abstract', {}, 0); // insert at position 0 (first)
  workbook.spliceWorksheets(0, 0, paySheet); // move to first position

  paySheet.columns = [
    { key: 'a', width: 8  },
    { key: 'b', width: 14 },
    { key: 'c', width: 25 },
    { key: 'd', width: 18 },
    { key: 'e', width: 18 },
    { key: 'f', width: 18 },
    { key: 'g', width: 18 },
    { key: 'h', width: 12 },
    { key: 'i', width: 12 },
    { key: 'j', width: 12 },
  ];

  function addMergedTitle(sheet, rowNo, value, font, fill) {
    const r = sheet.addRow([value, '', '', '', '', '', '', '', '', '']);
    sheet.mergeCells(`A${r.number}:J${r.number}`);
    r.getCell(1).font = font || boldFont;
    r.getCell(1).alignment = centerAlign;
    if (fill) r.getCell(1).fill = headerFill;
    r.getCell(1).border = thinBorder;
    return r;
  }

  addMergedTitle(paySheet, 1, 'GUJARAT URBAN DEVELOPMENT COMPANY, GANDHINAGAR', titleFont, true);
  addMergedTitle(paySheet, 2, 'HALOL WSS SWAP-III under AMRUT 2.0 & SJMMSVY UGD PHASE II', subTitleFont, true);
  addMergedTitle(paySheet, 3, work_name || 'Full Work Name', boldFont, false);
  paySheet.getRow(3).height = 30;
  addMergedTitle(paySheet, 4, `Work Order No: ${work_order_no || '-'}   Date: ${bill_date}`, null, false);
  addMergedTitle(paySheet, 5, `Agency: ${agency_name || '-'}`, null, false);
  addMergedTitle(paySheet, 6, `RA Bill - ${bill_no}`, boldFont, false);
  addMergedTitle(paySheet, 7, 'GROSS PAYMENT SUMMARY OF ABSTRACT', boldFont, true);

  // Table header row 8
  const pHeader = paySheet.addRow(['Sr.No', 'Schedule No', 'Nagarpalika', 'BOQ Quoted Amt', 'Upto Date Amt', 'Prev Bill Amt', 'This Bill Amt', '', '', '']);
  paySheet.mergeCells(`G${pHeader.number}:J${pHeader.number}`);
  pHeader.eachCell(c => styleHeader(c));
  paySheet.views = [{ state: 'frozen', ySplit: pHeader.number }];

  // Row 9: Halol WSS data
  const schedNames = Object.keys(schedules);
  const wssRow = paySheet.addRow([
    1, schedNames[0] || 'B-1', 'Halol WSS',
    grandTotals.tender_amt, grandTotals.upto_amt, prevAmt, thisAmt, '', '', ''
  ]);
  paySheet.mergeCells(`G${wssRow.number}:J${wssRow.number}`);
  wssRow.getCell(1).alignment = centerAlign; applyBorder(wssRow.getCell(1));
  wssRow.getCell(2).alignment = centerAlign; applyBorder(wssRow.getCell(2));
  wssRow.getCell(3).alignment = leftAlign; applyBorder(wssRow.getCell(3));
  for (const c of [4, 5, 6, 7]) applyAmount(wssRow.getCell(c));
  wssRow.getCell(7).font = boldFont;

  // Row 10: Halol UGD (placeholder row)
  const ugdRow = paySheet.addRow([2, schedNames[1] || 'C-1', 'Halol UGD', 0, 0, 0, 0, '', '', '']);
  paySheet.mergeCells(`G${ugdRow.number}:J${ugdRow.number}`);
  ugdRow.getCell(1).alignment = centerAlign; applyBorder(ugdRow.getCell(1));
  ugdRow.getCell(2).alignment = centerAlign; applyBorder(ugdRow.getCell(2));
  ugdRow.getCell(3).alignment = leftAlign; applyBorder(ugdRow.getCell(3));
  for (const c of [4, 5, 6, 7]) applyAmount(ugdRow.getCell(c));

  // Summary note
  const noteRow = paySheet.addRow([`Net Payable (Excl. GST): ₹${netPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}  |  5% Retention: ₹${retention.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, '', '', '', '', '', '', '', '', '']);
  paySheet.mergeCells(`A${noteRow.number}:J${noteRow.number}`);
  noteRow.getCell(1).font = boldFont;
  noteRow.getCell(1).alignment = centerAlign;
  noteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };

  // Return as buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = { generateRaBill };

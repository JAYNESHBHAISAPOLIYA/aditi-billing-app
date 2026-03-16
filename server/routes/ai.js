const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

// Cache for project context (5-minute TTL)
const contextCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedContext(siteId) {
  const entry = contextCache.get(siteId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCachedContext(siteId, data) {
  contextCache.set(siteId, { ts: Date.now(), data });
}

function invalidateCache(siteId) {
  contextCache.delete(siteId);
}

// Build project context from DB
function buildProjectContext(siteId) {
  const cached = getCachedContext(siteId);
  if (cached) return cached;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return null;

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ?').all(siteId);
  const dprs = db.prepare('SELECT * FROM dpr_records WHERE site_id = ? ORDER BY report_date DESC LIMIT 7').all(siteId);
  const materials = db.prepare('SELECT material_name, SUM(quantity) as qty, unit, SUM(total_amount) as cost FROM material_purchases WHERE site_id = ? GROUP BY material_name, unit').all(siteId);
  const labour = db.prepare('SELECT COALESCE(SUM(total_salary),0) as total FROM labour_records WHERE site_id = ?').get(siteId);
  const fuel = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM fuel_expenses WHERE site_id = ?').get(siteId);
  const machinery = db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM machinery_expenses WHERE site_id = ?').get(siteId);

  const context = {
    project: {
      name: site.site_name,
      location: site.site_location,
      status: site.status,
      progress: site.progress_percentage,
      estimated_cost: site.estimated_cost,
      start_date: site.start_date,
      completion_date: site.completion_date,
    },
    boq_items: boqItems.map(b => ({
      item: b.item_number,
      description: b.description,
      unit: b.unit,
      qty_tender: b.qty_tender || b.quantity || 0,
      qty_used: b.qty_used || 0,
      balance: (b.qty_tender || b.quantity || 0) - (b.qty_used || 0),
      sor_rate: b.sor_rate || b.rate || 0,
      total_amount: b.total_amount || 0,
      work_completed_pct: b.work_completed_pct || 0,
    })),
    last_7_dprs: dprs.map(d => ({
      date: d.report_date,
      work_done: d.work_done,
      labour: { skilled: d.labour_skilled, unskilled: d.labour_unskilled, amount: d.labour_amount },
      weather: d.weather,
      remarks: d.remarks,
    })),
    expenses: {
      materials: materials,
      labour_total: labour.total,
      fuel_total: fuel.total,
      machinery_total: machinery.total,
      grand_total: labour.total + fuel.total + machinery.total,
    },
  };

  setCachedContext(siteId, context);
  return context;
}

// Find SOR rate using keyword matching
function findSorMatch(keywords, description) {
  const searchTerms = (keywords || []).concat(
    (description || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );
  const allRates = db.prepare('SELECT * FROM sor_rates').all();
  let bestMatch = null;
  let bestScore = 0;

  for (const sor of allRates) {
    const sorKeywords = (sor.keywords || '').toLowerCase().split(/\s+/);
    const sorDesc = (sor.description || '').toLowerCase().split(/\s+/);
    const sorWords = new Set([...sorKeywords, ...sorDesc]);
    let score = 0;
    for (const term of searchTerms) {
      const termLower = term.toLowerCase();
      if (sorWords.has(termLower)) score += 2;
      else {
        for (const w of sorWords) {
          if (w.includes(termLower) || termLower.includes(w)) { score += 1; break; }
        }
      }
    }
    if (score > bestScore) { bestScore = score; bestMatch = sor; }
  }

  return bestMatch && bestScore > 0
    ? { match: bestMatch, confidence: Math.min(95, Math.round(bestScore * 10)) }
    : null;
}

async function callClaude(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: null, mock: true };
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    });
    return { text: response.content[0].text, mock: false };
  } catch (err) {
    return { text: null, error: err.message, mock: true };
  }
}

// POST /api/ai/upload-boq/:siteId
router.post('/upload-boq/:siteId', authenticate, upload.single('file'), async (req, res) => {
  const { siteId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const filePath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);
  let pdfText = '';

  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    pdfText = data.text;
  } catch {
    pdfText = '';
  }

  const systemPrompt = `You are a Government Construction BOQ expert. Extract ALL line items from this BOQ document. Return STRICT JSON only, no extra text: {"items": [{"sr_no": "1", "description": "...", "unit": "RM", "quantity": 100, "estimated_rate": 485, "sor_keywords": ["di pipe", "100mm", "k7"]}]}`;
  const userMessage = pdfText
    ? `Extract BOQ items from this document text:\n\n${pdfText.substring(0, 8000)}`
    : 'No text could be extracted from the PDF. Return a sample BOQ with 3 items for a water supply project.';

  const { text, mock } = await callClaude(systemPrompt, userMessage);

  let extracted = [];
  if (text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extracted = parsed.items || [];
      }
    } catch { extracted = []; }
  }

  // If Claude returned nothing or no API key, use mock data
  if (extracted.length === 0 && mock) {
    extracted = [
      { sr_no: '1', description: 'Supply & Laying DI K7 Pipe 100mm dia', unit: 'RM', quantity: 2400, estimated_rate: 485, sor_keywords: ['di pipe', '100mm', 'k7'] },
      { sr_no: '2', description: 'Supply & Laying DI K7 Pipe 150mm dia', unit: 'RM', quantity: 800, estimated_rate: 720, sor_keywords: ['di pipe', '150mm', 'k7'] },
      { sr_no: '3', description: 'Providing & Fixing Sluice Valve 100mm', unit: 'Nos', quantity: 12, estimated_rate: 4200, sor_keywords: ['sluice valve', '100mm'] },
    ];
  }

  // Match SOR rates and save to DB
  const saved = [];
  const insertBoq = db.prepare(`
    INSERT INTO boq_items (site_id, item_number, description, unit, quantity, qty_tender, rate, sor_rate, sor_item_code, total_amount, remaining_work, source_doc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const item of extracted) {
      const sorResult = findSorMatch(item.sor_keywords || [], item.description);
      const sorRate = sorResult ? sorResult.match.rate : (item.estimated_rate || 0);
      const sorCode = sorResult ? sorResult.match.item_code : null;
      const qty = item.quantity || 0;
      const total = qty * sorRate;
      const result = insertBoq.run(
        siteId, item.sr_no || null, item.description, item.unit || null,
        qty, qty, sorRate, sorRate, sorCode, total, qty, req.file.filename
      );
      saved.push({
        id: result.lastInsertRowid,
        sr_no: item.sr_no,
        description: item.description,
        unit: item.unit,
        quantity: qty,
        sor_rate: sorRate,
        sor_item_code: sorCode,
        total_amount: total,
        confidence: sorResult ? sorResult.confidence : 0,
        sor_match: sorResult ? sorResult.match.description : null,
      });
    }
  });
  insertAll();

  invalidateCache(siteId);
  res.json({ extracted: saved, count: saved.length, mock });
});

// POST /api/ai/ask/:siteId
router.post('/ask/:siteId', authenticate, async (req, res) => {
  const { siteId } = req.params;
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  const context = buildProjectContext(siteId);
  if (!context) return res.status(404).json({ error: 'Site not found' });

  const systemPrompt = `You are AI assistant for Government Construction ERP. Answer in same language user asks (Gujarati/Hindi/English). Always give specific numbers with Indian comma format (e.g. ₹1,00,000). Data given is from PostgreSQL database. Answer precisely with numbers. Always mention source tables used.`;

  const contextStr = JSON.stringify(context, null, 2);
  // Limit context to fit in token window
  const truncated = contextStr.length > 6000 ? contextStr.substring(0, 6000) + '...(truncated)' : contextStr;
  const userMessage = `Project Data:\n${truncated}\n\nQuestion: ${question}`;

  const { text, mock, error } = await callClaude(systemPrompt, userMessage);

  if (mock) {
    // Generate a meaningful fallback answer from DB context
    const boq = context.boq_items;
    const totalBudget = context.project.estimated_cost;
    const spent = context.expenses.grand_total;
    const fallback = `Based on project "${context.project.name}":\n• BOQ Items: ${boq.length}\n• Total Budget: ₹${Number(totalBudget).toLocaleString('en-IN')}\n• Total Expenses: ₹${Number(spent).toLocaleString('en-IN')}\n• Progress: ${context.project.progress}%\n\n(AI answer requires ANTHROPIC_API_KEY. ${error ? 'Error: ' + error : 'No API key configured.'})`;
    return res.json({ answer: fallback, sources: ['boq_items', 'sites', 'expenses'], mock: true });
  }

  res.json({ answer: text, sources: ['boq_items', 'dpr_records', 'sites', 'material_purchases', 'labour_records'], mock: false });
});

// POST /api/ai/upload-dpr/:siteId
router.post('/upload-dpr/:siteId', authenticate, upload.single('file'), async (req, res) => {
  const { siteId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'File required' });

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const filePath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);
  let pdfText = '';

  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    pdfText = data.text;
  } catch {
    pdfText = '';
  }

  const systemPrompt = `Extract DPR (Daily Progress Report) data. Return STRICT JSON only: {"date": "YYYY-MM-DD", "work_done": [{"item": "...", "qty": 50, "unit": "RM", "location": "..."}], "labour": {"skilled": 5, "unskilled": 10, "amount": 8500}, "materials_used": [{"item": "...", "qty": 10, "unit": "bag"}], "remarks": "...", "weather": "Sunny"}`;
  const userMessage = pdfText
    ? `Extract DPR data from this text:\n\n${pdfText.substring(0, 6000)}`
    : 'No text extracted. Return sample DPR for a water supply pipe laying project.';

  const { text, mock } = await callClaude(systemPrompt, userMessage);

  let dprData = null;
  if (text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) dprData = JSON.parse(jsonMatch[0]);
    } catch { dprData = null; }
  }

  if (!dprData || mock) {
    dprData = {
      date: new Date().toISOString().split('T')[0],
      work_done: [{ item: 'DI K7 Pipe 100mm laying', qty: 120, unit: 'RM', location: 'Ch. 0+000 to 0+120' }],
      labour: { skilled: 4, unskilled: 8, amount: 9200 },
      materials_used: [{ item: 'DI Pipe 100mm', qty: 120, unit: 'RM' }],
      remarks: 'Work progressing as per schedule',
      weather: 'Sunny',
    };
  }

  // Save DPR record
  const dprResult = db.prepare(`
    INSERT INTO dpr_records (site_id, report_date, work_done, labour_skilled, labour_unskilled, labour_amount, materials_used, weather, remarks, source_doc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteId,
    dprData.date || new Date().toISOString().split('T')[0],
    JSON.stringify(dprData.work_done || []),
    dprData.labour?.skilled || 0,
    dprData.labour?.unskilled || 0,
    dprData.labour?.amount || 0,
    JSON.stringify(dprData.materials_used || []),
    dprData.weather || '',
    dprData.remarks || '',
    req.file.filename
  );

  // Auto-update BOQ qty_used from work_done
  const updated = [];
  for (const work of dprData.work_done || []) {
    const boqItems = db.prepare(
      "SELECT * FROM boq_items WHERE site_id = ? AND (description LIKE ? OR description LIKE ?)"
    ).all(siteId, `%${work.item}%`, `%${(work.item || '').split(' ').slice(0, 3).join('%')}%`);

    for (const boq of boqItems) {
      const newQtyUsed = (boq.qty_used || 0) + (work.qty || 0);
      const qtyTender = boq.qty_tender || boq.quantity || 0;
      const newPct = qtyTender > 0 ? Math.min(100, (newQtyUsed / qtyTender) * 100) : 0;
      db.prepare(`UPDATE boq_items SET qty_used = ?, work_completed_pct = ?, remaining_work = ? WHERE id = ?`)
        .run(newQtyUsed, newPct, Math.max(0, qtyTender - newQtyUsed), boq.id);
      updated.push({ boq_id: boq.id, description: boq.description, qty_added: work.qty, new_qty_used: newQtyUsed });
    }
  }

  invalidateCache(siteId);
  res.json({ dpr_id: dprResult.lastInsertRowid, dpr: dprData, boq_updated: updated, mock });
});

module.exports = router;
module.exports.invalidateCache = invalidateCache;

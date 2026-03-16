const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const fs = require('fs');

const router = express.Router();

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

// In-memory cache for project context (TTL: 5 minutes)
const contextCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedContext(siteId) {
  const entry = contextCache.get(siteId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCachedContext(siteId, data) {
  contextCache.set(siteId, { data, ts: Date.now() });
}

function invalidateCache(siteId) {
  contextCache.delete(siteId);
}

function buildProjectContext(siteId) {
  const cached = getCachedContext(siteId);
  if (cached) return cached;

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return null;

  const boqItems = db.prepare(`
    SELECT item_number, item_code, description, unit, quantity,
           qty_tender, qty_used, rate, sor_rate, total_amount,
           work_completed_pct, remaining_work, actual_cost
    FROM boq_items WHERE site_id = ?
    ORDER BY item_number
  `).all(siteId);

  const dprLast7 = db.prepare(`
    SELECT report_date, work_done, labour_skilled, labour_unskilled,
           labour_amount, materials_used, remarks, weather
    FROM dpr_records WHERE site_id = ? AND report_date >= date('now','-7 days')
    ORDER BY report_date DESC
  `).all(siteId);

  const expenseSummary = {
    material: db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM material_purchases WHERE site_id = ?').get(siteId)?.total || 0,
    labour: db.prepare('SELECT COALESCE(SUM(total_salary),0) as total FROM labour_records WHERE site_id = ?').get(siteId)?.total || 0,
    fuel: db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM fuel_expenses WHERE site_id = ?').get(siteId)?.total || 0,
    machinery: db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM machinery_expenses WHERE site_id = ?').get(siteId)?.total || 0,
    office: db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM office_expenses WHERE site_id = ?').get(siteId)?.total || 0,
  };
  expenseSummary.total = Object.values(expenseSummary).reduce((a, b) => a + b, 0);

  const totalBOQAmount = boqItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const completedAmount = boqItems.reduce((s, i) => s + ((i.qty_used || 0) * (i.rate || 0)), 0);
  const overallProgress = totalBOQAmount > 0 ? (completedAmount / totalBOQAmount) * 100 : 0;

  const ctx = {
    site: {
      name: site.site_name,
      location: site.site_location,
      project_type: site.project_type,
      start_date: site.start_date,
      completion_date: site.completion_date,
      estimated_cost: site.estimated_cost,
      progress_percentage: site.progress_percentage,
    },
    boq_items: boqItems,
    boq_summary: {
      total_items: boqItems.length,
      total_amount: totalBOQAmount,
      completed_amount: completedAmount,
      overall_progress_pct: overallProgress.toFixed(1),
    },
    dpr_last_7_days: dprLast7,
    expense_summary: expenseSummary,
  };

  setCachedContext(siteId, ctx);
  return ctx;
}

// POST /api/ai/upload-boq/:site_id
// Upload a BOQ PDF, extract items with Claude, match SOR rates, save to DB
router.post('/upload-boq/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id)) {
    return res.status(404).json({ error: 'Site not found' });
  }

  let pdfText = '';
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const parsed = await pdfParse(fileBuffer);
    pdfText = parsed.text;
  } catch (err) {
    return res.status(422).json({ error: `Could not parse PDF: ${err.message}` });
  }

  if (!pdfText.trim()) {
    return res.status(422).json({ error: 'PDF appears to be empty or scanned (image-only). Please use a text-based PDF.' });
  }

  let extractedItems = [];
  try {
    const client = getAnthropicClient();
    const promptText = `You are a Government Construction BOQ expert. Extract ALL line items from this BOQ document.
Return STRICT JSON only (no markdown, no explanation):
{"items": [{"sr_no": "1", "description": "item description", "unit": "RM", "quantity": 100, "estimated_rate": 485, "sor_keywords": ["pipe", "DI", "100mm"]}]}

BOQ Document Text:
${pdfText.slice(0, 15000)}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: promptText }],
    });

    const responseText = message.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      extractedItems = parsed.items || [];
    }
  } catch (err) {
    return res.status(502).json({ error: `AI extraction failed: ${err.message}` });
  }

  // Match each extracted item to SOR rates
  const allSOR = db.prepare('SELECT * FROM sor_rates').all();
  const savedItems = [];

  for (const item of extractedItems) {
    // Find best SOR match using keyword scoring
    let bestMatch = null;
    let bestScore = 0;

    const needle = `${item.description || ''} ${(item.sor_keywords || []).join(' ')}`.toLowerCase();
    for (const sor of allSOR) {
      const haystack = `${sor.description} ${sor.item_code || ''} ${sor.category || ''}`.toLowerCase();
      let score = 0;
      const terms = needle.split(/\s+/).filter(w => w.length > 2);
      for (const t of terms) { if (haystack.includes(t)) score += 10; }
      if (score > bestScore) { bestScore = score; bestMatch = sor; }
    }

    const sorRate = bestMatch && bestScore >= 10 ? bestMatch.rate : (item.estimated_rate || 0);
    const matchScore = bestMatch && bestScore >= 10 ? Math.min(100, bestScore) : 0;
    const qty = item.quantity || 0;
    const total = qty * sorRate;

    try {
      const result = db.prepare(`
        INSERT INTO boq_items
          (site_id, item_number, item_code, description, quantity, qty_tender, qty_used,
           unit, rate, sor_rate, sor_item_id, total_amount, work_completed_pct,
           remaining_work, actual_cost, sor_match_score, source_doc)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)
      `).run(
        site_id,
        String(item.sr_no || ''),
        bestMatch?.item_code || null,
        item.description || '',
        qty, qty,
        item.unit || '',
        sorRate, sorRate,
        bestMatch?.id || null,
        total,
        qty,
        matchScore,
        req.file.originalname
      );

      savedItems.push({
        id: result.lastInsertRowid,
        sr_no: item.sr_no,
        description: item.description,
        unit: item.unit,
        quantity: qty,
        sor_rate: sorRate,
        sor_match: bestMatch ? { code: bestMatch.item_code, description: bestMatch.description, score: matchScore } : null,
        total_amount: total,
      });
    } catch (dbErr) {
      console.error('DB insert error:', dbErr.message);
    }
  }

  invalidateCache(site_id);

  res.json({
    success: true,
    extracted_count: extractedItems.length,
    saved_count: savedItems.length,
    items: savedItems,
  });
});

// POST /api/ai/upload-dpr/:site_id
// Upload a DPR PDF/image, extract progress data with Claude, update BOQ qty_used
router.post('/upload-dpr/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id)) {
    return res.status(404).json({ error: 'Site not found' });
  }

  let fileContent = '';
  const ext = req.file.originalname.split('.').pop().toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif'].includes(ext);

  let dprData = null;
  try {
    const client = getAnthropicClient();

    if (isImage) {
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64Image = imageBuffer.toString('base64');
      const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

      const message = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
            { type: 'text', text: `Extract DPR data from this image. Return STRICT JSON only:
{"date":"YYYY-MM-DD","work_done":[{"item":"pipe laying","qty":50,"unit":"RM","location":"Zone A"}],"labour":{"skilled":5,"unskilled":10,"amount":12500},"materials_used":[{"item":"DI Pipe 100mm","qty":50,"unit":"RM"}],"remarks":"","weather":"Clear"}` }
          ]
        }]
      });
      fileContent = message.content[0].text.trim();
    } else {
      // PDF
      const fileBuffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(fileBuffer);
      const pdfText = parsed.text.slice(0, 8000);

      const message = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Extract DPR data from this text. Return STRICT JSON only:
{"date":"YYYY-MM-DD","work_done":[{"item":"pipe laying","qty":50,"unit":"RM","location":"Zone A"}],"labour":{"skilled":5,"unskilled":10,"amount":12500},"materials_used":[{"item":"DI Pipe 100mm","qty":50,"unit":"RM"}],"remarks":"","weather":"Clear"}

DPR Text:
${pdfText}`
        }]
      });
      fileContent = message.content[0].text.trim();
    }

    const jsonMatch = fileContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) dprData = JSON.parse(jsonMatch[0]);
  } catch (err) {
    return res.status(502).json({ error: `AI DPR extraction failed: ${err.message}` });
  }

  if (!dprData) return res.status(422).json({ error: 'Could not parse DPR data from AI response' });

  // Save DPR record
  const dprResult = db.prepare(`
    INSERT INTO dpr_records (site_id, report_date, work_done, labour_skilled, labour_unskilled,
      labour_amount, materials_used, remarks, weather, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    site_id,
    dprData.date || new Date().toISOString().split('T')[0],
    JSON.stringify(dprData.work_done || []),
    dprData.labour?.skilled || 0,
    dprData.labour?.unskilled || 0,
    dprData.labour?.amount || 0,
    JSON.stringify(dprData.materials_used || []),
    dprData.remarks || '',
    dprData.weather || '',
    req.file.path
  );

  // Auto-update BOQ qty_used based on work_done
  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ?').all(site_id);
  const updatedItems = [];

  for (const workItem of (dprData.work_done || [])) {
    const workDesc = (workItem.item || '').toLowerCase();
    // Find best matching BOQ item
    let bestBOQ = null;
    let bestScore = 0;
    for (const boq of boqItems) {
      const boqDesc = (boq.description || '').toLowerCase();
      const terms = workDesc.split(/\s+/).filter(w => w.length > 2);
      let score = 0;
      for (const t of terms) { if (boqDesc.includes(t)) score += 10; }
      if (score > bestScore) { bestScore = score; bestBOQ = boq; }
    }

    if (bestBOQ && bestScore >= 10) {
      const newQtyUsed = (bestBOQ.qty_used || 0) + (workItem.qty || 0);
      const qtyTender = bestBOQ.qty_tender || bestBOQ.quantity || 0;
      const pct = qtyTender > 0 ? Math.min(100, (newQtyUsed / qtyTender) * 100) : 0;
      const remaining = Math.max(0, qtyTender - newQtyUsed);

      db.prepare(`
        UPDATE boq_items SET qty_used = ?, work_completed_pct = ?, remaining_work = ?
        WHERE id = ?
      `).run(newQtyUsed, pct, remaining, bestBOQ.id);

      updatedItems.push({ boq_id: bestBOQ.id, description: bestBOQ.description, added_qty: workItem.qty, total_used: newQtyUsed });
    }
  }

  invalidateCache(site_id);

  res.json({
    success: true,
    dpr_id: dprResult.lastInsertRowid,
    dpr_data: dprData,
    boq_updates: updatedItems,
  });
});

// POST /api/ai/ask/:site_id
// Natural language Q&A about the project
router.post('/ask/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { question } = req.body;

  if (!question) return res.status(400).json({ error: 'question required' });

  const ctx = buildProjectContext(site_id);
  if (!ctx) return res.status(404).json({ error: 'Site not found' });

  // Summarize context if too large
  const ctxJson = JSON.stringify(ctx, null, 2);
  const contextStr = ctxJson.length > 10000
    ? JSON.stringify({
        site: ctx.site,
        boq_summary: ctx.boq_summary,
        expense_summary: ctx.expense_summary,
        boq_items: ctx.boq_items.slice(0, 20),
        dpr_last_7_days: ctx.dpr_last_7_days.slice(0, 5),
      }, null, 2)
    : ctxJson;

  try {
    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: `You are an AI assistant for a Government Construction ERP system.
The data provided is from a PostgreSQL/SQLite database for a real construction project.
Answer precisely with exact numbers. Format Indian currency as ₹1,00,000 (Indian comma format).
Respond in the same language the user uses (Gujarati, Hindi, or English).
Always cite which data table your answer comes from.`,
      messages: [{
        role: 'user',
        content: `Project Data (from database):
${contextStr}

Question: ${question}`
      }]
    });

    // Determine which tables were likely referenced
    const answer = message.content[0].text;
    const tablesReferenced = [];
    if (/boq|pipe|valve|quantity|tender|used|balance/i.test(answer + question)) tablesReferenced.push('boq_items');
    if (/labour|wage|worker|skilled/i.test(answer + question)) tablesReferenced.push('labour_records');
    if (/fuel|diesel|petrol/i.test(answer + question)) tablesReferenced.push('fuel_expenses');
    if (/material|cement|steel|pipe/i.test(answer + question)) tablesReferenced.push('material_purchases');
    if (/dpr|daily|progress|work done/i.test(answer + question)) tablesReferenced.push('dpr_records');
    if (/expense|cost|total|budget/i.test(answer + question)) tablesReferenced.push('expense_summary');

    res.json({ answer, tables_referenced: [...new Set(tablesReferenced)] });
  } catch (err) {
    res.status(502).json({ error: `AI query failed: ${err.message}` });
  }
});

// GET /api/ai/context/:site_id - return cached project context (for debugging)
router.get('/context/:site_id', authenticate, (req, res) => {
  const ctx = buildProjectContext(req.params.site_id);
  if (!ctx) return res.status(404).json({ error: 'Site not found' });
  res.json(ctx);
});

module.exports = { router, invalidateCache };

const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

/**
 * Simple keyword-based SOR matcher (no pgvector needed with SQLite).
 * Returns the best matching SOR rate row.
 */
function matchSorRate(description, keywords) {
  if (!description && !keywords) return null;
  const terms = [...(keywords || []), ...(description || '').toLowerCase().split(/\s+/)].filter(Boolean);
  const sorRates = db.prepare('SELECT * FROM sor_rates').all();
  let best = null;
  let bestScore = 0;
  for (const sor of sorRates) {
    const haystack = (sor.keywords + ' ' + sor.description).toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (haystack.includes(t.toLowerCase())) score++;
    }
    const pct = terms.length > 0 ? (score / terms.length) * 100 : 0;
    if (pct > bestScore) { bestScore = pct; best = { ...sor, match_pct: Math.round(pct) }; }
  }
  return bestScore >= 20 ? best : null;
}

/**
 * Build a compact project context from SQLite for the AI Q&A endpoint.
 */
function buildProjectContext(siteId) {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return null;

  const boq = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(siteId);
  const lastDprs = db.prepare('SELECT * FROM dpr_records WHERE site_id = ? ORDER BY report_date DESC LIMIT 7').all(siteId);
  const expenses = {
    material:  db.prepare('SELECT COALESCE(SUM(total_amount),0) as t FROM material_purchases WHERE site_id = ?').get(siteId).t,
    labour:    db.prepare('SELECT COALESCE(SUM(total_salary),0) as t FROM labour_records WHERE site_id = ?').get(siteId).t,
    fuel:      db.prepare('SELECT COALESCE(SUM(total_cost),0) as t FROM fuel_expenses WHERE site_id = ?').get(siteId).t,
    machinery: db.prepare('SELECT COALESCE(SUM(total_cost),0) as t FROM machinery_expenses WHERE site_id = ?').get(siteId).t,
    office:    db.prepare('SELECT COALESCE(SUM(amount),0) as t FROM office_expenses WHERE site_id = ?').get(siteId).t,
  };

  return {
    project: {
      id: site.id, name: site.site_name, location: site.site_location,
      start_date: site.start_date, completion_date: site.completion_date,
      estimated_cost: site.estimated_cost, progress: site.progress_percentage,
      status: site.status,
    },
    boq_items: boq.map(i => ({
      item: i.item_number, desc: i.description, unit: i.unit,
      qty_tender: i.quantity, qty_used: i.qty_used || 0, rate: i.rate,
      balance: (i.quantity || 0) - (i.qty_used || 0),
      amount: i.total_amount, progress: i.work_completed_pct,
    })),
    expenses,
    total_expense: Object.values(expenses).reduce((a, b) => a + b, 0),
    recent_dprs: lastDprs.map(d => ({
      date: d.report_date, work: d.work_done,
      labour_amount: d.labour_amount, weather: d.weather,
    })),
  };
}

// In-memory cache: { siteId: { data, ts } }
const contextCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCachedContext(siteId) {
  const entry = contextCache[siteId];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  const data = buildProjectContext(siteId);
  if (data) contextCache[siteId] = { data, ts: Date.now() };
  return data;
}

function invalidateCache(siteId) {
  delete contextCache[siteId];
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/upload-boq/:site_id
// ─────────────────────────────────────────────────────────────────────────
router.post('/upload-boq/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });

  const client = getClient();
  if (!client) {
    // Remove uploaded file
    fs.unlink(req.file.path, () => {});
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. Set the environment variable to enable AI features.' });
  }

  try {
    // Step 1: Extract text from PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text.slice(0, 60000); // limit context

    // Step 2: Send to Claude
    const extraction = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a Government Construction BOQ expert. Extract ALL line items from this BOQ document. Return STRICT JSON only, no markdown, no explanation:\n{"items":[{"sr_no":"","description":"","unit":"","quantity":0,"estimated_rate":0,"sor_keywords":["keyword1","keyword2","keyword3"]}]}\n\nBOQ Document text:\n${pdfText}`,
      }],
    });

    let extracted = { items: [] };
    try {
      const raw = extraction.content[0].text.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        extracted = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      }
    } catch (parseErr) {
      console.error('BOQ parse error:', parseErr.message);
    }

    // Step 3: Match SOR rates and save to DB
    const savedItems = [];
    const insertStmt = db.prepare(`
      INSERT INTO boq_items (site_id, item_number, description, unit, quantity, rate, total_amount, work_completed_pct, remaining_work, qty_used, source_doc, sor_rate_id, sor_match_pct)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const item of rows) {
        const sorMatch = matchSorRate(item.description, item.sor_keywords || []);
        const rate = sorMatch ? sorMatch.rate : (item.estimated_rate || 0);
        const qty = item.quantity || 0;
        const total = qty * rate;
        const result = insertStmt.run(
          site_id, item.sr_no || null, item.description || null,
          item.unit || null, qty, rate, total, qty,
          req.file.originalname, sorMatch ? sorMatch.id : null, sorMatch ? sorMatch.match_pct : 0,
        );
        savedItems.push({
          id: result.lastInsertRowid,
          sr_no: item.sr_no,
          description: item.description,
          unit: item.unit,
          quantity: qty,
          rate,
          total_amount: total,
          sor_match: sorMatch ? { id: sorMatch.id, description: sorMatch.description, rate: sorMatch.rate, match_pct: sorMatch.match_pct } : null,
        });
      }
    });
    insertMany(extracted.items || []);

    invalidateCache(site_id);

    res.json({
      success: true,
      items_extracted: extracted.items ? extracted.items.length : 0,
      items_saved: savedItems.length,
      items: savedItems,
    });
  } catch (err) {
    console.error('upload-boq error:', err);
    res.status(500).json({ error: err.message || 'AI processing failed' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/upload-dpr/:site_id
// ─────────────────────────────────────────────────────────────────────────
router.post('/upload-dpr/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'File required' });

  const client = getClient();
  if (!client) {
    fs.unlink(req.file.path, () => {});
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured.' });
  }

  try {
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let content;

    if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      // Image: use Claude Vision
      const imageBuffer = fs.readFileSync(filePath);
      const base64 = imageBuffer.toString('base64');
      const mediaTypeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
      content = [
        { type: 'image', source: { type: 'base64', media_type: mediaTypeMap[ext] || 'image/jpeg', data: base64 } },
        { type: 'text', text: 'Extract DPR data from this image. Return strict JSON only, no markdown:\n{"date":"YYYY-MM-DD","work_done":[{"item":"","qty":0,"unit":"","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"","qty":0,"unit":""}],"remarks":"","weather":""}' },
      ];
    } else {
      // PDF
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      const pdfText = pdfData.text.slice(0, 30000);
      content = [{ type: 'text', text: `Extract DPR data from this document. Return strict JSON only, no markdown:\n{"date":"YYYY-MM-DD","work_done":[{"item":"","qty":0,"unit":"","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"","qty":0,"unit":""}],"remarks":"","weather":""}\n\nDocument:\n${pdfText}` }];
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    });

    let dprData = {};
    try {
      const raw = response.content[0].text.trim();
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) dprData = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch (parseErr) {
      console.error('DPR parse error:', parseErr.message);
    }

    // Save DPR record
    const dprResult = db.prepare(`
      INSERT INTO dpr_records (site_id, report_date, work_done, labour_skilled, labour_unskilled, labour_amount, materials_used, remarks, weather, source_file, ai_raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      site_id,
      dprData.date || new Date().toISOString().split('T')[0],
      dprData.work_done ? JSON.stringify(dprData.work_done) : null,
      dprData.labour ? dprData.labour.skilled || 0 : 0,
      dprData.labour ? dprData.labour.unskilled || 0 : 0,
      dprData.labour ? dprData.labour.amount || 0 : 0,
      dprData.materials_used ? JSON.stringify(dprData.materials_used) : null,
      dprData.remarks || null,
      dprData.weather || null,
      req.file.originalname,
      response.content[0].text,
    );

    // Update BOQ qty_used from work done
    const updatedBoqItems = [];
    if (Array.isArray(dprData.work_done)) {
      for (const workItem of dprData.work_done) {
        if (!workItem.item || !workItem.qty) continue;
        const matchedBoq = db.prepare(`
          SELECT * FROM boq_items WHERE site_id = ? AND (
            description LIKE ? OR description LIKE ?
          ) LIMIT 1
        `).get(site_id, `%${workItem.item}%`, `%${(workItem.item || '').split(' ')[0]}%`);

        if (matchedBoq) {
          const newQtyUsed = (matchedBoq.qty_used || 0) + (workItem.qty || 0);
          const newPct = matchedBoq.quantity > 0 ? Math.min(100, (newQtyUsed / matchedBoq.quantity) * 100) : 0;
          db.prepare(`
            UPDATE boq_items SET qty_used = ?, work_completed_pct = ?, remaining_work = ?
            WHERE id = ?
          `).run(newQtyUsed, newPct, Math.max(0, (matchedBoq.quantity || 0) - newQtyUsed), matchedBoq.id);
          updatedBoqItems.push({ boq_id: matchedBoq.id, description: matchedBoq.description, qty_added: workItem.qty });
        }
      }
    }

    invalidateCache(site_id);

    res.json({
      success: true,
      dpr_id: dprResult.lastInsertRowid,
      dpr_data: dprData,
      boq_items_updated: updatedBoqItems,
    });
  } catch (err) {
    console.error('upload-dpr error:', err);
    res.status(500).json({ error: err.message || 'DPR processing failed' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/ask/:site_id
// ─────────────────────────────────────────────────────────────────────────
router.post('/ask/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. Set the environment variable to enable AI features.' });
  }

  const context = getCachedContext(site_id);
  if (!context) return res.status(404).json({ error: 'Project not found' });

  try {
    // Summarize if context is too large
    let contextStr = JSON.stringify(context);
    if (contextStr.length > 50000) {
      // Trim DPR and keep only first 50 BOQ items
      const trimmed = { ...context, boq_items: context.boq_items.slice(0, 50), recent_dprs: context.recent_dprs.slice(0, 3) };
      contextStr = JSON.stringify(trimmed);
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: 'You are AI assistant for Government Construction ERP. The data given is from a PostgreSQL database. Answer precisely with numbers. Use Indian number format (₹1,00,000). Answer in same language user asks (Gujarati/Hindi/English). Always cite specific numbers from the data.',
      messages: [{
        role: 'user',
        content: `Project Data (JSON from DB):\n${contextStr}\n\nQuestion: ${question}`,
      }],
    });

    const answer = response.content[0].text;
    const tablesReferenced = ['boq_items', 'dpr_records', 'expenses'];

    // Save chat history
    db.prepare(`
      INSERT INTO ai_chat_history (site_id, user_id, question, answer, tables_referenced)
      VALUES (?, ?, ?, ?, ?)
    `).run(site_id, req.user.id, question, answer, tablesReferenced.join(','));

    res.json({ answer, tables_referenced: tablesReferenced });
  } catch (err) {
    console.error('ask error:', err);
    res.status(500).json({ error: err.message || 'AI request failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/ai/chat-history/:site_id
// ─────────────────────────────────────────────────────────────────────────
router.get('/chat-history/:site_id', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT ch.*, u.full_name FROM ai_chat_history ch
    LEFT JOIN users u ON ch.user_id = u.id
    WHERE ch.site_id = ? ORDER BY ch.created_at DESC LIMIT 50
  `).all(req.params.site_id);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/ai/invalidate-cache/:site_id
// ─────────────────────────────────────────────────────────────────────────
router.post('/invalidate-cache/:site_id', authenticate, (req, res) => {
  invalidateCache(req.params.site_id);
  res.json({ success: true });
});

module.exports = { router, invalidateCache };

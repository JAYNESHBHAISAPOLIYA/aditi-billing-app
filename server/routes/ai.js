const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Configure multer for PDF uploads
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads', 'ai-docs'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only PDF and image files are allowed'));
  },
});

// Ensure upload dir exists
fs.mkdirSync(path.join(__dirname, '..', '..', 'uploads', 'ai-docs'), { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────

function getAnthropicClient() {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set');
  return new Anthropic({ apiKey });
}

async function callClaude(client, systemPrompt, userMessage, maxTokens = 2048) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      return msg.content[0].text;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr;
}

async function extractPdfText(filePath) {
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text || '';
}

function matchSorRate(description, keywords = []) {
  const allRates = db.prepare('SELECT * FROM sor_rates ORDER BY id').all();
  if (allRates.length === 0) return null;

  const needle = (description + ' ' + keywords.join(' ')).toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const sor of allRates) {
    const haystack = (sor.description + ' ' + (sor.keywords || '')).toLowerCase();
    // Simple token-based similarity
    const needleTokens = needle.split(/\s+/).filter(t => t.length > 2);
    const haystackTokens = new Set(haystack.split(/\s+/));
    let hits = needleTokens.filter(t => haystackTokens.has(t)).length;
    // Boost if item_code matches
    if (keywords.some(k => k.toLowerCase().includes((sor.item_code || '').toLowerCase()))) hits += 3;
    const score = needleTokens.length ? hits / needleTokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { ...sor, confidence: Math.min(Math.round(score * 100), 99) };
    }
  }
  return bestMatch && bestScore > 0.1 ? bestMatch : null;
}

function buildProjectContext(siteId) {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return null;

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(siteId);
  const recentDprs = db.prepare(`
    SELECT d.*, GROUP_CONCAT(w.item_description || ' ' || w.quantity || ' ' || w.unit, '; ') as work_items
    FROM dpr_records d
    LEFT JOIN dpr_work_items w ON w.dpr_id = d.id
    WHERE d.site_id = ?
    GROUP BY d.id
    ORDER BY d.report_date DESC LIMIT 7
  `).all(siteId);
  const expenses = {
    labour: db.prepare('SELECT COALESCE(SUM(total_salary),0) as total FROM labour_records WHERE site_id = ?').get(siteId)?.total || 0,
    material: db.prepare('SELECT COALESCE(SUM(total_amount),0) as total FROM material_purchases WHERE site_id = ?').get(siteId)?.total || 0,
    fuel: db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM fuel_expenses WHERE site_id = ?').get(siteId)?.total || 0,
    machinery: db.prepare('SELECT COALESCE(SUM(total_cost),0) as total FROM machinery_expenses WHERE site_id = ?').get(siteId)?.total || 0,
    office: db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM office_expenses WHERE site_id = ?').get(siteId)?.total || 0,
  };

  // Summarize if context would be very large
  const boqSummary = boqItems.map(b => ({
    sr: b.item_number,
    desc: b.description,
    unit: b.unit,
    qty_tender: b.qty_tender || b.quantity || 0,
    qty_used: b.qty_used || 0,
    balance: (b.qty_tender || b.quantity || 0) - (b.qty_used || 0),
    sor_rate: b.sor_rate || b.rate || 0,
    amount: b.total_amount || 0,
    progress_pct: b.work_completed_pct || 0,
  }));

  return {
    site: { name: site.site_name, location: site.site_location, budget: site.estimated_cost, start: site.start_date, end: site.completion_date, status: site.status, progress: site.progress_percentage },
    boq_items: boqSummary,
    recent_dpr: recentDprs.map(d => ({ date: d.report_date, work: d.work_items, labour_count: (d.labour_skilled || 0) + (d.labour_unskilled || 0), weather: d.weather })),
    expenses,
    totals: {
      boq_value: boqItems.reduce((s, b) => s + (b.total_amount || 0), 0),
      total_expense: Object.values(expenses).reduce((a, b) => a + b, 0),
    },
  };
}

// ── Cache (simple in-memory, 5 min TTL) ────────────────────────────────────
const contextCache = new Map();

function getCachedContext(siteId) {
  const entry = contextCache.get(String(siteId));
  if (entry && Date.now() - entry.ts < 5 * 60 * 1000) return entry.data;
  return null;
}

function setCachedContext(siteId, data) {
  contextCache.set(String(siteId), { data, ts: Date.now() });
}

function invalidateCache(siteId) {
  contextCache.delete(String(siteId));
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/ai/upload-boq/:site_id
router.post('/upload-boq/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const client = getAnthropicClient();
    const pdfText = await extractPdfText(req.file.path);

    if (!pdfText || pdfText.trim().length < 50) {
      return res.status(422).json({ error: 'Could not extract text from PDF. The file may be a scanned image.' });
    }

    const systemPrompt = 'You are a Government Construction BOQ expert specializing in Indian government projects. Extract ALL line items from BOQ documents accurately.';
    const userMessage = `You are a Government Construction BOQ expert. Extract ALL line items from this BOQ document.
Return STRICT JSON only (no markdown, no explanation):
{"items":[{"sr_no":"1","description":"item description","unit":"RM","quantity":100,"estimated_rate":485,"sor_keywords":["keyword1","keyword2","keyword3"]}]}

BOQ Document Text:
${pdfText.substring(0, 8000)}`;

    const aiResponse = await callClaude(client, systemPrompt, userMessage);

    let extracted;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
    } catch {
      return res.status(422).json({ error: 'AI could not parse BOQ items from document', raw: aiResponse.substring(0, 500) });
    }

    const items = extracted.items || [];
    const insertBoq = db.prepare(`
      INSERT INTO boq_items (site_id, item_number, description, unit, quantity, qty_tender, rate, sor_rate,
        sor_item_id, sor_match_confidence, total_amount, source_doc, work_completed_pct, remaining_work, actual_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
    `);

    const savedItems = [];
    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const estimatedRate = Number(item.estimated_rate) || 0;
      const sorMatch = matchSorRate(item.description, item.sor_keywords || []);
      const finalRate = sorMatch ? sorMatch.rate : estimatedRate;
      const total = qty * finalRate;
      const fileName = req.file.originalname;

      const result = insertBoq.run(
        site_id, String(item.sr_no || ''), item.description || '', item.unit || '',
        qty, qty, finalRate, sorMatch ? sorMatch.rate : 0,
        sorMatch ? sorMatch.id : null, sorMatch ? sorMatch.confidence : 0,
        total, fileName, qty
      );
      savedItems.push({
        id: result.lastInsertRowid, sr_no: item.sr_no, description: item.description,
        unit: item.unit, quantity: qty, estimated_rate: estimatedRate,
        sor_match: sorMatch ? { id: sorMatch.id, item_code: sorMatch.item_code, rate: sorMatch.rate, description: sorMatch.description, confidence: sorMatch.confidence } : null,
        final_rate: finalRate, total_amount: total,
      });
    }

    invalidateCache(site_id);

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, items_extracted: items.length, items: savedItems });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('BOQ upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ask/:site_id
router.post('/ask/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    let context = getCachedContext(site_id);
    if (!context) {
      context = buildProjectContext(site_id);
      if (!context) return res.status(404).json({ error: 'Site not found' });
      setCachedContext(site_id, context);
    }

    const client = getAnthropicClient();
    const systemPrompt = `You are AI assistant for Government Construction ERP system. 
Answer in the same language the user asks (Gujarati/Hindi/English). 
Always give specific numbers with Indian comma format (e.g., ₹1,00,000 or 2,400 RM).
Data given is from PostgreSQL database — be precise and helpful.
If asked about pipe quantities, show: Tender Qty | Used so far | Balance | SOR Rate | Total value.
If asked about expenses, break down by category.
If asked about project completion, calculate based on progress percentage and dates.`;

    const contextStr = JSON.stringify(context, null, 2).substring(0, 6000);
    const userMessage = `Project Data:\n${contextStr}\n\nQuestion: ${question}`;

    const answer = await callClaude(client, systemPrompt, userMessage, 1024);

    // Determine tables referenced
    const tablesReferenced = [];
    if (answer.toLowerCase().includes('boq') || answer.toLowerCase().includes('quantity') || answer.toLowerCase().includes('pipe')) tablesReferenced.push('BOQ Items');
    if (answer.toLowerCase().includes('labour') || answer.toLowerCase().includes('worker')) tablesReferenced.push('Labour Records');
    if (answer.toLowerCase().includes('expense') || answer.toLowerCase().includes('material')) tablesReferenced.push('Material Purchases', 'Expenses');
    if (answer.toLowerCase().includes('dpr') || answer.toLowerCase().includes('progress') || answer.toLowerCase().includes('daily')) tablesReferenced.push('DPR Records');

    // Save to chat history
    db.prepare(`INSERT INTO ai_chat_history (site_id, user_message, ai_response, tables_referenced) VALUES (?,?,?,?)`)
      .run(site_id, question, answer, tablesReferenced.join(', '));

    res.json({ answer, tables_referenced: tablesReferenced });
  } catch (err) {
    console.error('AI ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/upload-dpr/:site_id
router.post('/upload-dpr/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const client = getAnthropicClient();
    let fileContent;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.pdf') {
      const text = await extractPdfText(req.file.path);
      fileContent = `DPR Document Text:\n${text.substring(0, 6000)}`;
    } else {
      // Image: encode as base64 for Vision API
      const imageData = fs.readFileSync(req.file.path).toString('base64');
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      // Use vision call
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
            { type: 'text', text: 'Extract DPR data. Return JSON only: {"date":"YYYY-MM-DD","work_done":[{"item":"description","qty":0,"unit":"RM","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"","qty":0,"unit":""}],"remarks":"","weather":""}' },
          ],
        }],
      });
      const extracted = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return await saveDprData(site_id, extracted, req.file.originalname, res);
    }

    const systemPrompt = 'You are an expert at extracting Daily Progress Report data from construction documents.';
    const userMessage = `Extract DPR data from the following document. Return JSON only (no markdown):
{"date":"YYYY-MM-DD","work_done":[{"item":"description","qty":0,"unit":"RM","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"","qty":0,"unit":""}],"remarks":"","weather":""}

${fileContent}`;

    const aiResponse = await callClaude(client, systemPrompt, userMessage);
    let dprData;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      dprData = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
    } catch {
      return res.status(422).json({ error: 'AI could not parse DPR data', raw: aiResponse.substring(0, 300) });
    }

    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    await saveDprData(site_id, dprData, req.file.originalname, res);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('DPR upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function saveDprData(siteId, dprData, sourceDoc, res) {
  const reportDate = dprData.date || new Date().toISOString().split('T')[0];
  const labour = dprData.labour || {};

  const dprResult = db.prepare(`
    INSERT INTO dpr_records (site_id, report_date, extracted_data, labour_skilled, labour_unskilled, labour_amount, weather, remarks, source_doc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteId, reportDate, JSON.stringify(dprData),
    labour.skilled || 0, labour.unskilled || 0, labour.amount || 0,
    dprData.weather || '', dprData.remarks || '', sourceDoc
  );
  const dprId = dprResult.lastInsertRowid;

  const workItems = dprData.work_done || [];
  const insertWork = db.prepare(`
    INSERT INTO dpr_work_items (dpr_id, site_id, item_description, quantity, unit, location)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Auto-match and update BOQ qty_used
  const updateBoq = db.prepare('UPDATE boq_items SET qty_used = COALESCE(qty_used,0) + ? WHERE id = ?');
  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ?').all(siteId);

  for (const work of workItems) {
    const workResult = insertWork.run(dprId, siteId, work.item || '', work.qty || 0, work.unit || '', work.location || '');

    // Try to match to a BOQ item
    const needle = (work.item || '').toLowerCase();
    const matched = boqItems.find(b => b.description && b.description.toLowerCase().includes(needle.split(' ').filter(t => t.length > 3)[0] || ''));
    if (matched) {
      updateBoq.run(work.qty || 0, matched.id);
      db.prepare('UPDATE dpr_work_items SET boq_item_id = ? WHERE id = ?').run(matched.id, workResult.lastInsertRowid);
    }
  }

  // Recalculate BOQ progress percentages
  for (const boq of boqItems) {
    const used = db.prepare('SELECT COALESCE(SUM(quantity),0) as total FROM dpr_work_items WHERE boq_item_id = ?').get(boq.id)?.total || 0;
    const tender = boq.qty_tender || boq.quantity || 1;
    const pct = Math.min(100, Math.round((used / tender) * 100));
    db.prepare('UPDATE boq_items SET work_completed_pct = ?, qty_used = ? WHERE id = ?').run(pct, used, boq.id);
  }

  invalidateCache(siteId);

  res.json({
    success: true,
    dpr_id: dprId,
    date: reportDate,
    work_items: workItems.length,
    labour: labour,
    weather: dprData.weather,
    remarks: dprData.remarks,
  });
}

// GET /api/ai/chat-history/:site_id
router.get('/chat-history/:site_id', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_chat_history WHERE site_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.site_id);
  res.json(rows.reverse());
});

// GET /api/ai/sor-rates
router.get('/sor-rates', authenticate, (req, res) => {
  const { q } = req.query;
  if (q) {
    const like = `%${q}%`;
    return res.json(db.prepare('SELECT * FROM sor_rates WHERE description LIKE ? OR keywords LIKE ? OR item_code LIKE ? LIMIT 20').all(like, like, like));
  }
  res.json(db.prepare('SELECT * FROM sor_rates ORDER BY category, item_code').all());
});

// POST /api/ai/override-sor
router.post('/override-sor', authenticate, (req, res) => {
  const { boq_item_id, sor_rate, sor_item_id, note } = req.body;
  if (!boq_item_id) return res.status(400).json({ error: 'boq_item_id required' });
  db.prepare('UPDATE boq_items SET sor_rate = ?, sor_item_id = ?, rate = ? WHERE id = ?')
    .run(sor_rate || 0, sor_item_id || null, sor_rate || 0, boq_item_id);
  res.json({ success: true });
});

module.exports = router;
module.exports.invalidateCache = invalidateCache;

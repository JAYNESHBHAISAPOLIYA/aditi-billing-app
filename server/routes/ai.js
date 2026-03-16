const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Lazy-load heavy modules only when needed
function getAnthropicClient() {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  return new Anthropic({ apiKey });
}

async function extractPdfText(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

// Simple keyword-based SOR matching (no pgvector needed for SQLite)
function findSorMatches(description, keywords) {
  const allSor = db.prepare('SELECT * FROM sor_rates').all();
  const searchTerms = [
    ...(description || '').toLowerCase().split(/\s+/),
    ...(keywords || []).map(k => k.toLowerCase())
  ].filter(Boolean);

  const scored = allSor.map(sor => {
    const sorText = `${sor.description} ${sor.keywords || ''}`.toLowerCase();
    const sorWords = sorText.split(/[\s,]+/).filter(Boolean);
    let score = 0;
    for (const term of searchTerms) {
      if (sorText.includes(term)) score += term.length > 4 ? 3 : 1;
    }
    // Boost exact item code match
    const sorKeywords = (sor.keywords || '').toLowerCase().split(',').map(k => k.trim());
    for (const kw of sorKeywords) {
      if (searchTerms.some(t => kw.includes(t) || t.includes(kw))) score += 5;
    }
    const maxScore = Math.max(searchTerms.length * 3, 1);
    return { ...sor, confidence: Math.min(Math.round((score / maxScore) * 100), 99) };
  });

  return scored.filter(s => s.confidence > 10).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

// Build project context for Q&A
function buildProjectContext(siteId) {
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId);
  if (!site) return null;

  const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ? ORDER BY item_number').all(siteId);
  const recentDpr = db.prepare('SELECT * FROM dpr_records WHERE site_id = ? ORDER BY report_date DESC LIMIT 7').all(siteId);
  const materialExpenses = db.prepare('SELECT material_name, SUM(quantity) as qty, unit, SUM(total_amount) as total FROM material_purchases WHERE site_id = ? GROUP BY material_name, unit').all(siteId);
  const labourSummary = db.prepare('SELECT SUM(total_salary) as total_wages, SUM(attendance_days) as total_days FROM labour_records WHERE site_id = ?').get(siteId);
  const fuelSummary = db.prepare('SELECT SUM(total_cost) as total FROM fuel_expenses WHERE site_id = ?').get(siteId);
  const machineSummary = db.prepare('SELECT SUM(total_cost) as total FROM machinery_expenses WHERE site_id = ?').get(siteId);

  return {
    project: {
      name: site.site_name,
      location: site.site_location,
      type: site.project_type,
      start_date: site.start_date,
      completion_date: site.completion_date,
      estimated_cost: site.estimated_cost,
      progress_pct: site.progress_percentage,
      status: site.status,
      tender_number: site.tender_number,
      department: site.department_name
    },
    boq_items: boqItems.map(i => ({
      item_no: i.item_number,
      description: i.description,
      unit: i.unit,
      qty_tender: i.quantity,
      qty_used: i.work_completed_pct ? Math.round(i.quantity * i.work_completed_pct / 100) : 0,
      balance: i.remaining_work,
      sor_rate: i.rate,
      amount: i.total_amount,
      actual_cost: i.actual_cost,
      progress_pct: i.work_completed_pct
    })),
    recent_dpr: recentDpr.map(d => ({
      date: d.report_date,
      work_done: d.work_done,
      skilled_labour: d.labour_skilled,
      unskilled_labour: d.labour_unskilled,
      wages: d.labour_wages,
      materials_used: d.materials_used,
      remarks: d.remarks,
      weather: d.weather
    })),
    expense_summary: {
      materials: materialExpenses,
      total_labour_wages: labourSummary?.total_wages || 0,
      total_labour_days: labourSummary?.total_days || 0,
      total_fuel: fuelSummary?.total || 0,
      total_machinery: machineSummary?.total || 0
    }
  };
}

// POST /api/ai/upload-boq/:site_id
router.post('/upload-boq/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const filePath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);

  try {
    const pdfText = await extractPdfText(filePath);
    if (!pdfText || pdfText.trim().length < 10) {
      return res.status(422).json({ error: 'Could not extract text from PDF. Ensure it is not a scanned image-only PDF.' });
    }

    const client = getAnthropicClient();

    const prompt = `You are a Government Construction BOQ expert. Extract ALL line items from this BOQ document text.
Return STRICT JSON only (no markdown, no explanation):
{"items": [{"sr_no": "1", "description": "item description", "unit": "RM", "quantity": 100, "estimated_rate": 500, "sor_keywords": ["keyword1", "keyword2", "keyword3"]}]}

BOQ Document Text:
${pdfText.substring(0, 8000)}`;

    let extractedItems = [];
    let retries = 0;
    while (retries < 3) {
      try {
        const message = await client.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        });
        const responseText = message.content[0].text.trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          extractedItems = parsed.items || [];
        }
        break;
      } catch (err) {
        retries++;
        if (retries >= 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }

    // Match SOR rates and save items
    const savedItems = [];
    for (const item of extractedItems) {
      const sorMatches = findSorMatches(item.description, item.sor_keywords || []);
      const bestMatch = sorMatches[0];
      const rate = bestMatch ? bestMatch.rate : (item.estimated_rate || 0);
      const quantity = parseFloat(item.quantity) || 0;
      const totalAmount = quantity * rate;

      const result = db.prepare(`
        INSERT INTO boq_items (site_id, item_number, description, quantity, unit, rate, total_amount, work_completed_pct, remaining_work, actual_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
      `).run(site_id, item.sr_no || null, item.description || null, quantity, item.unit || null, rate, totalAmount, quantity);

      savedItems.push({
        id: result.lastInsertRowid,
        sr_no: item.sr_no,
        description: item.description,
        unit: item.unit,
        quantity,
        sor_rate: rate,
        total_amount: totalAmount,
        sor_match: bestMatch ? {
          item_code: bestMatch.item_code,
          description: bestMatch.description,
          rate: bestMatch.rate,
          confidence: bestMatch.confidence
        } : null
      });
    }

    res.json({
      success: true,
      items_extracted: extractedItems.length,
      items_saved: savedItems.length,
      items: savedItems
    });
  } catch (err) {
    console.error('BOQ upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process BOQ PDF' });
  }
});

// POST /api/ai/upload-dpr/:site_id
router.post('/upload-dpr/:site_id', authenticate, upload.single('file'), async (req, res) => {
  const { site_id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'File required' });

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(site_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const filePath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    const client = getAnthropicClient();
    let dprData = null;
    let retries = 0;

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      // Vision-based extraction for images
      const imageData = fs.readFileSync(filePath);
      const base64Image = imageData.toString('base64');
      const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

      while (retries < 3) {
        try {
          const message = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64Image }
                },
                {
                  type: 'text',
                  text: 'Extract DPR data from this construction daily progress report image. Return STRICT JSON only (no markdown):\n{"date":"YYYY-MM-DD","work_done":[{"item":"description","qty":0,"unit":"RM","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"name","qty":0,"unit":""}],"remarks":"","weather":""}'
                }
              ]
            }]
          });
          const responseText = message.content[0].text.trim();
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) dprData = JSON.parse(jsonMatch[0]);
          break;
        } catch (err) {
          retries++;
          if (retries >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }
    } else {
      // PDF text extraction
      const pdfText = await extractPdfText(filePath);
      while (retries < 3) {
        try {
          const message = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            messages: [{
              role: 'user',
              content: `Extract DPR data from this construction daily progress report. Return STRICT JSON only (no markdown):\n{"date":"YYYY-MM-DD","work_done":[{"item":"description","qty":0,"unit":"RM","location":""}],"labour":{"skilled":0,"unskilled":0,"amount":0},"materials_used":[{"item":"name","qty":0,"unit":""}],"remarks":"","weather":""}\n\nDPR Text:\n${pdfText.substring(0, 6000)}`
            }]
          });
          const responseText = message.content[0].text.trim();
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) dprData = JSON.parse(jsonMatch[0]);
          break;
        } catch (err) {
          retries++;
          if (retries >= 3) throw err;
          await new Promise(r => setTimeout(r, 1000 * retries));
        }
      }
    }

    if (!dprData) return res.status(422).json({ error: 'Could not extract DPR data from file' });

    // Save DPR record
    const result = db.prepare(`
      INSERT INTO dpr_records (site_id, report_date, work_done, labour_skilled, labour_unskilled, labour_wages, materials_used, remarks, weather, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      site_id,
      dprData.date || new Date().toISOString().split('T')[0],
      JSON.stringify(dprData.work_done || []),
      dprData.labour?.skilled || 0,
      dprData.labour?.unskilled || 0,
      dprData.labour?.amount || 0,
      JSON.stringify(dprData.materials_used || []),
      dprData.remarks || null,
      dprData.weather || null,
      req.file.filename
    );

    // Auto-update BOQ progress based on work done
    const boqItems = db.prepare('SELECT * FROM boq_items WHERE site_id = ?').all(site_id);
    const workDone = dprData.work_done || [];
    for (const work of workDone) {
      const matched = boqItems.find(b =>
        b.description && work.item &&
        b.description.toLowerCase().includes(work.item.toLowerCase().split(' ')[0])
      );
      if (matched && work.qty > 0) {
        const newCompleted = Math.min(
          (matched.quantity - matched.remaining_work) + parseFloat(work.qty),
          matched.quantity
        );
        const newPct = matched.quantity > 0 ? Math.round((newCompleted / matched.quantity) * 100) : 0;
        const newRemaining = Math.max(matched.quantity - newCompleted, 0);
        db.prepare('UPDATE boq_items SET work_completed_pct = ?, remaining_work = ? WHERE id = ?')
          .run(newPct, newRemaining, matched.id);
      }
    }

    res.json({
      success: true,
      dpr_id: result.lastInsertRowid,
      extracted: dprData
    });
  } catch (err) {
    console.error('DPR upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process DPR file' });
  }
});

// POST /api/ai/ask/:site_id
router.post('/ask/:site_id', authenticate, async (req, res) => {
  const { site_id } = req.params;
  const { question } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: 'question required' });

  const context = buildProjectContext(parseInt(site_id));
  if (!context) return res.status(404).json({ error: 'Site not found' });

  const contextStr = JSON.stringify(context);
  // Truncate context if too large for Claude API (keeping under ~80k chars)
  const truncatedContext = contextStr.length > 40000
    ? contextStr.substring(0, 40000) + '...[truncated for length]'
    : contextStr;

  try {
    const client = getAnthropicClient();
    let answer = '';
    let retries = 0;

    while (retries < 3) {
      try {
        const message = await client.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: `You are AI assistant for Government Construction ERP system. 
The data provided is from a live PostgreSQL/SQLite database. 
Answer precisely with specific numbers from the data. 
Use Indian number format for amounts (₹1,00,000).
Answer in the SAME language the user asks (Gujarati/Hindi/English).
If user asks in Gujarati, respond in Gujarati. If Hindi, respond in Hindi. If English, respond in English.
Always include: quantities, amounts, percentages wherever relevant.`,
          messages: [{
            role: 'user',
            content: `Project Data from Database:\n${truncatedContext}\n\nUser Question: ${question}`
          }]
        });
        answer = message.content[0].text;
        break;
      } catch (err) {
        retries++;
        if (retries >= 3) throw err;
        await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }

    // Save to chat history
    const tablesUsed = ['sites', 'boq_items', 'dpr_records', 'material_purchases', 'labour_records'];
    db.prepare(`
      INSERT INTO ai_chat_history (site_id, user_id, question, answer, tables_used)
      VALUES (?, ?, ?, ?, ?)
    `).run(site_id, req.user.id, question, answer, tablesUsed.join(','));

    res.json({ answer, tables_used: tablesUsed });
  } catch (err) {
    console.error('AI Q&A error:', err);
    res.status(500).json({ error: err.message || 'AI service error' });
  }
});

// GET /api/ai/chat-history/:site_id
router.get('/chat-history/:site_id', authenticate, (req, res) => {
  const { site_id } = req.params;
  const history = db.prepare(`
    SELECT h.*, u.full_name as user_name
    FROM ai_chat_history h
    LEFT JOIN users u ON h.user_id = u.id
    WHERE h.site_id = ?
    ORDER BY h.created_at DESC
    LIMIT 50
  `).all(site_id);
  res.json(history);
});

// GET /api/ai/sor-rates
router.get('/sor-rates', authenticate, (req, res) => {
  const { category, search } = req.query;
  let stmt = 'SELECT * FROM sor_rates WHERE 1=1';
  const params = [];
  if (category) { stmt += ' AND category = ?'; params.push(category); }
  if (search) { stmt += ' AND (description LIKE ? OR item_code LIKE ? OR keywords LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  stmt += ' ORDER BY category, item_code';
  res.json(db.prepare(stmt).all(...params));
});

// GET /api/ai/sor-match
router.get('/sor-match', authenticate, (req, res) => {
  const { description, keywords } = req.query;
  const kws = keywords ? keywords.split(',').map(k => k.trim()) : [];
  const matches = findSorMatches(description, kws);
  res.json(matches);
});

// GET /api/ai/dpr-records/:site_id
router.get('/dpr-records/:site_id', authenticate, (req, res) => {
  const records = db.prepare('SELECT * FROM dpr_records WHERE site_id = ? ORDER BY report_date DESC').all(req.params.site_id);
  res.json(records);
});

module.exports = router;

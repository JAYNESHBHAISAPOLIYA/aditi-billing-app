const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const upload = require('../utils/upload');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { site_id, doc_type, search } = req.query;
  let stmt = 'SELECT d.*, u.full_name as uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by = u.id WHERE 1=1';
  const params = [];
  if (site_id) { stmt += ' AND d.site_id = ?'; params.push(site_id); }
  if (doc_type) { stmt += ' AND d.doc_type = ?'; params.push(doc_type); }
  if (search) { stmt += ' AND (d.doc_name LIKE ? OR d.doc_type LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  stmt += ' ORDER BY d.created_at DESC';
  res.json(db.prepare(stmt).all(...params));
});

router.post('/', authenticate, upload.single('file'), (req, res) => {
  const { site_id, doc_type, doc_name } = req.body;
  if (!site_id || !doc_type || !req.file) return res.status(400).json({ error: 'site_id, doc_type, and file required' });
  const result = db.prepare(`
    INSERT INTO documents (site_id, doc_type, doc_name, file_path, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(site_id, doc_type, doc_name || req.file.originalname, req.file.filename, req.user.id);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

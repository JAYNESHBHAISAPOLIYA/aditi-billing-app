const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { authenticate, authorize, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, assigned_site_id: user.assigned_site_id }
  });
});

// Get current user profile
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name, role, email, phone, assigned_site_id FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// List all users (owner only)
router.get('/users', authenticate, authorize('owner'), (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, email, phone, assigned_site_id, active, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// Create user (owner only)
router.post('/users', authenticate, authorize('owner'), (req, res) => {
  const { username, password, full_name, role, email, phone, assigned_site_id } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Username, password, full_name, and role are required' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (username, password, full_name, role, email, phone, assigned_site_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hash, full_name, role, email || null, phone || null, assigned_site_id || null);
    res.status(201).json({ id: result.lastInsertRowid, username, full_name, role });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update user (owner only)
router.put('/users/:id', authenticate, authorize('owner'), (req, res) => {
  const { full_name, role, email, phone, assigned_site_id, active } = req.body;
  const updates = [];
  const params = [];
  if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
  if (role !== undefined) { updates.push('role = ?'); params.push(role); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (assigned_site_id !== undefined) { updates.push('assigned_site_id = ?'); params.push(assigned_site_id); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

module.exports = router;

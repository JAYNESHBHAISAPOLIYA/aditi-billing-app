/**
 * Integration tests for BOQ + AI routes
 * Uses supertest against the Express app with an in-memory SQLite test DB.
 */
const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a dedicated test DB so we don't pollute the main DB
const TEST_DB = path.join(__dirname, '..', 'test.db');
process.env.DB_PATH = TEST_DB;
process.env.NODE_ENV = 'test';

let app;
let token;
let siteId;

beforeAll(async () => {
  // Remove old test DB if it exists
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  app = require('../server/index');

  // Register + login to get a JWT token
  const bcrypt = require('bcryptjs');
  const { db } = require('../server/db');
  const hash = bcrypt.hashSync('testpass', 10);
  db.prepare("INSERT OR IGNORE INTO users (username, password, full_name, role) VALUES ('testowner', ?, 'Test Owner', 'owner')").run(hash);

  const loginRes = await request(app).post('/api/auth/login').send({ username: 'testowner', password: 'testpass' });
  token = loginRes.body.token;

  // Create a test site
  const siteRes = await request(app)
    .post('/api/sites')
    .set('Authorization', `Bearer ${token}`)
    .send({ site_name: 'Test Site', site_location: 'Ahmedabad', project_type: 'Pipeline', estimated_cost: 1000000, start_date: '2024-01-01', completion_date: '2025-12-31' });
  siteId = siteRes.body.id;
});

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
  if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
});

// ─────────────────────────────────────────────────────────────
// BOQ routes
// ─────────────────────────────────────────────────────────────
describe('BOQ routes', () => {
  let itemId;

  test('POST /api/boq - create BOQ item', async () => {
    const res = await request(app)
      .post('/api/boq')
      .set('Authorization', `Bearer ${token}`)
      .send({ site_id: siteId, item_number: 'WSS-001', description: 'DI pipe 100mm', unit: 'RM', quantity: 1000, rate: 485, actual_cost: 0 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    itemId = res.body.id;
  });

  test('GET /api/boq - list BOQ items', async () => {
    const res = await request(app)
      .get(`/api/boq?site_id=${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const item = res.body.find(i => i.id === itemId);
    expect(item).toBeDefined();
    expect(item.description).toBe('DI pipe 100mm');
    expect(item.qty_used).toBeDefined(); // new column
  });

  test('PUT /api/boq/:id - update BOQ item qty_used', async () => {
    const res = await request(app)
      .put(`/api/boq/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ qty_used: 250 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app)
      .get(`/api/boq?site_id=${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    const updated = check.body.find(i => i.id === itemId);
    expect(updated.qty_used).toBe(250);
  });

  test('DELETE /api/boq/:id - delete BOQ item', async () => {
    const res = await request(app)
      .delete(`/api/boq/${itemId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/boq - requires auth', async () => {
    const res = await request(app).get('/api/boq');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// SOR Rates routes
// ─────────────────────────────────────────────────────────────
describe('SOR Rates routes', () => {
  test('GET /api/boq/sor-rates - returns seeded SOR rates', async () => {
    const res = await request(app)
      .get('/api/boq/sor-rates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(10); // 10 seeded rows
    const first = res.body[0];
    expect(first.item_code).toBeDefined();
    expect(first.rate).toBeGreaterThan(0);
    expect(first.unit).toBeDefined();
  });

  test('GET /api/boq/sor-rates?q=pipe - keyword search', async () => {
    const res = await request(app)
      .get('/api/boq/sor-rates?q=pipe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(r => r.description.toLowerCase().includes('pipe') || r.keywords.toLowerCase().includes('pipe'))).toBe(true);
  });

  test('POST /api/boq/sor-rates - add new SOR rate', async () => {
    const res = await request(app)
      .post('/api/boq/sor-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ item_code: 'TEST-001', description: 'Test item for unit test', unit: 'CUM', rate: 999, category: 'Test', keywords: 'test unit coverage' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  test('POST /api/boq/sor-rates - validates required fields', async () => {
    const res = await request(app)
      .post('/api/boq/sor-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ item_code: 'BAD-001' }); // missing description, unit, rate
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────
// AI Chat history route
// ─────────────────────────────────────────────────────────────
describe('AI Chat history route', () => {
  test('GET /api/ai/chat-history/:site_id - returns empty array initially', async () => {
    const res = await request(app)
      .get(`/api/ai/chat-history/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/ai/chat-history/:site_id - requires auth', async () => {
    const res = await request(app).get(`/api/ai/chat-history/${siteId}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// AI Ask route (without API key - returns 503)
// ─────────────────────────────────────────────────────────────
describe('AI ask route (no API key)', () => {
  test('POST /api/ai/ask/:site_id - returns 503 when ANTHROPIC_API_KEY not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app)
      .post(`/api/ai/ask/${siteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What is the BOQ progress?' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/i);
  });

  test('POST /api/ai/ask/:site_id - requires question field', async () => {
    const res = await request(app)
      .post(`/api/ai/ask/${siteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/question/i);
  });

  test('POST /api/ai/ask/:site_id - requires auth', async () => {
    const res = await request(app)
      .post(`/api/ai/ask/${siteId}`)
      .send({ question: 'test' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// AI upload routes (no API key - returns 503)
// ─────────────────────────────────────────────────────────────
describe('AI upload routes (no API key)', () => {
  test('POST /api/ai/upload-boq/:site_id - returns 400 if no file', async () => {
    const res = await request(app)
      .post(`/api/ai/upload-boq/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  test('POST /api/ai/upload-dpr/:site_id - returns 400 if no file', async () => {
    const res = await request(app)
      .post(`/api/ai/upload-dpr/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });
});

// ─────────────────────────────────────────────────────────────
// RA Bill route
// ─────────────────────────────────────────────────────────────
describe('RA Bill route', () => {
  beforeAll(async () => {
    // Add a couple BOQ items for the RA bill
    await request(app)
      .post('/api/boq')
      .set('Authorization', `Bearer ${token}`)
      .send({ site_id: siteId, item_number: 'B-1-001', description: 'DI K7 pipe 100mm', unit: 'RM', quantity: 2400, rate: 485, qty_used: 1850, actual_cost: 0 });
    await request(app)
      .post('/api/boq')
      .set('Authorization', `Bearer ${token}`)
      .send({ site_id: siteId, item_number: 'B-1-002', description: 'Sluice valve 100mm', unit: 'NO', quantity: 20, rate: 12500, qty_used: 15, actual_cost: 0 });
  });

  test('GET /api/boq/ra-bill/:site_id - returns Excel file', async () => {
    const res = await request(app)
      .get(`/api/boq/ra-bill/${siteId}?bill_no=1&bill_date=2025-01-31`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(Buffer.isBuffer(res.body) || res.body).toBeTruthy();
    // Check minimum Excel file size (a valid xlsx should be > 1KB)
    expect(res.body.length || parseInt(res.headers['content-length'])).toBeGreaterThan(1000);
  }, 15000);

  test('GET /api/boq/ra-bill/99999 - 404 for non-existent site', async () => {
    const res = await request(app)
      .get('/api/boq/ra-bill/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// DPR Records route
// ─────────────────────────────────────────────────────────────
describe('DPR records route', () => {
  test('GET /api/boq/dpr-records/:site_id - returns empty array initially', async () => {
    const res = await request(app)
      .get(`/api/boq/dpr-records/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Cache invalidation route
// ─────────────────────────────────────────────────────────────
describe('AI cache invalidation route', () => {
  test('POST /api/ai/invalidate-cache/:site_id - succeeds', async () => {
    const res = await request(app)
      .post(`/api/ai/invalidate-cache/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

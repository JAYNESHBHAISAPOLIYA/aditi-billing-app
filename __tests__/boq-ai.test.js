const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a temp DB for tests
process.env.DB_PATH = path.join('/tmp', 'test-boq-ai.db');
// Remove old test DB if it exists
if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);

const app = require('../server/index');
const { db } = require('../server/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server/middleware/auth');

let token;
let siteId;

beforeAll(() => {
  // Create a test user
  db.prepare(`INSERT OR IGNORE INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)`).run(
    'testuser', bcrypt.hashSync('test123', 10), 'Test User', 'owner'
  );
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get('testuser');
  token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);

  // Create a test site
  const result = db.prepare(`INSERT INTO sites (site_name, site_location, project_type, estimated_cost) VALUES (?, ?, ?, ?)`).run(
    'Test Water Pipeline', 'Ahmedabad', 'Pipeline', 5000000
  );
  siteId = result.lastInsertRowid;

  // Seed SOR rates for tests
  db.prepare(`INSERT OR IGNORE INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'Gujarat', '2024-25', 'WS-001', 'DI K7 Pipe 100mm dia laying', 'RM', 485, 'Water Supply', 'DI pipe,100mm,K7'
  );
});

describe('BOQ API', () => {
  test('GET /api/boq returns empty array for new site', async () => {
    const res = await request(app)
      .get(`/api/boq?site_id=${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/boq creates a BOQ item', async () => {
    const res = await request(app)
      .post('/api/boq')
      .set('Authorization', `Bearer ${token}`)
      .send({
        site_id: siteId,
        item_number: 'B-1',
        description: 'DI K7 Pipe 100mm',
        quantity: 1000,
        unit: 'RM',
        rate: 485,
        total_amount: 485000,
        work_completed_pct: 50,
        remaining_work: 500,
        actual_cost: 242500
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  test('GET /api/boq returns created item', async () => {
    const res = await request(app)
      .get(`/api/boq?site_id=${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].description).toBe('DI K7 Pipe 100mm');
  });
});

describe('AI SOR Routes', () => {
  test('GET /api/ai/sor-rates returns SOR data', async () => {
    const res = await request(app)
      .get('/api/ai/sor-rates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/ai/sor-rates with category filter', async () => {
    const res = await request(app)
      .get('/api/ai/sor-rates?category=Water+Supply')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every(r => r.category === 'Water Supply')).toBe(true);
  });

  test('GET /api/ai/sor-match returns matched rates', async () => {
    const res = await request(app)
      .get('/api/ai/sor-match?description=DI+pipe+100mm+laying')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/ai/sor-match with no description returns empty', async () => {
    const res = await request(app)
      .get('/api/ai/sor-match?description=')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/ai/chat-history/:site_id returns array', async () => {
    const res = await request(app)
      .get(`/api/ai/chat-history/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/ai/dpr-records/:site_id returns array', async () => {
    const res = await request(app)
      .get(`/api/ai/dpr-records/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/ai/ask requires ANTHROPIC_API_KEY', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const res = await request(app)
      .post(`/api/ai/ask/${siteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'What is the total BOQ amount?' });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    if (orig) process.env.ANTHROPIC_API_KEY = orig;
  });

  test('POST /api/ai/ask without question returns 400', async () => {
    const res = await request(app)
      .post(`/api/ai/ask/${siteId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ question: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/ai/upload-boq without file returns 400', async () => {
    const res = await request(app)
      .post(`/api/ai/upload-boq/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('POST /api/ai/upload-dpr without file returns 400', async () => {
    const res = await request(app)
      .post(`/api/ai/upload-dpr/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('RA Bill Routes', () => {
  test('GET /api/ra-bill/preview/:site_id returns bill data', async () => {
    const res = await request(app)
      .get(`/api/ra-bill/preview/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('site');
    expect(res.body).toHaveProperty('boq_items');
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('net_payable');
  });

  test('GET /api/ra-bill/preview with invalid site returns 404', async () => {
    const res = await request(app)
      .get('/api/ra-bill/preview/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/ra-bill/generate/:site_id returns Excel file', async () => {
    const res = await request(app)
      .get(`/api/ra-bill/generate/${siteId}?bill_no=1`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  test('RA Bill summary calculations are correct', async () => {
    const res = await request(app)
      .get(`/api/ra-bill/preview/${siteId}`)
      .set('Authorization', `Bearer ${token}`);
    const { summary } = res.body;
    // Verify TP deduction is ~3.6% of upto_date_amount
    const expectedTP = summary.upto_date_amount * 0.036;
    expect(Math.abs(summary.tp_deduction - expectedTP)).toBeLessThan(1);
    // Verify net payable = after_tp * 0.95
    expect(Math.abs(summary.net_payable - summary.after_tp * 0.95)).toBeLessThan(1);
  });
});

describe('Authentication', () => {
  test('Protected routes return 401 without token', async () => {
    const res = await request(app).get('/api/ai/sor-rates');
    expect(res.status).toBe(401);
  });

  test('Protected routes return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/ai/sor-rates')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

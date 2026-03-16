const request = require('supertest');
const jwt = require('jsonwebtoken');

// Use a fresh in-memory DB for tests
process.env.DB_PATH = ':memory:';
const { JWT_SECRET } = require('../server/middleware/auth');
const app = require('../server/index');

const token = jwt.sign({ id: 1, username: 'testuser', role: 'owner', full_name: 'Test User' }, JWT_SECRET, { expiresIn: '1h' });
const authHeader = 'Bearer ' + token;

describe('SOR Rates API', () => {
  test('GET /api/sor returns array with seeded data', async () => {
    const res = await request(app).get('/api/sor').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('POST /api/sor creates a new rate', async () => {
    const res = await request(app)
      .post('/api/sor')
      .set('Authorization', authHeader)
      .send({ item_code: 'TEST-001', description: 'Test Item', unit: 'RM', rate: 999, category: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  test('POST /api/sor returns 400 without required fields', async () => {
    const res = await request(app)
      .post('/api/sor')
      .set('Authorization', authHeader)
      .send({ description: 'No code' });
    expect(res.status).toBe(400);
  });

  test('GET /api/sor/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/sor/99999').set('Authorization', authHeader);
    expect(res.status).toBe(404);
  });

  test('GET /api/sor requires authentication', async () => {
    const res = await request(app).get('/api/sor');
    expect(res.status).toBe(401);
  });

  test('PUT /api/sor/:id updates a rate', async () => {
    const createRes = await request(app)
      .post('/api/sor')
      .set('Authorization', authHeader)
      .send({ item_code: 'UPD-001', description: 'Update Test', unit: 'Nos', rate: 500 });
    const id = createRes.body.id;
    const res = await request(app)
      .put('/api/sor/' + id)
      .set('Authorization', authHeader)
      .send({ rate: 600 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/sor/:id removes rate', async () => {
    const createRes = await request(app)
      .post('/api/sor')
      .set('Authorization', authHeader)
      .send({ item_code: 'DEL-001', description: 'Delete Test', unit: 'CUM', rate: 100 });
    const id = createRes.body.id;
    const delRes = await request(app).delete('/api/sor/' + id).set('Authorization', authHeader);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});

describe('BOQ API (enhanced)', () => {
  let siteId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', authHeader)
      .send({ site_name: 'Test Site', site_location: 'Test Location', project_type: 'water_supply' });
    siteId = res.body.id;
  });

  test('GET /api/boq returns array', async () => {
    const res = await request(app).get('/api/boq').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/boq creates item with new columns', async () => {
    const res = await request(app)
      .post('/api/boq')
      .set('Authorization', authHeader)
      .send({ site_id: siteId, item_number: '1', description: 'DI Pipe 100mm', unit: 'RM', quantity: 100, rate: 485, qty_tender: 100, sor_rate: 485 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  test('GET /api/boq?site_id filters by site', async () => {
    const res = await request(app).get('/api/boq?site_id=' + siteId).set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body.every(item => item.site_id === siteId)).toBe(true);
    }
  });

  test('PUT /api/boq/:id updates item', async () => {
    const createRes = await request(app)
      .post('/api/boq')
      .set('Authorization', authHeader)
      .send({ site_id: siteId, description: 'To Update', quantity: 50, rate: 200 });
    const id = createRes.body.id;
    const res = await request(app)
      .put('/api/boq/' + id)
      .set('Authorization', authHeader)
      .send({ qty_used: 25, work_completed_pct: 50 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/boq/:id removes item', async () => {
    const createRes = await request(app)
      .post('/api/boq')
      .set('Authorization', authHeader)
      .send({ site_id: siteId, description: 'To Delete', quantity: 10, rate: 100 });
    const id = createRes.body.id;
    const delRes = await request(app).delete('/api/boq/' + id).set('Authorization', authHeader);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});

describe('DPR API', () => {
  test('GET /api/dpr returns array', async () => {
    const res = await request(app).get('/api/dpr').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/dpr/:id returns 404 for unknown', async () => {
    const res = await request(app).get('/api/dpr/99999').set('Authorization', authHeader);
    expect(res.status).toBe(404);
  });
});

describe('AI Routes', () => {
  let siteId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', authHeader)
      .send({ site_name: 'AI Test Site', site_location: 'Halol', project_type: 'water_supply' });
    siteId = res.body.id;
  });

  test('POST /api/ai/ask returns an answer', async () => {
    const res = await request(app)
      .post('/api/ai/ask/' + siteId)
      .set('Authorization', authHeader)
      .send({ question: 'What is the project status?' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answer');
    expect(typeof res.body.answer).toBe('string');
  });

  test('POST /api/ai/ask requires question field', async () => {
    const res = await request(app)
      .post('/api/ai/ask/' + siteId)
      .set('Authorization', authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/ai/ask returns 404 for unknown site', async () => {
    const res = await request(app)
      .post('/api/ai/ask/99999')
      .set('Authorization', authHeader)
      .send({ question: 'test' });
    expect(res.status).toBe(404);
  });

  test('POST /api/ai/upload-boq requires file', async () => {
    const res = await request(app)
      .post('/api/ai/upload-boq/' + siteId)
      .set('Authorization', authHeader);
    expect(res.status).toBe(400);
  });

  test('POST /api/ai/upload-dpr requires file', async () => {
    const res = await request(app)
      .post('/api/ai/upload-dpr/' + siteId)
      .set('Authorization', authHeader);
    expect(res.status).toBe(400);
  });
});

describe('RA Bill API', () => {
  let siteId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/sites')
      .set('Authorization', authHeader)
      .send({ site_name: 'RA Bill Test Site', site_location: 'Gandhinagar', project_type: 'water_supply' });
    siteId = res.body.id;
    await request(app)
      .post('/api/boq')
      .set('Authorization', authHeader)
      .send({ site_id: siteId, item_number: '1', description: 'DI Pipe 100mm', unit: 'RM', quantity: 100, rate: 485, qty_tender: 100, sor_rate: 485, qty_used: 50 });
  });

  test('GET /api/ra-bill/:siteId returns Excel file', async () => {
    const res = await request(app)
      .get('/api/ra-bill/' + siteId + '?bill_no=1')
      .set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  test('GET /api/ra-bill/:siteId returns 404 for unknown site', async () => {
    const res = await request(app)
      .get('/api/ra-bill/99999')
      .set('Authorization', authHeader);
    expect(res.status).toBe(404);
  });
});

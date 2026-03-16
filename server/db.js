const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'construction.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    -- Users & Roles
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','site_manager','accountant','worker')),
      email TEXT,
      phone TEXT,
      assigned_site_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Construction Sites
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_name TEXT NOT NULL,
      site_location TEXT,
      project_type TEXT,
      tender_number TEXT,
      start_date TEXT,
      completion_date TEXT,
      estimated_cost REAL DEFAULT 0,
      contractor_name TEXT,
      department_name TEXT,
      assigned_manager_id INTEGER,
      progress_percentage REAL DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','on_hold','cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_manager_id) REFERENCES users(id)
    );

    -- Material Purchases
    CREATE TABLE IF NOT EXISTS material_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      supplier TEXT,
      quantity REAL,
      unit TEXT,
      rate REAL,
      total_amount REAL,
      purchase_date TEXT,
      invoice_path TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Labour Records
    CREATE TABLE IF NOT EXISTS labour_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      worker_name TEXT NOT NULL,
      labour_type TEXT,
      work_type TEXT,
      wage_type TEXT CHECK(wage_type IN ('daily','monthly')),
      wage_amount REAL,
      attendance_days REAL,
      total_days_worked REAL,
      total_salary REAL,
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','partial','paid')),
      month TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Office Expenses
    CREATE TABLE IF NOT EXISTS office_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL,
      expense_date TEXT,
      description TEXT,
      bill_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Fuel Expenses
    CREATE TABLE IF NOT EXISTS fuel_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      vehicle_name TEXT,
      fuel_type TEXT CHECK(fuel_type IN ('petrol','diesel')),
      quantity REAL,
      rate REAL,
      total_cost REAL,
      expense_date TEXT,
      bill_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Machinery Expenses
    CREATE TABLE IF NOT EXISTS machinery_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      machine_name TEXT NOT NULL,
      owner_vendor TEXT,
      hours_used REAL,
      rate REAL,
      total_cost REAL,
      expense_date TEXT,
      invoice_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Government Payments
    CREATE TABLE IF NOT EXISTS government_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      department_name TEXT,
      payment_type TEXT,
      amount REAL,
      payment_date TEXT,
      receipt_path TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Sale Bills
    CREATE TABLE IF NOT EXISTS sale_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      bill_number TEXT,
      work_description TEXT,
      bill_amount REAL,
      bill_date TEXT,
      approved_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','approved','partial','received')),
      payment_received_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Daily Work Reports
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      work_completed TEXT,
      labour_count INTEGER,
      machinery_used TEXT,
      material_used TEXT,
      weather TEXT,
      photos TEXT,
      problems TEXT,
      submitted_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id)
    );

    -- Documents
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL,
      doc_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    -- BOQ Items
    CREATE TABLE IF NOT EXISTS boq_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      item_number TEXT,
      description TEXT,
      quantity REAL,
      unit TEXT,
      rate REAL,
      total_amount REAL,
      work_completed_pct REAL DEFAULT 0,
      remaining_work REAL,
      actual_cost REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- Vendors
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      contact_number TEXT,
      material_type TEXT,
      address TEXT,
      payment_pending REAL DEFAULT 0,
      total_purchase REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- SOR Rates (Schedule of Rates - government rate book)
    CREATE TABLE IF NOT EXISTS sor_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL DEFAULT 'Gujarat',
      year TEXT NOT NULL DEFAULT '2024-25',
      item_code TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      rate REAL NOT NULL,
      category TEXT,
      keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- DPR (Daily Progress Reports) structured data
    CREATE TABLE IF NOT EXISTS dpr_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      extracted_data TEXT,
      labour_skilled INTEGER DEFAULT 0,
      labour_unskilled INTEGER DEFAULT 0,
      labour_amount REAL DEFAULT 0,
      weather TEXT,
      remarks TEXT,
      source_doc TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- DPR Work Items
    CREATE TABLE IF NOT EXISTS dpr_work_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dpr_id INTEGER NOT NULL,
      site_id INTEGER NOT NULL,
      item_description TEXT,
      quantity REAL DEFAULT 0,
      unit TEXT,
      location TEXT,
      boq_item_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (dpr_id) REFERENCES dpr_records(id),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (boq_item_id) REFERENCES boq_items(id)
    );

    -- AI Chat History
    CREATE TABLE IF NOT EXISTS ai_chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      user_message TEXT NOT NULL,
      ai_response TEXT NOT NULL,
      tables_referenced TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- RA Bills
    CREATE TABLE IF NOT EXISTS ra_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      bill_no INTEGER NOT NULL,
      bill_period_from TEXT,
      bill_period_to TEXT,
      bill_date TEXT,
      gross_amount REAL DEFAULT 0,
      tp_deduction REAL DEFAULT 0,
      price_variation REAL DEFAULT 0,
      retention REAL DEFAULT 0,
      net_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','paid')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );
  `);

  // Extend boq_items with AI/SOR columns (idempotent)
  const boqCols = db.prepare("PRAGMA table_info(boq_items)").all().map(c => c.name);
  if (!boqCols.includes('item_code')) db.prepare("ALTER TABLE boq_items ADD COLUMN item_code TEXT").run();
  if (!boqCols.includes('qty_tender')) db.prepare("ALTER TABLE boq_items ADD COLUMN qty_tender REAL DEFAULT 0").run();
  if (!boqCols.includes('qty_used')) db.prepare("ALTER TABLE boq_items ADD COLUMN qty_used REAL DEFAULT 0").run();
  if (!boqCols.includes('sor_rate')) db.prepare("ALTER TABLE boq_items ADD COLUMN sor_rate REAL DEFAULT 0").run();
  if (!boqCols.includes('sor_match_confidence')) db.prepare("ALTER TABLE boq_items ADD COLUMN sor_match_confidence REAL DEFAULT 0").run();
  if (!boqCols.includes('source_doc')) db.prepare("ALTER TABLE boq_items ADD COLUMN source_doc TEXT").run();
  if (!boqCols.includes('sor_item_id')) db.prepare("ALTER TABLE boq_items ADD COLUMN sor_item_id INTEGER").run();

  // Seed SOR rates if empty
  const sorCount = db.prepare("SELECT COUNT(*) as cnt FROM sor_rates").get();
  if (sorCount.cnt === 0) {
    const seedRates = [
      { state: 'Gujarat', year: '2024-25', item_code: 'B-1-01', description: 'DI K7 class pipe 100mm dia including laying, jointing, testing', unit: 'RM', rate: 485, category: 'Water Supply', keywords: 'DI pipe 100mm water supply laying' },
      { state: 'Gujarat', year: '2024-25', item_code: 'B-1-02', description: 'DI K9 class pipe 150mm dia including laying, jointing, testing', unit: 'RM', rate: 720, category: 'Water Supply', keywords: 'DI pipe 150mm water supply laying' },
      { state: 'Gujarat', year: '2024-25', item_code: 'B-1-03', description: 'DI K9 class pipe 200mm dia including laying, jointing, testing', unit: 'RM', rate: 1050, category: 'Water Supply', keywords: 'DI pipe 200mm water supply laying' },
      { state: 'Gujarat', year: '2024-25', item_code: 'B-2-01', description: 'Sluice valve 100mm flanged including all accessories', unit: 'Nos', rate: 8500, category: 'Water Supply', keywords: 'sluice valve 100mm gate valve' },
      { state: 'Gujarat', year: '2024-25', item_code: 'B-2-02', description: 'Sluice valve 150mm flanged including all accessories', unit: 'Nos', rate: 14500, category: 'Water Supply', keywords: 'sluice valve 150mm gate valve' },
      { state: 'Gujarat', year: '2024-25', item_code: 'C-1-01', description: 'Brick masonry valve chamber 0.9x0.9x1.2m with RCC cover', unit: 'Nos', rate: 12500, category: 'Civil', keywords: 'valve chamber brick masonry cover' },
      { state: 'Gujarat', year: '2024-25', item_code: 'R-1-01', description: 'Earthwork excavation in ordinary soil for pipe trench depth upto 1.5m', unit: 'Cum', rate: 185, category: 'Earthwork', keywords: 'excavation soil trench earthwork' },
      { state: 'Gujarat', year: '2024-25', item_code: 'R-1-02', description: 'Refilling of excavated earth in trenches with compaction', unit: 'Cum', rate: 95, category: 'Earthwork', keywords: 'refilling backfill trench compaction' },
      { state: 'Gujarat', year: '2024-25', item_code: 'P-1-01', description: 'UPVC pressure pipe 110mm dia Class C including laying and jointing', unit: 'RM', rate: 285, category: 'Water Supply', keywords: 'UPVC pipe 110mm pressure laying' },
      { state: 'Gujarat', year: '2024-25', item_code: 'P-1-02', description: 'HDPE pipe 63mm dia PN 10 for house service connection', unit: 'RM', rate: 165, category: 'Water Supply', keywords: 'HDPE pipe 63mm service connection household' },
    ];
    const insertSor = db.prepare("INSERT INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords) VALUES (?,?,?,?,?,?,?,?)");
    for (const r of seedRates) {
      insertSor.run(r.state, r.year, r.item_code, r.description, r.unit, r.rate, r.category, r.keywords);
    }
  }
}

module.exports = { db, initializeDatabase };

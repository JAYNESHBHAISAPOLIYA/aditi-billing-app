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

    -- SOR Rates (Schedule of Rates - Government published rate book)
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

    -- DPR Records (Daily Progress Reports with AI-extracted data)
    CREATE TABLE IF NOT EXISTS dpr_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      work_done TEXT,
      labour_skilled INTEGER DEFAULT 0,
      labour_unskilled INTEGER DEFAULT 0,
      labour_amount REAL DEFAULT 0,
      materials_used TEXT,
      remarks TEXT,
      weather TEXT,
      source_file TEXT,
      ai_raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- AI Chat History
    CREATE TABLE IF NOT EXISTS ai_chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      user_id INTEGER,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      tables_referenced TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
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
  `);

  // Add new columns to boq_items if they don't exist (migration)
  const boqCols = db.pragma('table_info(boq_items)').map(c => c.name);
  if (!boqCols.includes('qty_used')) db.exec('ALTER TABLE boq_items ADD COLUMN qty_used REAL DEFAULT 0');
  if (!boqCols.includes('source_doc')) db.exec('ALTER TABLE boq_items ADD COLUMN source_doc TEXT');
  if (!boqCols.includes('item_code')) db.exec('ALTER TABLE boq_items ADD COLUMN item_code TEXT');
  if (!boqCols.includes('sor_rate_id')) db.exec('ALTER TABLE boq_items ADD COLUMN sor_rate_id INTEGER');
  if (!boqCols.includes('sor_match_pct')) db.exec('ALTER TABLE boq_items ADD COLUMN sor_match_pct REAL DEFAULT 0');

  // Seed SOR rates if table is empty
  const sorCount = db.prepare('SELECT COUNT(*) as n FROM sor_rates').get();
  if (sorCount.n === 0) {
    const sorData = [
      { code: 'WSS-001', desc: 'DI K7 pipe 100mm dia supply and laying', unit: 'RM', rate: 485, cat: 'Water Supply', kw: 'di pipe 100mm k7 water supply laying' },
      { code: 'WSS-002', desc: 'DI K9 pipe 150mm dia supply and laying', unit: 'RM', rate: 720, cat: 'Water Supply', kw: 'di pipe 150mm k9 water supply laying' },
      { code: 'WSS-003', desc: 'HDPE pipe 63mm dia supply and laying', unit: 'RM', rate: 185, cat: 'Water Supply', kw: 'hdpe pipe 63mm polyethylene laying' },
      { code: 'WSS-004', desc: 'Sluice valve 100mm NP16 with CI body', unit: 'NO', rate: 12500, cat: 'Water Supply', kw: 'sluice valve 100mm gate valve ci' },
      { code: 'WSS-005', desc: 'RCC Boundary wall 230mm thick including excavation', unit: 'RM', rate: 2850, cat: 'Civil Works', kw: 'rcc boundary wall 230mm excavation' },
      { code: 'RD-001', desc: 'Earthwork in excavation in ordinary soil up to 1.5m', unit: 'CUM', rate: 145, cat: 'Road Works', kw: 'earthwork excavation ordinary soil road' },
      { code: 'RD-002', desc: 'GSB (Granular Sub Base) material supply and laying', unit: 'CUM', rate: 1250, cat: 'Road Works', kw: 'gsb granular sub base road laying' },
      { code: 'RD-003', desc: 'WBM Grade III water bound macadam', unit: 'CUM', rate: 1850, cat: 'Road Works', kw: 'wbm water bound macadam grade iii road' },
      { code: 'BLD-001', desc: 'Cement concrete M25 grade in RCC work', unit: 'CUM', rate: 7500, cat: 'Building Works', kw: 'cement concrete m25 rcc structure building' },
      { code: 'BLD-002', desc: 'Reinforcement steel Fe-500 supply and fabrication', unit: 'MT', rate: 68000, cat: 'Building Works', kw: 'reinforcement steel fe500 rebar bar fabrication' },
    ];
    const sorInsert = db.prepare('INSERT INTO sor_rates (item_code, description, unit, rate, category, keywords) VALUES (?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) sorInsert.run(r.code, r.desc, r.unit, r.rate, r.cat, r.kw); });
    insertMany(sorData);
  }
}

module.exports = { db, initializeDatabase };

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
      qty_tender REAL DEFAULT 0,
      qty_used REAL DEFAULT 0,
      sor_rate REAL DEFAULT 0,
      sor_item_code TEXT,
      source_doc TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    -- SOR Rates (Schedule of Rates)
    CREATE TABLE IF NOT EXISTS sor_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL DEFAULT 'Gujarat',
      year TEXT NOT NULL DEFAULT '2024-25',
      item_code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      rate REAL NOT NULL,
      category TEXT,
      keywords TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- DPR Records (Daily Progress Reports)
    CREATE TABLE IF NOT EXISTS dpr_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      report_date TEXT NOT NULL,
      work_done TEXT,
      labour_skilled INTEGER DEFAULT 0,
      labour_unskilled INTEGER DEFAULT 0,
      labour_amount REAL DEFAULT 0,
      materials_used TEXT,
      weather TEXT,
      remarks TEXT,
      source_doc TEXT,
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
  `);

  // Migrate existing boq_items to add new columns if they don't exist
  const boqCols = db.prepare("PRAGMA table_info(boq_items)").all().map(c => c.name);
  if (!boqCols.includes('qty_tender')) db.exec("ALTER TABLE boq_items ADD COLUMN qty_tender REAL DEFAULT 0");
  if (!boqCols.includes('qty_used')) db.exec("ALTER TABLE boq_items ADD COLUMN qty_used REAL DEFAULT 0");
  if (!boqCols.includes('sor_rate')) db.exec("ALTER TABLE boq_items ADD COLUMN sor_rate REAL DEFAULT 0");
  if (!boqCols.includes('sor_item_code')) db.exec("ALTER TABLE boq_items ADD COLUMN sor_item_code TEXT");
  if (!boqCols.includes('source_doc')) db.exec("ALTER TABLE boq_items ADD COLUMN source_doc TEXT");

  // Seed SOR rates if table is empty
  const sorCount = db.prepare("SELECT COUNT(*) as c FROM sor_rates").get();
  if (sorCount.c === 0) {
    const insertSor = db.prepare(`
      INSERT INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const sorData = [
      ['Gujarat','2024-25','WS-001','Supply & Laying DI K7 Pipe 100mm dia','RM',485,'Water Supply','di pipe 100mm k7 ductile iron water supply'],
      ['Gujarat','2024-25','WS-002','Supply & Laying DI K7 Pipe 150mm dia','RM',720,'Water Supply','di pipe 150mm k7 ductile iron water supply'],
      ['Gujarat','2024-25','WS-003','Supply & Laying DI K7 Pipe 200mm dia','RM',1050,'Water Supply','di pipe 200mm k7 ductile iron water supply'],
      ['Gujarat','2024-25','WS-004','Supply & Laying uPVC Pipe 63mm dia','RM',185,'Water Supply','upvc pipe 63mm plastic water supply distribution'],
      ['Gujarat','2024-25','WS-005','Supply & Laying uPVC Pipe 90mm dia','RM',240,'Water Supply','upvc pipe 90mm plastic water supply distribution'],
      ['Gujarat','2024-25','WS-006','Providing & Fixing Sluice Valve 100mm','Nos',4200,'Water Supply','sluice valve 100mm gate valve isolation'],
      ['Gujarat','2024-25','WS-007','Providing & Fixing Air Valve 50mm','Nos',2800,'Water Supply','air valve 50mm air release valve'],
      ['Gujarat','2024-25','WS-008','Construction of Brick Masonry Chamber','Nos',18500,'Civil Works','chamber brick masonry valve chamber'],
      ['Gujarat','2024-25','RD-001','Earthwork Excavation in All Kinds of Soil','CUM',85,'Earthwork','earthwork excavation excavation soil'],
      ['Gujarat','2024-25','RD-002','Providing & Laying GSB 200mm thick','CUM',1200,'Road Works','granular sub base gsb road pavement'],
    ];
    const insertAll = db.transaction(() => {
      for (const row of sorData) insertSor.run(...row);
    });
    insertAll();
  }
}

module.exports = { db, initializeDatabase };

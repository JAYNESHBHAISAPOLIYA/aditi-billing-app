const bcrypt = require('bcryptjs');
const { db, initializeDatabase } = require('./db');

initializeDatabase();

// Seed default owner
const ownerPassword = bcrypt.hashSync('admin123', 10);
try {
  db.prepare(`
    INSERT OR IGNORE INTO users (username, password, full_name, role, email, phone)
    VALUES ('admin', ?, 'Company Owner', 'owner', 'admin@aditi.com', '9999999999')
  `).run(ownerPassword);
} catch (e) { /* ignore duplicate */ }

// Seed site managers
const managerPassword = bcrypt.hashSync('manager123', 10);
const managers = [
  { username: 'manager1', name: 'Rajesh Kumar', phone: '9876543210' },
  { username: 'manager2', name: 'Suresh Patel', phone: '9876543211' },
  { username: 'manager3', name: 'Mahesh Singh', phone: '9876543212' },
];

for (const m of managers) {
  try {
    db.prepare(`INSERT OR IGNORE INTO users (username, password, full_name, role, phone) VALUES (?, ?, ?, 'site_manager', ?)`).run(m.username, managerPassword, m.name, m.phone);
  } catch (e) { /* ignore */ }
}

// Seed accountant
try {
  db.prepare(`INSERT OR IGNORE INTO users (username, password, full_name, role) VALUES ('accountant1', ?, 'Priya Sharma', 'accountant')`).run(bcrypt.hashSync('account123', 10));
} catch (e) { /* ignore */ }

// Seed 10 construction sites
const siteData = [
  { name: 'NH-48 Highway Extension', location: 'Ahmedabad, Gujarat', type: 'Highway', tender: 'GJ-2024-HW-001', dept: 'NHAI', cost: 50000000, manager: 2 },
  { name: 'Government Hospital Building', location: 'Surat, Gujarat', type: 'Building', tender: 'GJ-2024-BLD-002', dept: 'Health Dept', cost: 35000000, manager: 3 },
  { name: 'District Court Complex', location: 'Rajkot, Gujarat', type: 'Building', tender: 'GJ-2024-BLD-003', dept: 'PWD', cost: 45000000, manager: 4 },
  { name: 'Water Pipeline Project', location: 'Vadodara, Gujarat', type: 'Pipeline', tender: 'GJ-2024-WP-004', dept: 'Water Supply', cost: 28000000, manager: 2 },
  { name: 'Bridge Construction - Tapi', location: 'Surat, Gujarat', type: 'Bridge', tender: 'GJ-2024-BR-005', dept: 'PWD', cost: 75000000, manager: 3 },
  { name: 'School Renovation Project', location: 'Bhavnagar, Gujarat', type: 'Renovation', tender: 'GJ-2024-RN-006', dept: 'Education Dept', cost: 15000000, manager: 4 },
  { name: 'Sewage Treatment Plant', location: 'Junagadh, Gujarat', type: 'Infrastructure', tender: 'GJ-2024-STP-007', dept: 'Municipal Corp', cost: 42000000, manager: 2 },
  { name: 'Smart City Road Network', location: 'Gandhinagar, Gujarat', type: 'Road', tender: 'GJ-2024-RD-008', dept: 'Smart City Mission', cost: 62000000, manager: 3 },
  { name: 'Community Health Center', location: 'Mehsana, Gujarat', type: 'Building', tender: 'GJ-2024-CHC-009', dept: 'Health Dept', cost: 22000000, manager: 4 },
  { name: 'Industrial Area Development', location: 'Kutch, Gujarat', type: 'Infrastructure', tender: 'GJ-2024-IND-010', dept: 'Industries Dept', cost: 88000000, manager: 2 },
];

for (const s of siteData) {
  try {
    db.prepare(`
      INSERT OR IGNORE INTO sites (site_name, site_location, project_type, tender_number, department_name, estimated_cost, assigned_manager_id, start_date, completion_date, contractor_name, progress_percentage)
      VALUES (?, ?, ?, ?, ?, ?, ?, '2024-01-15', '2025-12-31', 'Aditi Construction Pvt Ltd', ?)
    `).run(s.name, s.location, s.type, s.tender, s.dept, s.cost, s.manager, Math.floor(Math.random() * 80 + 10));
  } catch (e) { /* ignore */ }
}

// Seed sample data for each site
const sites = db.prepare('SELECT id FROM sites').all();
const materials = ['Cement', 'Sand', 'Steel', 'Pipes', 'Bricks', 'Concrete', 'Gravel', 'Paint', 'Wood', 'Tiles'];
const labourTypes = ['Mason', 'Helper', 'Carpenter', 'Plumber', 'Electrician', 'Welder', 'Painter'];

for (const site of sites) {
  // Add material purchases
  for (let i = 0; i < 5; i++) {
    const mat = materials[Math.floor(Math.random() * materials.length)];
    const qty = Math.floor(Math.random() * 100 + 10);
    const rate = Math.floor(Math.random() * 500 + 50);
    db.prepare(`INSERT INTO material_purchases (site_id, material_name, supplier, quantity, unit, rate, total_amount, purchase_date) VALUES (?, ?, ?, ?, 'bags', ?, ?, ?)`).run(
      site.id, mat, 'Local Supplier', qty, rate, qty * rate, `2024-0${Math.floor(Math.random() * 9 + 1)}-15`
    );
  }

  // Add labour records
  for (let i = 0; i < 4; i++) {
    const type = labourTypes[Math.floor(Math.random() * labourTypes.length)];
    const wage = Math.floor(Math.random() * 500 + 300);
    const days = Math.floor(Math.random() * 25 + 5);
    db.prepare(`INSERT INTO labour_records (site_id, worker_name, labour_type, work_type, wage_type, wage_amount, attendance_days, total_days_worked, total_salary, payment_status, month) VALUES (?, ?, ?, 'Construction', 'daily', ?, ?, ?, ?, ?, '2024-06')`).run(
      site.id, `Worker ${i + 1}`, type, wage, days, days, wage * days, ['pending', 'paid', 'partial'][Math.floor(Math.random() * 3)]
    );
  }

  // Add office expenses
  const categories = ['Staff Salary', 'House Rent', 'Kitchen/Food', 'Electricity', 'Internet'];
  for (const cat of categories.slice(0, 3)) {
    db.prepare(`INSERT INTO office_expenses (site_id, category, amount, expense_date, description) VALUES (?, ?, ?, '2024-06-15', ?)`).run(
      site.id, cat, Math.floor(Math.random() * 20000 + 5000), `Monthly ${cat}`
    );
  }

  // Add fuel expenses
  db.prepare(`INSERT INTO fuel_expenses (site_id, vehicle_name, fuel_type, quantity, rate, total_cost, expense_date) VALUES (?, 'Site JCB', 'diesel', 100, 95, 9500, '2024-06-15')`).run(site.id);
  db.prepare(`INSERT INTO fuel_expenses (site_id, vehicle_name, fuel_type, quantity, rate, total_cost, expense_date) VALUES (?, 'Transport Truck', 'diesel', 80, 95, 7600, '2024-06-20')`).run(site.id);

  // Add machinery expenses
  db.prepare(`INSERT INTO machinery_expenses (site_id, machine_name, owner_vendor, hours_used, rate, total_cost, expense_date) VALUES (?, 'JCB', 'Local Rental', 40, 1500, 60000, '2024-06-15')`).run(site.id);

  // Add sale bill
  db.prepare(`INSERT INTO sale_bills (site_id, bill_number, work_description, bill_amount, bill_date, approved_amount, payment_status) VALUES (?, ?, 'Phase 1 Work Completion', ?, '2024-06-30', ?, 'approved')`).run(
    site.id, `BILL-${site.id}-001`, Math.floor(Math.random() * 5000000 + 1000000), Math.floor(Math.random() * 4000000 + 800000)
  );
}

// Seed vendors
const vendorData = [
  { name: 'Gujarat Cement Works', contact: '9876500001', type: 'Cement', pending: 150000, total: 2500000 },
  { name: 'Steel India Pvt Ltd', contact: '9876500002', type: 'Steel', pending: 250000, total: 4500000 },
  { name: 'Sand & Gravel Suppliers', contact: '9876500003', type: 'Sand/Gravel', pending: 50000, total: 1800000 },
  { name: 'Pipe Solutions Inc', contact: '9876500004', type: 'Pipes', pending: 0, total: 900000 },
  { name: 'BuildMart Hardware', contact: '9876500005', type: 'Hardware', pending: 75000, total: 650000 },
];

for (const v of vendorData) {
  try {
    db.prepare(`INSERT OR IGNORE INTO vendors (vendor_name, contact_number, material_type, payment_pending, total_purchase) VALUES (?, ?, ?, ?, ?)`).run(v.name, v.contact, v.type, v.pending, v.total);
  } catch (e) { /* ignore */ }
}

// Seed SOR Rates (Gujarat PWD SOR 2024-25)
const sorRates = [
  { state: 'Gujarat', year: '2024-25', item_code: 'WS-001', description: 'DI K7 Pipe 100mm dia laying including jointing', unit: 'RM', rate: 485, category: 'Water Supply', keywords: 'DI pipe,100mm,K7,ductile iron,water supply' },
  { state: 'Gujarat', year: '2024-25', item_code: 'WS-002', description: 'DI K7 Pipe 150mm dia laying including jointing', unit: 'RM', rate: 720, category: 'Water Supply', keywords: 'DI pipe,150mm,K7,ductile iron,water supply' },
  { state: 'Gujarat', year: '2024-25', item_code: 'WS-003', description: 'DI K7 Pipe 200mm dia laying including jointing', unit: 'RM', rate: 980, category: 'Water Supply', keywords: 'DI pipe,200mm,K7,ductile iron,water supply' },
  { state: 'Gujarat', year: '2024-25', item_code: 'WS-004', description: 'Gate valve 100mm dia (IS:14846) installation', unit: 'Nos', rate: 12500, category: 'Water Supply', keywords: 'gate valve,100mm,valve,sluice valve' },
  { state: 'Gujarat', year: '2024-25', item_code: 'WS-005', description: 'Air valve 50mm dia installation', unit: 'Nos', rate: 8500, category: 'Water Supply', keywords: 'air valve,50mm,air release valve' },
  { state: 'Gujarat', year: '2024-25', item_code: 'RD-001', description: 'Earthwork excavation in soft soil', unit: 'Cum', rate: 185, category: 'Roads', keywords: 'earthwork,excavation,soft soil,earth cutting' },
  { state: 'Gujarat', year: '2024-25', item_code: 'RD-002', description: 'GSB (Granular Sub Base) 200mm thick compacted', unit: 'Sqm', rate: 245, category: 'Roads', keywords: 'GSB,granular sub base,road base,sub base' },
  { state: 'Gujarat', year: '2024-25', item_code: 'RD-003', description: 'WBM (Water Bound Macadam) 75mm thick', unit: 'Sqm', rate: 320, category: 'Roads', keywords: 'WBM,water bound macadam,road,macadam' },
  { state: 'Gujarat', year: '2024-25', item_code: 'BLD-001', description: 'RCC M20 grade concrete for foundations', unit: 'Cum', rate: 6800, category: 'Buildings', keywords: 'RCC,M20,concrete,foundation,reinforced cement concrete' },
  { state: 'Gujarat', year: '2024-25', item_code: 'BLD-002', description: 'Brick masonry in CM 1:6 in superstructure', unit: 'Cum', rate: 5200, category: 'Buildings', keywords: 'brick masonry,cement mortar,brick work,masonry' },
];

for (const sor of sorRates) {
  try {
    db.prepare(`INSERT OR IGNORE INTO sor_rates (state, year, item_code, description, unit, rate, category, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(sor.state, sor.year, sor.item_code, sor.description, sor.unit, sor.rate, sor.category, sor.keywords);
  } catch (e) { /* ignore */ }
}

console.log('Database seeded successfully!');

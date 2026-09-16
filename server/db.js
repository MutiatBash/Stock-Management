const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'stock.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_level INTEGER NOT NULL DEFAULT 5,
    cost_price REAL NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    action TEXT NOT NULL,      -- 'sold', 'added', 'created', 'removed_item'
    change_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by_role TEXT NOT NULL,     -- 'admin' or 'staff'
    created_by_name TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,   -- 'product' or 'service'
    item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    line_total REAL NOT NULL,      -- unit_price * quantity, excludes VAT
    vat_rate REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,  -- snapshot of cost at time of sale, for profit reports
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS service_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_contact TEXT NOT NULL DEFAULT '',
    item TEXT NOT NULL,
    item_condition TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    amount_charged REAL NOT NULL DEFAULT 0,
    mode_of_payment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'received',   -- 'received' or 'collected'
    date_received TEXT,
    date_collected TEXT,
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_contact TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    amount_owed REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    date_incurred TEXT NOT NULL,
    due_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Default VAT rate used to pre-fill the VAT field when adding a new
// product/service. Each product/service stores and applies its own rate
// after that — this is just a starting suggestion, not a global rate.
const vatSetting = db.prepare("SELECT value FROM settings WHERE key = 'default_vat_rate'").get();
if (!vatSetting) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('default_vat_rate', '0')").run();
}

// ---------------------------------------------------------------------
// Safe migrations: add any columns that don't exist yet, so upgrading
// from an earlier version of the app never loses existing data.
// ---------------------------------------------------------------------
function migrateTable(table, migrations) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [column, sql] of Object.entries(migrations)) {
    if (!existingColumns.includes(column)) db.exec(sql);
  }
}

migrateTable('items', {
  description: "ALTER TABLE items ADD COLUMN description TEXT NOT NULL DEFAULT ''",
  category: "ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT ''",
  cost_price: 'ALTER TABLE items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0',
  price: 'ALTER TABLE items ADD COLUMN price REAL NOT NULL DEFAULT 0',
  vat_rate: 'ALTER TABLE items ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0',
  sku: "ALTER TABLE items ADD COLUMN sku TEXT NOT NULL DEFAULT ''",
  image_url: "ALTER TABLE items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
});

migrateTable('services', {
  cost_price: 'ALTER TABLE services ADD COLUMN cost_price REAL NOT NULL DEFAULT 0',
  vat_rate: 'ALTER TABLE services ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0',
});

migrateTable('sale_items', {
  vat_rate: 'ALTER TABLE sale_items ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0',
  vat_amount: 'ALTER TABLE sale_items ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0',
  cost_price: 'ALTER TABLE sale_items ADD COLUMN cost_price REAL NOT NULL DEFAULT 0',
});

// Migrate old "vat_rate" setting key to "default_vat_rate" if present
const oldVatSetting = db.prepare("SELECT value FROM settings WHERE key = 'vat_rate'").get();
if (oldVatSetting) {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'default_vat_rate'").run(oldVatSetting.value);
  db.prepare("DELETE FROM settings WHERE key = 'vat_rate'").run();
}

module.exports = db;

// Postgres (Supabase) database layer.
// Exposes small async helpers so the routes in server.js stay readable:
//   db.all(sql, params)  -> array of rows
//   db.get(sql, params)  -> first row or undefined
//   db.run(sql, params)  -> { rowCount, rows }
//   db.transaction(async (tx) => { ... }) -> tx has the same all/get/run
// SQL in this project is written with "?" placeholders; they are converted to $1, $2... here.
const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error(
    '\nDATABASE_URL is not set.\n' +
    'Add your Supabase connection string as an environment variable named DATABASE_URL\n' +
    '(in a .env file locally, or under Environment on Render).\n'
  );
  process.exit(1);
}

const useSsl = process.env.DATABASE_SSL !== 'false';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
});
pool.on('error', (err) => console.error('Unexpected database error:', err.message));

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makeApi(executor) {
  return {
    async all(sql, params = []) {
      const result = await executor.query(toPg(sql), params);
      return result.rows;
    },
    async get(sql, params = []) {
      const result = await executor.query(toPg(sql), params);
      return result.rows[0];
    },
    async run(sql, params = []) {
      const result = await executor.query(toPg(sql), params);
      return { rowCount: result.rowCount, rows: result.rows };
    },
  };
}

const db = makeApi(pool);
db.pool = pool;
db.toPg = toPg;

db.transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(makeApi(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    throw err;
  } finally {
    client.release();
  }
};

const NOW_TEXT = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;

db.init = async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_level INTEGER NOT NULL DEFAULT 5,
      cost_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      price DOUBLE PRECISION NOT NULL DEFAULT 0,
      vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      action TEXT NOT NULL,
      change_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      price DOUBLE PRECISION NOT NULL DEFAULT 0,
      cost_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS staff_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      created_by_role TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
      vat_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      total DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      unit_price DOUBLE PRECISION NOT NULL,
      quantity INTEGER NOT NULL,
      line_total DOUBLE PRECISION NOT NULL,
      vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
      vat_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      cost_price DOUBLE PRECISION NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS service_jobs (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL DEFAULT '',
      item TEXT NOT NULL,
      item_condition TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      amount_charged DOUBLE PRECISION NOT NULL DEFAULT 0,
      mode_of_payment TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received',
      date_received TEXT,
      date_collected TEXT,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    `CREATE TABLE IF NOT EXISTS debts (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_contact TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount_owed DOUBLE PRECISION NOT NULL DEFAULT 0,
      amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
      date_incurred TEXT NOT NULL,
      due_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ${NOW_TEXT}
    )`,
    // Login sessions live in the database too, so staff stay logged in across server restarts.
    `CREATE TABLE IF NOT EXISTS "session" (
      sid VARCHAR PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_session_expire ON "session"(expire)`,
    `INSERT INTO settings (key, value) VALUES ('default_vat_rate', '0') ON CONFLICT (key) DO NOTHING`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }

  // Supabase exposes tables in the "public" schema through its own public API.
  // Turning on Row Level Security with no policies blocks that route completely.
  // This server connects as the table owner, which is not affected by RLS.
  const tables = ['items', 'activity', 'services', 'staff_users', 'sales', 'sale_items', 'settings', 'service_jobs', 'debts', 'session'];
  for (const table of tables) {
    await pool.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  }
};

module.exports = db;
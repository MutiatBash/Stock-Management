require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12, sameSite: 'lax' }, // 12 hours
  })
);

function getDefaultVatRate() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'default_vat_rate'").get();
  return row ? parseFloat(row.value) || 0 : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function paginate(array, page, pageSize = 10) {
  const totalItems = array.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { items: array.slice(start, start + pageSize), currentPage, totalPages, totalItems };
}

// ---------- Auth ----------
function requireLogin(req, res, next) {
  if (req.session.role) return next();
  res.status(401).json({ error: 'Please log in.' });
}

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Only an admin can do that.' });
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const validAdminUser = process.env.ADMIN_USER || 'admin';
  const validAdminPass = process.env.ADMIN_PASSWORD || 'changeme123';

  if (username === validAdminUser && password === validAdminPass) {
    req.session.role = 'admin';
    req.session.name = 'Admin';
    return res.json({ user: { name: 'Admin', role: 'admin' } });
  }

  const staffUser = db.prepare('SELECT * FROM staff_users WHERE username = ?').get(username);
  if (staffUser && bcrypt.compareSync(password || '', staffUser.password_hash)) {
    req.session.role = 'staff';
    req.session.name = staffUser.name;
    req.session.staffId = staffUser.id;
    return res.json({ user: { name: staffUser.name, role: 'staff' } });
  }

  res.status(401).json({ error: 'Wrong username or password. Please try again.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.role) return res.status(401).json({ user: null });
  const row = db.prepare('SELECT COUNT(*) c FROM items WHERE quantity <= low_stock_level').get();
  res.json({
    user: { name: req.session.name, role: req.session.role },
    lowStockCount: row ? row.c : 0,
  });
});

// =====================================================================
// NEW SALE / SALES
// =====================================================================
app.get('/api/sale-options', requireLogin, (req, res) => {
  const products = db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all();
  const services = db.prepare('SELECT * FROM services ORDER BY name COLLATE NOCASE').all();
  const recentSales =
    req.session.role === 'admin'
      ? db.prepare('SELECT * FROM sales ORDER BY id DESC LIMIT 8').all()
      : db.prepare('SELECT * FROM sales WHERE created_by_name = ? ORDER BY id DESC LIMIT 8').all(req.session.name);
  res.json({ products, services, recentSales });
});

app.post('/api/sales', requireLogin, (req, res) => {
  let { lines } = req.body; // [{ type, id, qty }]
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'Please add at least one product or service to the sale.' });
  }

  const resolved = [];
  for (const line of lines) {
    const id = parseInt(line.id, 10);
    const qty = Math.max(1, parseInt(line.qty, 10) || 1);
    if (!id) continue;

    if (line.type === 'product') {
      const product = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
      if (!product) continue;
      if (product.quantity < qty) {
        return res.status(400).json({
          error: `Cannot sell ${qty} of "${product.name}" — only ${product.quantity} left.`,
        });
      }
      resolved.push({
        type: 'product',
        id,
        name: product.name,
        unit_price: product.price,
        qty,
        vat_rate: product.vat_rate,
        cost_price: product.cost_price,
      });
    } else if (line.type === 'service') {
      const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
      if (!service) continue;
      resolved.push({
        type: 'service',
        id,
        name: service.name,
        unit_price: service.price,
        qty,
        vat_rate: service.vat_rate,
        cost_price: service.cost_price,
      });
    }
  }

  if (!resolved.length) {
    return res.status(400).json({ error: 'Please add at least one product or service to the sale.' });
  }

  let subtotal = 0;
  let vatTotal = 0;
  const computedLines = resolved.map((l) => {
    const lineTotal = l.unit_price * l.qty;
    const lineVat = lineTotal * (l.vat_rate / 100);
    subtotal += lineTotal;
    vatTotal += lineVat;
    return { ...l, lineTotal, lineVat };
  });
  const total = subtotal + vatTotal;

  const insertSale = db.prepare(
    `INSERT INTO sales (created_by_role, created_by_name, subtotal, vat_amount, total) VALUES (?, ?, ?, ?, ?)`
  );
  const insertSaleItem = db.prepare(
    `INSERT INTO sale_items (sale_id, item_type, item_id, name, unit_price, quantity, line_total, vat_rate, vat_amount, cost_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const decrementProduct = db.prepare('UPDATE items SET quantity = quantity - ? WHERE id = ?');
  const logActivity = db.prepare(
    'INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)'
  );

  const runSale = db.transaction(() => {
    const saleResult = insertSale.run(req.session.role, req.session.name, subtotal, vatTotal, total);
    const saleId = saleResult.lastInsertRowid;
    for (const line of computedLines) {
      insertSaleItem.run(
        saleId, line.type, line.id, line.name, line.unit_price, line.qty,
        line.lineTotal, line.vat_rate, line.lineVat, line.cost_price
      );
      if (line.type === 'product') {
        decrementProduct.run(line.qty, line.id);
        logActivity.run(line.id, line.name, 'sold', line.qty);
      }
    }
    return saleId;
  });

  const saleId = runSale();
  res.status(201).json({ saleId });
});

function loadSale(req) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return null;
  const canView = req.session.role === 'admin' || sale.created_by_name === req.session.name;
  if (!canView) return 'forbidden';
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id);
  return { sale, items };
}

app.get('/api/sales/:id', requireLogin, (req, res) => {
  const result = loadSale(req);
  if (!result) return res.status(404).json({ error: 'Statement not found.' });
  if (result === 'forbidden') return res.status(403).json({ error: 'You can only view your own sales.' });
  res.json(result);
});

app.get('/api/sales/:id/download', requireLogin, (req, res) => {
  const result = loadSale(req);
  if (!result || result === 'forbidden') return res.status(404).send('Receipt not found.');
  const { sale, items } = result;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${sale.id}.pdf"`);

  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  doc.pipe(res);
  doc.fontSize(18).font('Helvetica-Bold').text('IntelMind', { align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#666').text('Computer Hardware & Accessories', { align: 'center' });
  doc.moveDown(1.2);
  doc.fillColor('#000').fontSize(10);
  doc.text(`Receipt #: ${sale.id}`);
  doc.text(`Date: ${sale.created_at}`);
  doc.text(`Served by: ${sale.created_by_name}`);
  doc.moveDown(0.8);

  const colX = { name: 40, qty: 230, price: 280, total: 350 };
  const tableTop = doc.y;
  doc.font('Helvetica-Bold');
  doc.text('Item', colX.name, tableTop);
  doc.text('Qty', colX.qty, tableTop);
  doc.text('Price', colX.price, tableTop);
  doc.text('Total', colX.total, tableTop);
  doc.moveDown(0.4);
  doc.font('Helvetica');
  doc.moveTo(40, doc.y).lineTo(410, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(0.3);

  items.forEach((item) => {
    const y = doc.y;
    doc.text(item.name, colX.name, y, { width: 180 });
    doc.text(String(item.quantity), colX.qty, y);
    doc.text(`N${item.unit_price.toLocaleString()}`, colX.price, y);
    doc.text(`N${item.line_total.toLocaleString()}`, colX.total, y);
    doc.moveDown(0.5);
  });

  doc.moveDown(0.4);
  doc.moveTo(40, doc.y).lineTo(410, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica');
  doc.text(`Subtotal: N${sale.subtotal.toLocaleString()}`, { align: 'right' });
  doc.text(`VAT: N${sale.vat_amount.toLocaleString()}`, { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(12);
  doc.text(`Total: N${sale.total.toLocaleString()}`, { align: 'right' });
  doc.moveDown(1.5);
  doc.fontSize(9).font('Helvetica').fillColor('#666').text('Thank you for shopping with IntelMind.', { align: 'center' });
  doc.end();
});

app.get('/api/statements', requireAdmin, (req, res) => {
  const { from, to, page } = req.query;
  let sql = 'SELECT * FROM sales';
  const params = [];
  const conditions = [];
  if (from) { conditions.push('date(created_at) >= date(?)'); params.push(from); }
  if (to) { conditions.push('date(created_at) <= date(?)'); params.push(to); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY id DESC';

  const allSales = db.prepare(sql).all(...params);
  const totals = {
    count: allSales.length,
    subtotal: allSales.reduce((s, x) => s + x.subtotal, 0),
    vat: allSales.reduce((s, x) => s + x.vat_amount, 0),
    total: allSales.reduce((s, x) => s + x.total, 0),
  };
  const paged = paginate(allSales, page, 15);
  res.json({ ...paged, totals });
});

// =====================================================================
// PRODUCTS
// =====================================================================
app.get('/api/products', requireLogin, (req, res) => {
  const activeCategory = (req.query.category || '').trim();
  const search = (req.query.search || '').trim();
  const allProducts = db.prepare('SELECT * FROM items ORDER BY name COLLATE NOCASE').all();
  const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  let filtered = allProducts;
  if (activeCategory) filtered = filtered.filter((p) => p.category === activeCategory);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }

  const summary = {
    totalProducts: allProducts.length,
    stockValue: allProducts.reduce((sum, p) => sum + p.cost_price * p.quantity, 0),
    lowStockCount: allProducts.filter((p) => p.quantity <= p.low_stock_level).length,
  };

  const paged = paginate(filtered, req.query.page, 10);
  res.json({ ...paged, categories, summary, defaultVatRate: getDefaultVatRate() });
});

app.get('/api/products/:id', requireLogin, (req, res) => {
  const product = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found.' });
  res.json(product);
});

app.post('/api/products', requireAdmin, (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please type a product name.' });

  const result = db.prepare(
    `INSERT INTO items (name, sku, description, category, image_url, quantity, low_stock_level, cost_price, price, vat_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name, (b.sku || '').trim(), (b.description || '').trim(), (b.category || '').trim(), (b.image_url || '').trim(),
    parseInt(b.quantity, 10) || 0, parseInt(b.low_stock_level, 10) || 5,
    parseFloat(b.cost_price) || 0, parseFloat(b.price) || 0, parseFloat(b.vat_rate) || 0
  );
  db.prepare('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)')
    .run(result.lastInsertRowid, name, 'created', parseInt(b.quantity, 10) || 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/products/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const product = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'That product was not found.' });

  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please type a product name.' });

  db.prepare(
    `UPDATE items SET name = ?, sku = ?, description = ?, category = ?, image_url = ?, low_stock_level = ?,
     cost_price = ?, price = ?, vat_rate = ? WHERE id = ?`
  ).run(
    name, (b.sku || '').trim(), (b.description || '').trim(), (b.category || '').trim(), (b.image_url || '').trim(),
    parseInt(b.low_stock_level, 10) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.price) || 0,
    parseFloat(b.vat_rate) || 0, id
  );
  res.json({ success: true });
});

app.post('/api/products/:id/add-stock', requireAdmin, (req, res) => {
  const id = req.params.id;
  const amount = Math.max(1, parseInt(req.body.amount, 10) || 1);
  const product = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'That product was not found.' });

  const newQty = product.quantity + amount;
  db.prepare('UPDATE items SET quantity = ? WHERE id = ?').run(newQty, id);
  db.prepare('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)')
    .run(id, product.name, 'added', amount);

  res.json({ newQuantity: newQty });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const product = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  db.prepare('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)')
    .run(id, product.name, 'removed_item', product.quantity);
  res.json({ success: true });
});

// =====================================================================
// SERVICES
// =====================================================================
app.get('/api/services', requireLogin, (req, res) => {
  const activeCategory = (req.query.category || '').trim();
  const search = (req.query.search || '').trim();
  const allServices = db.prepare('SELECT * FROM services ORDER BY name COLLATE NOCASE').all();
  const categories = [...new Set(allServices.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  let filtered = allServices;
  if (activeCategory) filtered = filtered.filter((s) => s.category === activeCategory);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }

  const paged = paginate(filtered, req.query.page, 10);
  res.json({ ...paged, categories, totalServices: allServices.length, defaultVatRate: getDefaultVatRate() });
});

app.get('/api/services/:id', requireLogin, (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) return res.status(404).json({ error: 'Not found.' });
  res.json(service);
});

app.post('/api/services', requireAdmin, (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please type a service name.' });
  const result = db.prepare(
    `INSERT INTO services (name, description, category, price, cost_price, vat_rate) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(name, (b.description || '').trim(), (b.category || '').trim(), parseFloat(b.price) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.vat_rate) || 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/services/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!service) return res.status(404).json({ error: 'Not found.' });
  const b = req.body;
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please type a service name.' });
  db.prepare('UPDATE services SET name = ?, description = ?, category = ?, price = ?, cost_price = ?, vat_rate = ? WHERE id = ?')
    .run(name, (b.description || '').trim(), (b.category || '').trim(), parseFloat(b.price) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.vat_rate) || 0, id);
  res.json({ success: true });
});

app.delete('/api/services/:id', requireAdmin, (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================================
// PROFIT & LOSS
// =====================================================================
app.get('/api/reports/profit-loss', requireAdmin, (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id`;
  const params = [];
  const conditions = [];
  if (from) { conditions.push('date(s.created_at) >= date(?)'); params.push(from); }
  if (to) { conditions.push('date(s.created_at) <= date(?)'); params.push(to); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

  const lineItems = db.prepare(sql).all(...params);
  const totals = lineItems.reduce((acc, li) => {
    acc.revenue += li.line_total;
    acc.cost += li.cost_price * li.quantity;
    acc.vat += li.vat_amount;
    return acc;
  }, { revenue: 0, cost: 0, vat: 0 });
  totals.profit = totals.revenue - totals.cost;

  const byItem = {};
  lineItems.forEach((li) => {
    const key = `${li.item_type}:${li.item_id}`;
    if (!byItem[key]) byItem[key] = { name: li.name, type: li.item_type, quantity: 0, revenue: 0, cost: 0 };
    byItem[key].quantity += li.quantity;
    byItem[key].revenue += li.line_total;
    byItem[key].cost += li.cost_price * li.quantity;
  });
  const breakdown = Object.values(byItem).map((b) => ({ ...b, profit: b.revenue - b.cost })).sort((a, b) => b.profit - a.profit);

  res.json({ totals, breakdown });
});

// =====================================================================
// SERVICE JOBS
// =====================================================================
app.get('/api/service-jobs', requireLogin, (req, res) => {
  const search = (req.query.search || '').trim();
  const status = (req.query.status || '').trim();
  let jobs = db.prepare('SELECT * FROM service_jobs ORDER BY id DESC').all();
  if (status) jobs = jobs.filter((j) => j.status === status);
  if (search) {
    const q = search.toLowerCase();
    jobs = jobs.filter((j) => j.customer_name.toLowerCase().includes(q) || j.customer_contact.toLowerCase().includes(q) || j.item.toLowerCase().includes(q));
  }
  const counts = {
    all: db.prepare('SELECT COUNT(*) c FROM service_jobs').get().c,
    received: db.prepare("SELECT COUNT(*) c FROM service_jobs WHERE status = 'received'").get().c,
    collected: db.prepare("SELECT COUNT(*) c FROM service_jobs WHERE status = 'collected'").get().c,
  };
  const paged = paginate(jobs, req.query.page, 10);
  res.json({ ...paged, counts });
});

app.get('/api/service-jobs/:id', requireLogin, (req, res) => {
  const job = db.prepare('SELECT * FROM service_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found.' });
  res.json(job);
});

app.post('/api/service-jobs', requireLogin, (req, res) => {
  const b = req.body;
  const customerName = (b.customer_name || '').trim();
  const item = (b.item || '').trim();
  if (!customerName || !item) return res.status(400).json({ error: 'Please fill in at least the customer name and item.' });

  const result = db.prepare(
    `INSERT INTO service_jobs (customer_name, customer_contact, item, item_condition, reason, amount_charged, mode_of_payment, status, date_received, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`
  ).run(
    customerName, (b.customer_contact || '').trim(), item, (b.item_condition || '').trim(), (b.reason || '').trim(),
    parseFloat(b.amount_charged) || 0, (b.mode_of_payment || '').trim(), b.date_received || today(), req.session.name
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/service-jobs/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM service_jobs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found.' });

  const b = req.body;
  const customerName = (b.customer_name || '').trim();
  const item = (b.item || '').trim();
  if (!customerName || !item) return res.status(400).json({ error: 'Please fill in at least the customer name and item.' });

  const dateCollected = b.date_collected || null;
  const status = dateCollected ? 'collected' : 'received';

  db.prepare(
    `UPDATE service_jobs SET customer_name = ?, customer_contact = ?, item = ?, item_condition = ?, reason = ?,
     amount_charged = ?, mode_of_payment = ?, date_received = ?, date_collected = ?, status = ? WHERE id = ?`
  ).run(
    customerName, (b.customer_contact || '').trim(), item, (b.item_condition || '').trim(), (b.reason || '').trim(),
    parseFloat(b.amount_charged) || 0, (b.mode_of_payment || '').trim(), b.date_received || null, dateCollected, status, id
  );
  res.json({ success: true });
});

app.post('/api/service-jobs/:id/mark-collected', requireLogin, (req, res) => {
  const job = db.prepare('SELECT * FROM service_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found.' });
  db.prepare("UPDATE service_jobs SET status = 'collected', date_collected = ? WHERE id = ?").run(today(), req.params.id);
  res.json({ success: true });
});

app.post('/api/service-jobs/:id/mark-received', requireLogin, (req, res) => {
  const job = db.prepare('SELECT * FROM service_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found.' });
  db.prepare("UPDATE service_jobs SET status = 'received', date_received = COALESCE(date_received, ?), date_collected = NULL WHERE id = ?").run(today(), req.params.id);
  res.json({ success: true });
});

app.delete('/api/service-jobs/:id', requireAdmin, (req, res) => {
  const job = db.prepare('SELECT * FROM service_jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM service_jobs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================================
// DEBTS
// =====================================================================
function debtStatus(debt) {
  const balance = debt.amount_owed - debt.amount_paid;
  if (balance <= 0) return 'paid';
  if (debt.amount_paid > 0) return 'partial';
  return 'owing';
}

app.get('/api/debts', requireLogin, (req, res) => {
  const search = (req.query.search || '').trim();
  const status = (req.query.status || '').trim();

  let debts = db.prepare('SELECT * FROM debts ORDER BY id DESC').all();
  debts = debts.map((d) => ({ ...d, balance: d.amount_owed - d.amount_paid, status: debtStatus(d) }));
  if (status) debts = debts.filter((d) => d.status === status);
  if (search) {
    const q = search.toLowerCase();
    debts = debts.filter((d) => d.customer_name.toLowerCase().includes(q) || d.customer_contact.toLowerCase().includes(q));
  }

  const allDebts = db.prepare('SELECT amount_owed, amount_paid FROM debts').all();
  const totals = {
    totalOwed: allDebts.reduce((s, d) => s + d.amount_owed, 0),
    totalPaid: allDebts.reduce((s, d) => s + d.amount_paid, 0),
  };
  totals.totalOutstanding = totals.totalOwed - totals.totalPaid;

  const paged = paginate(debts, req.query.page, 10);
  res.json({ ...paged, totals });
});

app.get('/api/debts/:id', requireLogin, (req, res) => {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
  if (!debt) return res.status(404).json({ error: 'Not found.' });
  res.json({ ...debt, balance: debt.amount_owed - debt.amount_paid, status: debtStatus(debt) });
});

app.post('/api/debts', requireLogin, (req, res) => {
  const b = req.body;
  const customerName = (b.customer_name || '').trim();
  const amountOwed = parseFloat(b.amount_owed) || 0;
  if (!customerName || amountOwed <= 0) {
    return res.status(400).json({ error: 'Please fill in the customer name and an amount owed greater than zero.' });
  }
  const result = db.prepare(
    `INSERT INTO debts (customer_name, customer_contact, description, amount_owed, amount_paid, date_incurred, due_date, notes, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    customerName, (b.customer_contact || '').trim(), (b.description || '').trim(), amountOwed,
    parseFloat(b.amount_paid) || 0, b.date_incurred || today(), b.due_date || null, (b.notes || '').trim(), req.session.name
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch('/api/debts/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found.' });

  const b = req.body;
  const customerName = (b.customer_name || '').trim();
  const amountOwed = parseFloat(b.amount_owed) || 0;
  if (!customerName || amountOwed <= 0) {
    return res.status(400).json({ error: 'Please fill in the customer name and an amount owed greater than zero.' });
  }

  db.prepare(
    `UPDATE debts SET customer_name = ?, customer_contact = ?, description = ?, amount_owed = ?,
     amount_paid = ?, date_incurred = ?, due_date = ?, notes = ? WHERE id = ?`
  ).run(
    customerName, (b.customer_contact || '').trim(), (b.description || '').trim(), amountOwed,
    parseFloat(b.amount_paid) || 0, b.date_incurred || existing.date_incurred, b.due_date || null, (b.notes || '').trim(), id
  );
  res.json({ success: true });
});

app.post('/api/debts/:id/record-payment', requireLogin, (req, res) => {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
  if (!debt) return res.status(404).json({ error: 'Not found.' });
  const amount = Math.max(0, parseFloat(req.body.amount) || 0);
  const newPaid = Math.min(debt.amount_owed, debt.amount_paid + amount);
  db.prepare('UPDATE debts SET amount_paid = ? WHERE id = ?').run(newPaid, req.params.id);
  res.json({ success: true, newPaid });
});

app.delete('/api/debts/:id', requireAdmin, (req, res) => {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(req.params.id);
  if (!debt) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM debts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================================
// ADMIN: staff logins
// =====================================================================
app.get('/api/staff', requireAdmin, (req, res) => {
  const staff = db.prepare('SELECT id, name, username, created_at FROM staff_users ORDER BY name').all();
  res.json({ staff });
});

app.post('/api/staff', requireAdmin, (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  const username = (b.username || '').trim().toLowerCase();
  const password = b.password || '';
  if (!name || !username || !password) return res.status(400).json({ error: 'Please fill in name, username, and password.' });

  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO staff_users (name, username, password_hash) VALUES (?, ?, ?)').run(name, username, passwordHash);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    const msg = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'That username is already taken.' : 'Could not create login.';
    res.status(400).json({ error: msg });
  }
});

app.delete('/api/staff/:id', requireAdmin, (req, res) => {
  const staffUser = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(req.params.id);
  if (!staffUser) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM staff_users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// =====================================================================
// ADMIN: settings
// =====================================================================
app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({ defaultVatRate: getDefaultVatRate() });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const vatRate = parseFloat(req.body.default_vat_rate);
  const value = isNaN(vatRate) || vatRate < 0 ? '0' : String(vatRate);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'default_vat_rate'").run(value);
  res.json({ defaultVatRate: parseFloat(value) });
});

// =====================================================================
// Serve the React build in production (single-project deployment)
// =====================================================================
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Run "npm run build" in the client folder first.');
  });
});

app.listen(PORT, () => {
  console.log(`IntelMind API + app running at http://localhost:${PORT}`);
});

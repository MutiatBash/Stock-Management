require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Render sits behind a proxy
app.use(express.json());
app.use(
  session({
    store: new pgSession({ pool: db.pool }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12, sameSite: 'lax', secure: 'auto' }, // 12 hours
  })
);

// ---------- Helpers ----------
// Express 4 doesn't catch errors from async handlers, so wrap each one.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
const notFound = () => httpError(404, 'Not found.');

async function getDefaultVatRate() {
  const row = await db.get("SELECT value FROM settings WHERE key = 'default_vat_rate'");
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

// Any route with an :id only accepts whole numbers
app.param('id', (req, res, next, value) => {
  if (/^\d+$/.test(value)) return next();
  res.status(404).json({ error: 'Not found.' });
});

// ---------- Auth ----------
function requireLogin(req, res, next) {
  if (req.session.role) return next();
  res.status(401).json({ error: 'Please log in.' });
}

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Only an admin can do that.' });
}

app.post(
  '/api/login',
  h(async (req, res) => {
    const { username, password } = req.body;
    const validAdminUser = process.env.ADMIN_USER || 'admin';
    const validAdminPass = process.env.ADMIN_PASSWORD || 'changeme123';

    if (username === validAdminUser && password === validAdminPass) {
      req.session.role = 'admin';
      req.session.name = 'Admin';
      return res.json({ user: { name: 'Admin', role: 'admin' } });
    }

    const staffUser = await db.get('SELECT * FROM staff_users WHERE username = ?', [String(username || '').toLowerCase()]);
    if (staffUser && bcrypt.compareSync(password || '', staffUser.password_hash)) {
      req.session.role = 'staff';
      req.session.name = staffUser.name;
      req.session.staffId = staffUser.id;
      return res.json({ user: { name: staffUser.name, role: 'staff' } });
    }

    res.status(401).json({ error: 'Wrong username or password. Please try again.' });
  })
);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get(
  '/api/me',
  h(async (req, res) => {
    if (!req.session.role) return res.status(401).json({ user: null });
    const row = await db.get('SELECT COUNT(*)::int AS c FROM items WHERE quantity <= low_stock_level');
    res.json({
      user: { name: req.session.name, role: req.session.role },
      lowStockCount: row ? row.c : 0,
    });
  })
);

// =====================================================================
// NEW SALE / SALES
// =====================================================================
app.get(
  '/api/sale-options',
  requireLogin,
  h(async (req, res) => {
    const products = await db.all('SELECT * FROM items ORDER BY LOWER(name)');
    const services = await db.all('SELECT * FROM services ORDER BY LOWER(name)');
    const recentSales =
      req.session.role === 'admin'
        ? await db.all('SELECT * FROM sales ORDER BY id DESC LIMIT 8')
        : await db.all('SELECT * FROM sales WHERE created_by_name = ? ORDER BY id DESC LIMIT 8', [req.session.name]);
    res.json({ products, services, recentSales });
  })
);

app.post(
  '/api/sales',
  requireLogin,
  h(async (req, res) => {
    const { lines } = req.body;
    if (!Array.isArray(lines) || !lines.length) {
      throw httpError(400, 'Please add at least one product or service to the sale.');
    }

    // Everything happens in one transaction, with stock rows locked while we check them,
    // so two people selling the same product at once can't oversell it.
    const saleId = await db.transaction(async (tx) => {
      const resolved = [];
      for (const line of lines) {
        const id = parseInt(line.id, 10);
        const qty = Math.max(1, parseInt(line.qty, 10) || 1);
        if (!id) continue;

        if (line.type === 'product') {
          const product = await tx.get('SELECT * FROM items WHERE id = ? FOR UPDATE', [id]);
          if (!product) continue;
          if (product.quantity < qty) {
            throw httpError(400, `Cannot sell ${qty} of "${product.name}" — only ${product.quantity} left.`);
          }
          resolved.push({
            type: 'product', id, name: product.name, unit_price: product.price, qty,
            vat_rate: product.vat_rate, cost_price: product.cost_price,
          });
        } else if (line.type === 'service') {
          const service = await tx.get('SELECT * FROM services WHERE id = ?', [id]);
          if (!service) continue;
          resolved.push({
            type: 'service', id, name: service.name, unit_price: service.price, qty,
            vat_rate: service.vat_rate, cost_price: service.cost_price,
          });
        }
      }

      if (!resolved.length) throw httpError(400, 'Please add at least one product or service to the sale.');

      let subtotal = 0;
      let vatTotal = 0;
      const computed = resolved.map((l) => {
        const lineTotal = l.unit_price * l.qty;
        const lineVat = lineTotal * (l.vat_rate / 100);
        subtotal += lineTotal;
        vatTotal += lineVat;
        return { ...l, lineTotal, lineVat };
      });
      const total = subtotal + vatTotal;

      const sale = await tx.get(
        `INSERT INTO sales (created_by_role, created_by_name, subtotal, vat_amount, total)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [req.session.role, req.session.name, subtotal, vatTotal, total]
      );

      for (const line of computed) {
        await tx.run(
          `INSERT INTO sale_items (sale_id, item_type, item_id, name, unit_price, quantity, line_total, vat_rate, vat_amount, cost_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale.id, line.type, line.id, line.name, line.unit_price, line.qty, line.lineTotal, line.vat_rate, line.lineVat, line.cost_price]
        );
        if (line.type === 'product') {
          await tx.run('UPDATE items SET quantity = quantity - ? WHERE id = ?', [line.qty, line.id]);
          await tx.run('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)', [
            line.id, line.name, 'sold', line.qty,
          ]);
        }
      }
      return sale.id;
    });

    res.status(201).json({ saleId });
  })
);

async function loadSale(req) {
  const sale = await db.get('SELECT * FROM sales WHERE id = ?', [req.params.id]);
  if (!sale) return null;
  const canView = req.session.role === 'admin' || sale.created_by_name === req.session.name;
  if (!canView) return 'forbidden';
  const items = await db.all('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [sale.id]);
  return { sale, items };
}

app.get(
  '/api/sales/:id',
  requireLogin,
  h(async (req, res) => {
    const result = await loadSale(req);
    if (!result) throw httpError(404, 'Statement not found.');
    if (result === 'forbidden') throw httpError(403, 'You can only view your own sales.');
    res.json(result);
  })
);

app.get(
  '/api/sales/:id/download',
  requireLogin,
  h(async (req, res) => {
    const result = await loadSale(req);
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
  })
);

app.get(
  '/api/statements',
  requireAdmin,
  h(async (req, res) => {
    const { from, to, page } = req.query;
    const conditions = [];
    const params = [];
    if (from) { conditions.push('LEFT(created_at, 10) >= ?'); params.push(from); }
    if (to) { conditions.push('LEFT(created_at, 10) <= ?'); params.push(to); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const allSales = await db.all(`SELECT * FROM sales${where} ORDER BY id DESC`, params);
    const totals = {
      count: allSales.length,
      subtotal: allSales.reduce((s, x) => s + x.subtotal, 0),
      vat: allSales.reduce((s, x) => s + x.vat_amount, 0),
      total: allSales.reduce((s, x) => s + x.total, 0),
    };
    res.json({ ...paginate(allSales, page, 15), totals });
  })
);

// =====================================================================
// PRODUCTS
// =====================================================================
app.get(
  '/api/products',
  requireLogin,
  h(async (req, res) => {
    const activeCategory = (req.query.category || '').trim();
    const search = (req.query.search || '').trim();
    const allProducts = await db.all('SELECT * FROM items ORDER BY LOWER(name)');
    const categories = [...new Set(allProducts.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    let filtered = allProducts;
    if (activeCategory) filtered = filtered.filter((p) => p.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }

    const summary = {
      totalProducts: allProducts.length,
      stockValue: allProducts.reduce((sum, p) => sum + p.cost_price * p.quantity, 0),
      lowStockCount: allProducts.filter((p) => p.quantity <= p.low_stock_level).length,
    };

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 25, 1),
      100
    );

    res.json({
      ...paginate(filtered, req.query.page, limit),
      categories,
      summary,
      defaultVatRate: await getDefaultVatRate(),
    });
  })
);

app.get(
  '/api/products/:id',
  requireLogin,
  h(async (req, res) => {
    const product = await db.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!product) throw notFound();
    res.json(product);
  })
);

app.post(
  '/api/products',
  requireAdmin,
  h(async (req, res) => {
    const b = req.body;
    const name = (b.name || '').trim();
    if (!name) throw httpError(400, 'Please type a product name.');
    const quantity = parseInt(b.quantity, 10) || 0;

    const row = await db.get(
      `INSERT INTO items (name, sku, description, category, image_url, quantity, low_stock_level, cost_price, price, vat_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        name, (b.sku || '').trim(), (b.description || '').trim(), (b.category || '').trim(), (b.image_url || '').trim(),
        quantity, parseInt(b.low_stock_level, 10) || 5,
        parseFloat(b.cost_price) || 0, parseFloat(b.price) || 0, parseFloat(b.vat_rate) || 0,
      ]
    );
    await db.run('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)', [row.id, name, 'created', quantity]);
    res.status(201).json({ id: row.id });
  })
);

app.patch(
  '/api/products/:id',
  requireAdmin,
  h(async (req, res) => {
    const existing = await db.get('SELECT id FROM items WHERE id = ?', [req.params.id]);
    if (!existing) throw httpError(404, 'That product was not found.');
    const b = req.body;
    const name = (b.name || '').trim();
    if (!name) throw httpError(400, 'Please type a product name.');

    await db.run(
      `UPDATE items SET name = ?, sku = ?, description = ?, category = ?, image_url = ?, low_stock_level = ?,
       cost_price = ?, price = ?, vat_rate = ? WHERE id = ?`,
      [
        name, (b.sku || '').trim(), (b.description || '').trim(), (b.category || '').trim(), (b.image_url || '').trim(),
        parseInt(b.low_stock_level, 10) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.price) || 0,
        parseFloat(b.vat_rate) || 0, req.params.id,
      ]
    );
    res.json({ success: true });
  })
);

app.post(
  '/api/products/:id/add-stock',
  requireAdmin,
  h(async (req, res) => {
    const amount = Math.max(1, parseInt(req.body.amount, 10) || 1);
    const row = await db.get('UPDATE items SET quantity = quantity + ? WHERE id = ? RETURNING quantity, name', [amount, req.params.id]);
    if (!row) throw httpError(404, 'That product was not found.');
    await db.run('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)', [
      req.params.id, row.name, 'added', amount,
    ]);
    res.json({ newQuantity: row.quantity });
  })
);

// Remove stock
app.post(
  '/api/products/:id/remove-stock',
  requireAdmin,
  h(async (req, res) => {
    const amount = Math.max(1, parseInt(req.body.amount, 10) || 1);

    const row = await db.get(
      `UPDATE items
       SET quantity = quantity - ?
       WHERE id = ? AND quantity >= ?
       RETURNING quantity, name`,
      [amount, req.params.id, amount]
    );

    if (!row) {
      const product = await db.get(
        'SELECT id, quantity FROM items WHERE id = ?',
        [req.params.id]
      );

      if (!product) {
        throw httpError(404, 'That product was not found.');
      }

      throw httpError(400, 'There is not enough stock to remove that amount.');
    }

    await db.run(
      'INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)',
      [
        req.params.id,
        row.name,
        'removed',
        amount,
      ]
    );

    res.json({ newQuantity: row.quantity });
  })
);

app.delete(
  '/api/products/:id',
  requireAdmin,
  h(async (req, res) => {
    const product = await db.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!product) throw notFound();
    await db.run('DELETE FROM items WHERE id = ?', [req.params.id]);
    await db.run('INSERT INTO activity (item_id, item_name, action, change_amount) VALUES (?, ?, ?, ?)', [
      product.id, product.name, 'removed_item', product.quantity,
    ]);
    res.json({ success: true });
  })
);

// =====================================================================
// SERVICES
// =====================================================================
app.get(
  '/api/services',
  requireLogin,
  h(async (req, res) => {
    const activeCategory = (req.query.category || '').trim();
    const search = (req.query.search || '').trim();
    const allServices = await db.all('SELECT * FROM services ORDER BY LOWER(name)');
    const categories = [...new Set(allServices.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    let filtered = allServices;
    if (activeCategory) filtered = filtered.filter((s) => s.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }

    res.json({
      ...paginate(filtered, req.query.page, 10),
      categories,
      totalServices: allServices.length,
      defaultVatRate: await getDefaultVatRate(),
    });
  })
);

app.get(
  '/api/services/:id',
  requireLogin,
  h(async (req, res) => {
    const service = await db.get('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (!service) throw notFound();
    res.json(service);
  })
);

app.post(
  '/api/services',
  requireAdmin,
  h(async (req, res) => {
    const b = req.body;
    const name = (b.name || '').trim();
    if (!name) throw httpError(400, 'Please type a service name.');
    const row = await db.get(
      `INSERT INTO services (name, description, category, price, cost_price, vat_rate) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, (b.description || '').trim(), (b.category || '').trim(), parseFloat(b.price) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.vat_rate) || 0]
    );
    res.status(201).json({ id: row.id });
  })
);

app.patch(
  '/api/services/:id',
  requireAdmin,
  h(async (req, res) => {
    const existing = await db.get('SELECT id FROM services WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound();
    const b = req.body;
    const name = (b.name || '').trim();
    if (!name) throw httpError(400, 'Please type a service name.');
    await db.run(
      'UPDATE services SET name = ?, description = ?, category = ?, price = ?, cost_price = ?, vat_rate = ? WHERE id = ?',
      [name, (b.description || '').trim(), (b.category || '').trim(), parseFloat(b.price) || 0, parseFloat(b.cost_price) || 0, parseFloat(b.vat_rate) || 0, req.params.id]
    );
    res.json({ success: true });
  })
);

app.delete(
  '/api/services/:id',
  requireAdmin,
  h(async (req, res) => {
    const result = await db.run('DELETE FROM services WHERE id = ?', [req.params.id]);
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

// =====================================================================
// PROFIT & LOSS
// =====================================================================
app.get(
  '/api/reports/profit-loss',
  requireAdmin,
  h(async (req, res) => {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    if (from) { conditions.push('LEFT(s.created_at, 10) >= ?'); params.push(from); }
    if (to) { conditions.push('LEFT(s.created_at, 10) <= ?'); params.push(to); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const lineItems = await db.all(`SELECT si.* FROM sale_items si JOIN sales s ON s.id = si.sale_id${where}`, params);

    const totals = lineItems.reduce(
      (acc, li) => {
        acc.revenue += li.line_total;
        acc.cost += li.cost_price * li.quantity;
        acc.vat += li.vat_amount;
        return acc;
      },
      { revenue: 0, cost: 0, vat: 0 }
    );
    totals.profit = totals.revenue - totals.cost;

    const byItem = {};
    lineItems.forEach((li) => {
      const key = `${li.item_type}:${li.item_id}`;
      if (!byItem[key]) byItem[key] = { name: li.name, type: li.item_type, quantity: 0, revenue: 0, cost: 0 };
      byItem[key].quantity += li.quantity;
      byItem[key].revenue += li.line_total;
      byItem[key].cost += li.cost_price * li.quantity;
    });
    const breakdown = Object.values(byItem)
      .map((b) => ({ ...b, profit: b.revenue - b.cost }))
      .sort((a, b) => b.profit - a.profit);

    res.json({ totals, breakdown });
  })
);

// =====================================================================
// SERVICE JOBS
// =====================================================================
app.get(
  '/api/service-jobs',
  requireLogin,
  h(async (req, res) => {
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    let jobs = await db.all('SELECT * FROM service_jobs ORDER BY id DESC');
    const counts = {
      all: jobs.length,
      received: jobs.filter((j) => j.status === 'received').length,
      collected: jobs.filter((j) => j.status === 'collected').length,
    };
    if (status) jobs = jobs.filter((j) => j.status === status);
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(
        (j) => j.customer_name.toLowerCase().includes(q) || j.customer_contact.toLowerCase().includes(q) || j.item.toLowerCase().includes(q)
      );
    }
    res.json({ ...paginate(jobs, req.query.page, 10), counts });
  })
);

app.get(
  '/api/service-jobs/:id',
  requireLogin,
  h(async (req, res) => {
    const job = await db.get('SELECT * FROM service_jobs WHERE id = ?', [req.params.id]);
    if (!job) throw notFound();
    res.json(job);
  })
);

app.post(
  '/api/service-jobs',
  requireLogin,
  h(async (req, res) => {
    const b = req.body;
    const customerName = (b.customer_name || '').trim();
    const item = (b.item || '').trim();
    if (!customerName || !item) throw httpError(400, 'Please fill in at least the customer name and item.');

    const row = await db.get(
      `INSERT INTO service_jobs (customer_name, customer_contact, item, item_condition, reason, amount_charged, mode_of_payment, status, date_received, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?) RETURNING id`,
      [
        customerName, (b.customer_contact || '').trim(), item, (b.item_condition || '').trim(), (b.reason || '').trim(),
        parseFloat(b.amount_charged) || 0, (b.mode_of_payment || '').trim(), b.date_received || today(), req.session.name,
      ]
    );
    res.status(201).json({ id: row.id });
  })
);

app.patch(
  '/api/service-jobs/:id',
  requireLogin,
  h(async (req, res) => {
    const existing = await db.get('SELECT id FROM service_jobs WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound();

    const b = req.body;
    const customerName = (b.customer_name || '').trim();
    const item = (b.item || '').trim();
    if (!customerName || !item) throw httpError(400, 'Please fill in at least the customer name and item.');

    const dateCollected = b.date_collected || null;
    const status = dateCollected ? 'collected' : 'received';

    await db.run(
      `UPDATE service_jobs SET customer_name = ?, customer_contact = ?, item = ?, item_condition = ?, reason = ?,
       amount_charged = ?, mode_of_payment = ?, date_received = ?, date_collected = ?, status = ? WHERE id = ?`,
      [
        customerName, (b.customer_contact || '').trim(), item, (b.item_condition || '').trim(), (b.reason || '').trim(),
        parseFloat(b.amount_charged) || 0, (b.mode_of_payment || '').trim(), b.date_received || null, dateCollected, status, req.params.id,
      ]
    );
    res.json({ success: true });
  })
);

app.post(
  '/api/service-jobs/:id/mark-collected',
  requireLogin,
  h(async (req, res) => {
    const result = await db.run("UPDATE service_jobs SET status = 'collected', date_collected = ? WHERE id = ?", [today(), req.params.id]);
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

app.post(
  '/api/service-jobs/:id/mark-received',
  requireLogin,
  h(async (req, res) => {
    const result = await db.run(
      "UPDATE service_jobs SET status = 'received', date_received = COALESCE(date_received, ?), date_collected = NULL WHERE id = ?",
      [today(), req.params.id]
    );
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

app.delete(
  '/api/service-jobs/:id',
  requireAdmin,
  h(async (req, res) => {
    const result = await db.run('DELETE FROM service_jobs WHERE id = ?', [req.params.id]);
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

// =====================================================================
// DEBTS
// =====================================================================
function debtStatus(debt) {
  const balance = debt.amount_owed - debt.amount_paid;
  if (balance <= 0) return 'paid';
  if (debt.amount_paid > 0) return 'partial';
  return 'owing';
}

app.get(
  '/api/debts',
  requireLogin,
  h(async (req, res) => {
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const everything = (await db.all('SELECT * FROM debts ORDER BY id DESC')).map((d) => ({
      ...d,
      balance: d.amount_owed - d.amount_paid,
      status: debtStatus(d),
    }));

    const totals = {
      totalOwed: everything.reduce((s, d) => s + d.amount_owed, 0),
      totalPaid: everything.reduce((s, d) => s + d.amount_paid, 0),
    };
    totals.totalOutstanding = totals.totalOwed - totals.totalPaid;

    let debts = everything;
    if (status) debts = debts.filter((d) => d.status === status);
    if (search) {
      const q = search.toLowerCase();
      debts = debts.filter((d) => d.customer_name.toLowerCase().includes(q) || d.customer_contact.toLowerCase().includes(q));
    }
    res.json({ ...paginate(debts, req.query.page, 10), totals });
  })
);

app.get(
  '/api/debts/:id',
  requireLogin,
  h(async (req, res) => {
    const debt = await db.get('SELECT * FROM debts WHERE id = ?', [req.params.id]);
    if (!debt) throw notFound();
    res.json({ ...debt, balance: debt.amount_owed - debt.amount_paid, status: debtStatus(debt) });
  })
);

app.post(
  '/api/debts',
  requireLogin,
  h(async (req, res) => {
    const b = req.body;
    const customerName = (b.customer_name || '').trim();
    const amountOwed = parseFloat(b.amount_owed) || 0;
    if (!customerName || amountOwed <= 0) {
      throw httpError(400, 'Please fill in the customer name and an amount owed greater than zero.');
    }
    const row = await db.get(
      `INSERT INTO debts (customer_name, customer_contact, description, amount_owed, amount_paid, date_incurred, due_date, notes, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        customerName, (b.customer_contact || '').trim(), (b.description || '').trim(), amountOwed,
        parseFloat(b.amount_paid) || 0, b.date_incurred || today(), b.due_date || null, (b.notes || '').trim(), req.session.name,
      ]
    );
    res.status(201).json({ id: row.id });
  })
);

app.patch(
  '/api/debts/:id',
  requireLogin,
  h(async (req, res) => {
    const existing = await db.get('SELECT * FROM debts WHERE id = ?', [req.params.id]);
    if (!existing) throw notFound();

    const b = req.body;
    const customerName = (b.customer_name || '').trim();
    const amountOwed = parseFloat(b.amount_owed) || 0;
    if (!customerName || amountOwed <= 0) {
      throw httpError(400, 'Please fill in the customer name and an amount owed greater than zero.');
    }

    await db.run(
      `UPDATE debts SET customer_name = ?, customer_contact = ?, description = ?, amount_owed = ?,
       amount_paid = ?, date_incurred = ?, due_date = ?, notes = ? WHERE id = ?`,
      [
        customerName, (b.customer_contact || '').trim(), (b.description || '').trim(), amountOwed,
        parseFloat(b.amount_paid) || 0, b.date_incurred || existing.date_incurred, b.due_date || null, (b.notes || '').trim(), req.params.id,
      ]
    );
    res.json({ success: true });
  })
);

app.post(
  '/api/debts/:id/record-payment',
  requireLogin,
  h(async (req, res) => {
    const amount = Math.max(0, parseFloat(req.body.amount) || 0);
    const row = await db.get(
      'UPDATE debts SET amount_paid = LEAST(amount_owed, amount_paid + ?) WHERE id = ? RETURNING amount_paid',
      [amount, req.params.id]
    );
    if (!row) throw notFound();
    res.json({ success: true, newPaid: row.amount_paid });
  })
);

app.delete(
  '/api/debts/:id',
  requireAdmin,
  h(async (req, res) => {
    const result = await db.run('DELETE FROM debts WHERE id = ?', [req.params.id]);
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

// =====================================================================
// ADMIN: staff logins
// =====================================================================
app.get(
  '/api/staff',
  requireAdmin,
  h(async (req, res) => {
    const staff = await db.all('SELECT id, name, username, created_at FROM staff_users ORDER BY LOWER(name)');
    res.json({ staff });
  })
);

app.post(
  '/api/staff',
  requireAdmin,
  h(async (req, res) => {
    const b = req.body;
    const name = (b.name || '').trim();
    const username = (b.username || '').trim().toLowerCase();
    const password = b.password || '';
    if (!name || !username || !password) throw httpError(400, 'Please fill in name, username, and password.');

    try {
      const row = await db.get('INSERT INTO staff_users (name, username, password_hash) VALUES (?, ?, ?) RETURNING id', [
        name, username, bcrypt.hashSync(password, 10),
      ]);
      res.status(201).json({ id: row.id });
    } catch (err) {
      if (err.code === '23505') throw httpError(400, 'That username is already taken.');
      throw err;
    }
  })
);

app.delete(
  '/api/staff/:id',
  requireAdmin,
  h(async (req, res) => {
    const result = await db.run('DELETE FROM staff_users WHERE id = ?', [req.params.id]);
    if (!result.rowCount) throw notFound();
    res.json({ success: true });
  })
);

// =====================================================================
// ADMIN: settings + data export
// =====================================================================
app.get(
  '/api/settings',
  requireAdmin,
  h(async (req, res) => {
    res.json({ defaultVatRate: await getDefaultVatRate() });
  })
);

app.post(
  '/api/settings',
  requireAdmin,
  h(async (req, res) => {
    const vatRate = parseFloat(req.body.default_vat_rate);
    const value = isNaN(vatRate) || vatRate < 0 ? '0' : String(vatRate);
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('default_vat_rate', ?)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [value]
    );
    res.json({ defaultVatRate: parseFloat(value) });
  })
);

// Downloads all business data as one JSON file (staff passwords are not included).
app.get(
  '/api/backup',
  requireAdmin,
  h(async (req, res) => {
    const queries = {
      products: 'SELECT * FROM items ORDER BY id',
      services: 'SELECT * FROM services ORDER BY id',
      sales: 'SELECT * FROM sales ORDER BY id',
      sale_items: 'SELECT * FROM sale_items ORDER BY id',
      service_records: 'SELECT * FROM service_jobs ORDER BY id',
      debts: 'SELECT * FROM debts ORDER BY id',
      stock_activity: 'SELECT * FROM activity ORDER BY id',
      settings: 'SELECT * FROM settings ORDER BY key',
      staff: 'SELECT id, name, username, created_at FROM staff_users ORDER BY id',
    };
    const out = { app: 'IntelMind', exported_at: new Date().toISOString() };
    for (const [name, sql] of Object.entries(queries)) {
      out[name] = await db.all(sql);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="intelmind-backup-${stamp}.json"`);
    res.send(JSON.stringify(out, null, 2));
  })
);

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

// Anything that threw ends up here
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.status ? err.message : 'Something went wrong on the server. Please try again.',
  });
});

db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`IntelMind running on port ${PORT} (connected to database)`));
  })
  .catch((err) => {
    console.error('Could not connect to or set up the database:', err.message);
    process.exit(1);
  });
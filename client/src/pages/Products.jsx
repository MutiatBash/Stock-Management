import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import CategoryPicker from '../components/CategoryPicker';
import Pagination from '../components/Pagination';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const CATEGORY_OPTIONS = [
  'Charger', 'Cable', 'Adapter', 'Pouch', 'Laptop Bag', 'Screen Guard', 'Keyboard',
  'Mouse', 'Headset', 'Speaker', 'Battery', 'Memory (RAM)', 'Storage (SSD/HDD)',
  'Cooling Pad', 'Flash Drive', 'Other Accessory',
];
const CATEGORY_ICONS = {
  Charger: '🔌', Cable: '🔗', Adapter: '🔌', Pouch: '👝', 'Laptop Bag': '🎒',
  'Screen Guard': '🛡️', Keyboard: '⌨️', Mouse: '🖱️', Headset: '🎧', Speaker: '🔊',
  Battery: '🔋', 'Memory (RAM)': '💾', 'Storage (SSD/HDD)': '💽', 'Cooling Pad': '🌬️', 'Flash Drive': '💿',
};

const emptyForm = { name: '', sku: '', category: '', description: '', image_url: '', quantity: 0, low_stock_level: 5, cost_price: 0, price: 0, vat_rate: 0 };

export default function Products() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], categories: [], summary: {}, currentPage: 1, totalPages: 1, defaultVatRate: 0 });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const confirmDelete = useConfirmDelete();

  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const page = params.get('page') || '1';

  useEffect(() => {
    load();
  }, [search, category, page]);

  async function load() {
    const qs = new URLSearchParams({ search, category, page }).toString();
    const result = await api.get(`/products?${qs}`);
    setData(result);
    setForm((f) => (f === emptyForm ? { ...emptyForm, vat_rate: result.defaultVatRate } : f));
  }

  function updateParams(next) {
    const merged = { search, category, page: '1', ...next };
    const qs = {};
    Object.entries(merged).forEach(([k, v]) => v && (qs[k] = v));
    setParams(qs);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/products', form);
      setForm({ ...emptyForm, vat_rate: data.defaultVatRate });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addStock(id, amount) {
    await api.post(`/products/${id}/add-stock`, { amount });
    load();
  }

  function doDelete(product) {
    confirmDelete.request(`"${product.name}"`, async () => {
      await api.delete(`/products/${product.id}`);
      load();
    });
  }

  return (
    <Layout title="Products">
      <Alert type="error" message={error} />

      {user.role === 'admin' && (
        <section className="add-item-section">
          <div className="section-heading-row">
            <h2>Set Up a New Product</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ New Product'}
            </button>
          </div>
          {showForm && (
            <form onSubmit={handleAdd} className="add-item-form">
              <div className="field">
                <label>Product name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Type-C Fast Charger 65W"
                  required
                />
              </div>
              <div className="field field-small">
                <label>SKU / code (optional)</label>
                <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. TS38790" />
              </div>
              <CategoryPicker value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} />
              <div className="field field-wide">
                <label>Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Any extra details" />
              </div>
              <div className="field field-small">
                <label>Image URL (optional)</label>
                <input type="text" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Link to a photo" />
              </div>
              <div className="field field-small">
                <label>How many do you have now?</label>
                <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </div>
              <div className="field field-small">
                <label>Warn me when stock drops to</label>
                <input type="number" min="0" value={form.low_stock_level} onChange={(e) => setForm({ ...form, low_stock_level: e.target.value })} required />
              </div>
              <div className="field field-small">
                <label>Cost price (₦)</label>
                <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div className="field field-small">
                <label>Selling price (₦)</label>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="field field-small">
                <label>VAT rate (%)</label>
                <input type="number" min="0" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-primary">Add Product</button>
            </form>
          )}
        </section>
      )}

      {data.summary.totalProducts > 0 && (
        <section className="summary-bar">
          <div className="summary-stat">
            <span className="summary-number">{data.summary.totalProducts}</span>
            <span className="summary-label">products tracked</span>
          </div>
          {user.role === 'admin' && (
            <div className="summary-stat">
              <span className="summary-number">₦{data.summary.stockValue.toLocaleString()}</span>
              <span className="summary-label">stock value (at cost)</span>
            </div>
          )}
          <div className="summary-stat">
            <span className="summary-number">{data.summary.lowStockCount}</span>
            <span className="summary-label">running low</span>
          </div>
        </section>
      )}

      <div className="dashboard-card">
        <div className="dashboard-toolbar">
          <form
            className="toolbar-search"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ search: searchInput });
            }}
          >
            <span className="toolbar-search-icon">🔍</span>
            <input type="text" placeholder="Search products, SKU…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </form>
          <div className="toolbar-actions">
            <span className="muted">{data.totalItems ?? 0} total</span>
          </div>
        </div>

        {(category || search) && (
          <div className="applied-filters">
            {category && (
              <span className="filter-chip">
                Category: {category}{' '}
                <a onClick={() => updateParams({ category: '' })}>✕</a>
              </span>
            )}
            {search && (
              <span className="filter-chip">
                Search: "{search}"{' '}
                <a
                  onClick={() => {
                    setSearchInput('');
                    updateParams({ search: '' });
                  }}
                >
                  ✕
                </a>
              </span>
            )}
          </div>
        )}

        {data.categories?.length > 0 && (
          <div className="category-filter">
            <a className={`filter-pill ${!category ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ category: '' })}>
              All
            </a>
            {data.categories.map((cat) => (
              <a key={cat} className={`filter-pill ${category === cat ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ category: cat })}>
                {cat}
              </a>
            ))}
          </div>
        )}

        {data.items.length === 0 ? (
          <div className="empty-state">
            {search || category ? (
              <>
                <p>No products match your search.</p>
                <p>
                  <a onClick={() => { setSearchInput(''); setParams({}); }}>Show all products</a>
                </p>
              </>
            ) : (
              <p>No products have been set up yet.</p>
            )}
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table dashboard-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>SKU</th>
                    <th>Stock</th>
                    {user.role === 'admin' && <th>Cost</th>}
                    <th>Price</th>
                    <th>VAT</th>
                    <th>Status</th>
                    {user.role === 'admin' && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => {
                    const isLow = p.quantity <= p.low_stock_level;
                    const outOfStock = p.quantity <= 0;
                    return (
                      <tr key={p.id}>
                        <td className="cell-thumb">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="thumb-img" />
                          ) : (
                            <span className="thumb-fallback">{CATEGORY_ICONS[p.category] || '📦'}</span>
                          )}
                        </td>
                        <td className="cell-name">
                          {p.name}
                          {p.description && <div className="cell-subtext">{p.description}</div>}
                        </td>
                        <td>{p.category ? <span className="category-badge">{p.category}</span> : '—'}</td>
                        <td className="text-muted">{p.sku || '—'}</td>
                        <td className={isLow ? 'text-low' : ''}>{p.quantity}</td>
                        {user.role === 'admin' && <td>₦{p.cost_price.toLocaleString()}</td>}
                        <td>₦{p.price.toLocaleString()}</td>
                        <td>{p.vat_rate}%</td>
                        <td>
                          {outOfStock ? (
                            <span className="status-pill status-pill-red">Out of Stock</span>
                          ) : isLow ? (
                            <span className="status-pill status-pill-amber">Low Stock</span>
                          ) : (
                            <span className="status-pill status-pill-green">Active</span>
                          )}
                        </td>
                        {user.role === 'admin' && (
                          <td className="cell-actions">
                            <form
                              className="inline-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const amount = Number(e.target.amount.value) || 1;
                                addStock(p.id, amount);
                              }}
                            >
                              <input type="number" name="amount" defaultValue={1} min="1" />
                              <button type="submit" className="btn-small btn-restock">+ Stock</button>
                            </form>
                            <Link to={`/products/${p.id}/edit`} className="btn-text-link">Edit</Link>
                            <button type="button" className="btn-text-danger" onClick={() => doDelete(p)}>Remove</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={data.currentPage} totalPages={data.totalPages} onPageChange={(p) => updateParams({ page: String(p) })} />
          </>
        )}
      </div>

      <ConfirmModal {...confirmDelete} />
    </Layout>
  );
}

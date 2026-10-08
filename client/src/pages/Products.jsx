import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PlugZap,
  Cable,
  Plug,
  ShoppingBag,
  BriefcaseBusiness,
  ShieldCheck,
  Keyboard,
  Mouse,
  Headphones,
  Speaker,
  Battery,
  MemoryStick,
  HardDrive,
  Fan,
  Usb,
  Package,
  Search,
} from 'lucide-react';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import CategoryPicker from '../components/CategoryPicker';
import Pagination from '../components/Pagination';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import ProductModal from '../components/ProductModal';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const CATEGORY_ICONS = {
  Charger: PlugZap,
  Cable: Cable,
  Adapter: Plug,
  Pouch: ShoppingBag,
  'Laptop Bag': BriefcaseBusiness,
  'Screen Guard': ShieldCheck,
  Keyboard: Keyboard,
  Mouse: Mouse,
  Headset: Headphones,
  Speaker: Speaker,
  Battery: Battery,
  'Memory (RAM)': MemoryStick,
  'Storage (SSD/HDD)': HardDrive,
  'Cooling Pad': Fan,
  'Flash Drive': Usb,
  'Other Accessory': Package,
};

const emptyForm = { name: '', sku: '', category: '', description: '', quantity: 0, low_stock_level: 5, cost_price: 0, price: 0, vat_rate: 0 };

export default function Products() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], categories: [], summary: {}, currentPage: 1, totalPages: 1, defaultVatRate: 0 });
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(null);
  const [stockAdjustments, setStockAdjustments] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const confirmDelete = useConfirmDelete();

  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const page = params.get('page') || '1';
  const itemsPerPage = Number(params.get('limit')) || 25;

  useEffect(() => {
    load();
  }, [search, category, page, itemsPerPage]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, [search, category, page, itemsPerPage]);

  async function load() {
    const qs = new URLSearchParams({
      search,
      category,
      page,
      limit: itemsPerPage,
    }).toString();
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

  function openAddModal() {
    setEditingProduct(null);
    setForm({ ...emptyForm, vat_rate: data.defaultVatRate });
    setError('');
    setShowForm(true);
  }

  function openEditModal(product) {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      description: product.description || '',
      quantity: product.quantity ?? 0,
      low_stock_level: product.low_stock_level ?? 5,
      cost_price: product.cost_price ?? 0,
      price: product.price ?? 0,
      vat_rate: product.vat_rate ?? 0,
    });
    setError('');
    setShowForm(true);
  }

  function closeProductModal() {
    setShowForm(false);
    // setEditingProduct(null);
    setForm(emptyForm);
    setError('');
  }

  function startEditing(product) {
    setEditingId(product.id);

    setEditingForm({
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      description: product.description || '',
      low_stock_level: product.low_stock_level ?? 5,
      cost_price: product.cost_price ?? 0,
      price: product.price ?? 0,
      vat_rate: product.vat_rate ?? 0,
    });

    setError('');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingForm(null);
  }

  async function saveEditing() {
    if (!editingId || !editingForm) return;

    setError('');

    try {
      await api.patch(`/products/${editingId}`, editingForm);
      setEditingId(null);
      setEditingForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/products', form);
      closeProductModal();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEdit(e) {
    e.preventDefault();
    setError('');

    try {
      await api.patch(`/products/${editingProduct.id}`, form);
      closeProductModal();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addStock(id, amount) {
    setError('');
    setSuccess('');

    try {
      await api.post(`/products/${id}/add-stock`, { amount });

      setSuccess(`Added ${amount} item${amount === 1 ? '' : 's'} to stock.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeStock(id, amount) {
    setError('');
    setSuccess('');

    try {
      await api.post(`/products/${id}/remove-stock`, { amount });

      setSuccess(`Removed ${amount} item${amount === 1 ? '' : 's'} from stock.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function doDelete(product) {
    confirmDelete.request(`"${product.name}"`, async () => {
      await api.delete(`/products/${product.id}`);
      load();
    });
  }

  return (
    <Layout title="Products">
      <Alert
        type="error"
        message={error}
        onClose={() => setError('')}
      />

      <Alert
        type="success"
        message={success}
        onClose={() => setSuccess('')}
      />

      {user.role === 'admin' && (
        <section className="add-item-section">
          <div className="section-heading-row">
            <h2>Set Up a New Product</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openAddModal}
            >
              + New Product
            </button>
          </div>
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
            <span className="toolbar-search-icon"><Search size={18} className="text-gray-500" /></span>
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
                    const isEditing = editingId === p.id;
                    return (
                      <tr key={p.id}>
                        <td className="cell-thumb">
                          {(() => {
                            const Icon = CATEGORY_ICONS[p.category] || Package;
                            return (
                              <span className="thumb-fallback">
                                <Icon size={16} strokeWidth={1.8} />
                              </span>
                            );
                          })()}
                        </td>
                        <td className="cell-name">
                          {isEditing ? (
                            <input
                              type="text"
                              className="inline-edit-input inline-edit-name"
                              value={editingForm.name}
                              onChange={(e) =>
                                setEditingForm({
                                  ...editingForm,
                                  name: e.target.value,
                                })
                              }
                              required
                            />
                          ) : (
                            <>
                              {p.name}
                              {p.description && (
                                <div className="cell-subtext">{p.description}</div>
                              )}
                            </>
                          )}
                        </td>
                        <td>{p.category ? <span className="category-badge">{p.category}</span> : '—'}</td>
                        <td className="text-muted">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingForm.sku}
                              onChange={(e) =>
                                setEditingForm({
                                  ...editingForm,
                                  sku: e.target.value,
                                })
                              }
                            />
                          ) : (
                            p.sku || '—'
                          )}
                        </td>
                        <td className={isLow ? 'text-low' : ''}>{p.quantity}</td>
                        {user.role === 'admin' && (
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingForm.cost_price}
                                onChange={(e) =>
                                  setEditingForm({
                                    ...editingForm,
                                    cost_price: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              `₦${p.cost_price.toLocaleString()}`
                            )}
                          </td>
                        )}
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingForm.price}
                              onChange={(e) =>
                                setEditingForm({
                                  ...editingForm,
                                  price: e.target.value,
                                })
                              }
                            />
                          ) : (
                            `₦${p.price.toLocaleString()}`
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingForm.vat_rate}
                              onChange={(e) =>
                                setEditingForm({
                                  ...editingForm,
                                  vat_rate: e.target.value,
                                })
                              }
                            />
                          ) : (
                            `${p.vat_rate}%`
                          )}
                        </td>
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
                            <div className="cell-actions-inner">
                              <div className="stock-controls">
                                <button
                                  type="button"
                                  className="stock-btn stock-btn-minus"
                                  onClick={() => {
                                    const amount = Number(stockAdjustments[p.id]) || 1;
                                    removeStock(p.id, amount);
                                  }}
                                  aria-label={`Remove ${p.name} stock`}
                                  disabled={p.quantity === 0}
                                >
                                  −
                                </button>

                                <input
                                  type="number"
                                  className="stock-adjustment"
                                  min="1"
                                  value={stockAdjustments[p.id] ?? 1}
                                  onChange={(e) =>
                                    setStockAdjustments({
                                      ...stockAdjustments,
                                      [p.id]: e.target.value,
                                    })
                                  }
                                  aria-label="Stock adjustment amount"
                                />

                                <button
                                  type="button"
                                  className="stock-btn stock-btn-plus"
                                  onClick={() => {
                                    const amount = Number(stockAdjustments[p.id]) || 1;
                                    addStock(p.id, amount);
                                  }}
                                  aria-label={`Add ${p.name} stock`}
                                >
                                  +
                                </button>
                              </div>
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-text-link"
                                    onClick={saveEditing}
                                  >
                                    Save
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-text-link"
                                    onClick={cancelEditing}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn-text-link"
                                    onClick={() => startEditing(p)}
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-text-danger"
                                    onClick={() => doDelete(p)}
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              <div>
                <Pagination currentPage={data.currentPage} totalPages={data.totalPages} onPageChange={(p) => updateParams({ page: String(p) })} />
                <div className="toolbar-actions">
                  <label className="items-per-page">
                    <span className="muted">Show</span>

                    <select
                      value={itemsPerPage}
                      onChange={(e) =>
                        updateParams({
                          limit: e.target.value,
                        })
                      }
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>

                    <span className="muted">per page</span>
                  </label>

                  <span className="muted">{data.totalItems ?? 0} total</span>
                </div></div>
          </>
        )}
      </div>
      <ProductModal
        open={showForm}
        form={form}
        setForm={setForm}
        onClose={closeProductModal}
        onSubmit={handleAdd}
        error={error}
        isEditing={false}
      />
      <ConfirmModal {...confirmDelete} />
    </Layout>
  );
}

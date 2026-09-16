import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import CategoryPicker from '../components/CategoryPicker';
import Pagination from '../components/Pagination';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

const CATEGORY_OPTIONS = ['Repair', 'Installation', 'Diagnostics', 'Data Recovery', 'Cleaning', 'Upgrade', 'Software Setup', 'Consultation'];
const emptyForm = { name: '', category: '', description: '', cost_price: 0, price: 0, vat_rate: 0 };

export default function Services() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], categories: [], currentPage: 1, totalPages: 1, defaultVatRate: 0 });
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
    const result = await api.get(`/services?${qs}`);
    setData(result);
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
      await api.post('/services', form);
      setForm({ ...emptyForm, vat_rate: data.defaultVatRate });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function doDelete(service) {
    confirmDelete.request(`"${service.name}"`, async () => {
      await api.delete(`/services/${service.id}`);
      load();
    });
  }

  return (
    <Layout title="Services">
      <p className="page-subtitle">Things you charge for that aren't physical stock — repairs, installs, data recovery, etc.</p>
      <Alert type="error" message={error} />

      {user.role === 'admin' && (
        <section className="add-item-section">
          <div className="section-heading-row">
            <h2>Add a New Service</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ New Service'}
            </button>
          </div>
          {showForm && (
            <form onSubmit={handleAdd} className="add-item-form">
              <div className="field">
                <label>Service name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptop Screen Replacement" required />
              </div>
              <CategoryPicker value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} />
              <div className="field field-wide">
                <label>Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's included" />
              </div>
              <div className="field field-small">
                <label>Cost to you (₦) — parts, etc.</label>
                <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} />
              </div>
              <div className="field field-small">
                <label>Price (₦)</label>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="field field-small">
                <label>VAT rate (%)</label>
                <input type="number" min="0" step="0.01" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-primary">Add Service</button>
            </form>
          )}
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
            <input type="text" placeholder="Search services…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </form>
          <div className="toolbar-actions">
            <span className="muted">{data.totalItems ?? 0} total</span>
          </div>
        </div>

        {data.categories?.length > 0 && (
          <div className="category-filter">
            <a className={`filter-pill ${!category ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ category: '' })}>All</a>
            {data.categories.map((cat) => (
              <a key={cat} className={`filter-pill ${category === cat ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ category: cat })}>{cat}</a>
            ))}
          </div>
        )}

        {data.items.length === 0 ? (
          <div className="empty-state">
            <p>{search || category ? 'No services match your search.' : 'No services have been added yet.'}</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Description</th>
                    {user.role === 'admin' && <th>Cost</th>}
                    <th>Price</th>
                    <th>VAT</th>
                    {user.role === 'admin' && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-name">{s.name}</td>
                      <td>{s.category ? <span className="category-badge">{s.category}</span> : '—'}</td>
                      <td className="cell-desc">{s.description}</td>
                      {user.role === 'admin' && <td>₦{s.cost_price.toLocaleString()}</td>}
                      <td>₦{s.price.toLocaleString()}</td>
                      <td>{s.vat_rate}%</td>
                      {user.role === 'admin' && (
                        <td className="cell-actions">
                          <Link to={`/services/${s.id}/edit`} className="btn-text-link">Edit</Link>
                          <button type="button" className="btn-text-danger" onClick={() => doDelete(s)}>Remove</button>
                        </td>
                      )}
                    </tr>
                  ))}
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

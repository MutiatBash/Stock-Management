import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import Pagination from '../components/Pagination';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function ServiceJobs() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], counts: {}, currentPage: 1, totalPages: 1 });
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [error, setError] = useState('');
  const confirmDelete = useConfirmDelete();

  const search = params.get('search') || '';
  const status = params.get('status') || '';
  const page = params.get('page') || '1';

  useEffect(() => {
    load();
  }, [search, status, page]);

  async function load() {
    const qs = new URLSearchParams({ search, status, page }).toString();
    const result = await api.get(`/service-jobs?${qs}`);
    setData(result);
  }

  function updateParams(next) {
    const merged = { search, status, page: '1', ...next };
    const qs = {};
    Object.entries(merged).forEach(([k, v]) => v && (qs[k] = v));
    setParams(qs);
  }

  async function markCollected(id) {
    setError('');
    try {
      await api.post(`/service-jobs/${id}/mark-collected`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markReceived(id) {
    setError('');
    try {
      await api.post(`/service-jobs/${id}/mark-received`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function doDelete(job) {
    confirmDelete.request(`this record for "${job.customer_name}"`, async () => {
      await api.delete(`/service-jobs/${job.id}`);
      load();
    });
  }

  return (
    <Layout title="Service Records">
      <div className="section-heading-row">
        <div>
          <p className="page-subtitle">Customer drop-offs for repair or service — track what came in and when it was collected.</p>
        </div>
        <Link to="/service-jobs/new" className="btn btn-primary">+ New Record</Link>
      </div>
      <Alert type="error" message={error} />

      <div className="category-filter">
        <a className={`filter-pill ${!status ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: '' })}>All ({data.counts.all ?? 0})</a>
        <a className={`filter-pill ${status === 'received' ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: 'received' })}>Received ({data.counts.received ?? 0})</a>
        <a className={`filter-pill ${status === 'collected' ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: 'collected' })}>Collected ({data.counts.collected ?? 0})</a>
      </div>

      <form
        className="search-form"
        style={{ marginBottom: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ search: searchInput });
        }}
      >
        <input
          type="text"
          className="search-input"
          style={{ minWidth: 280 }}
          placeholder="Search by customer, contact, or item…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-small btn-search">Search</button>
        {search && (
          <a
            className="btn-text-link"
            onClick={() => {
              setSearchInput('');
              updateParams({ search: '' });
            }}
          >
            Clear
          </a>
        )}
      </form>

      {data.items.length === 0 ? (
        <div className="empty-state"><p>No service records found.</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th><th>Contact</th><th>Item</th><th>Condition</th><th>Reason</th>
                  <th>Amount</th><th>Payment</th><th>Received</th><th>Collected</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((j) => (
                  <tr key={j.id}>
                    <td className="cell-name">{j.customer_name}</td>
                    <td className="text-muted">{j.customer_contact}</td>
                    <td>{j.item}</td>
                    <td className="cell-desc">{j.item_condition}</td>
                    <td className="cell-desc">{j.reason}</td>
                    <td>₦{j.amount_charged.toLocaleString()}</td>
                    <td className="text-muted">{j.mode_of_payment}</td>
                    <td className="text-muted">{j.date_received || '—'}</td>
                    <td className="text-muted">{j.date_collected || '—'}</td>
                    <td><span className={`status-badge status-${j.status}`}>{j.status}</span></td>
                    <td className="cell-actions">
                      <Link to={`/service-jobs/${j.id}/edit`} className="btn-text-link">Edit</Link>
                      {j.status === 'received' ? (
                        <button type="button" className="btn-small btn-restock" onClick={() => markCollected(j.id)}>Mark Collected</button>
                      ) : (
                        <button type="button" className="btn-small btn-secondary-small" onClick={() => markReceived(j.id)}>Mark Received</button>
                      )}
                      {user.role === 'admin' && (
                        <button type="button" className="btn-text-danger" onClick={() => doDelete(j)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={data.currentPage} totalPages={data.totalPages} onPageChange={(p) => updateParams({ page: String(p) })} />
        </>
      )}

      <ConfirmModal {...confirmDelete} />
    </Layout>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Debts() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], totals: {}, currentPage: 1, totalPages: 1 });
  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const confirmDelete = useConfirmDelete();

  const search = params.get('search') || '';
  const status = params.get('status') || '';
  const page = params.get('page') || '1';

  useEffect(() => {
    load();
  }, [search, status, page]);

  async function load() {
    const qs = new URLSearchParams({ search, status, page }).toString();
    setData(await api.get(`/debts?${qs}`));
  }

  function updateParams(next) {
    const merged = { search, status, page: '1', ...next };
    const qs = {};
    Object.entries(merged).forEach(([k, v]) => v && (qs[k] = v));
    setParams(qs);
  }

  async function recordPayment(id) {
    const amount = prompt('How much is being paid now (₦)?');
    if (!amount) return;
    await api.post(`/debts/${id}/record-payment`, { amount: Number(amount) });
    load();
  }

  function doDelete(debt) {
    confirmDelete.request(`this debt record for "${debt.customer_name}"`, async () => {
      await api.delete(`/debts/${debt.id}`);
      load();
    });
  }

  return (
    <Layout title="Debts">
      <div className="section-heading-row">
        <p className="page-subtitle">Amounts customers owe IntelMind for credit sales.</p>
        <Link to="/debts/new" className="btn btn-primary">+ New Debt Record</Link>
      </div>

      <section className="summary-bar">
        <div className="summary-stat">
          <span className="summary-number">₦{(data.totals.totalOwed || 0).toLocaleString()}</span>
          <span className="summary-label">total owed</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{(data.totals.totalPaid || 0).toLocaleString()}</span>
          <span className="summary-label">total paid</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number text-loss">₦{(data.totals.totalOutstanding || 0).toLocaleString()}</span>
          <span className="summary-label">outstanding</span>
        </div>
      </section>

      <div className="category-filter">
        <a className={`filter-pill ${!status ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: '' })}>All</a>
        <a className={`filter-pill ${status === 'owing' ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: 'owing' })}>Owing</a>
        <a className={`filter-pill ${status === 'partial' ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: 'partial' })}>Partially Paid</a>
        <a className={`filter-pill ${status === 'paid' ? 'filter-pill-active' : ''}`} onClick={() => updateParams({ status: 'paid' })}>Paid</a>
      </div>

      <form
        className="search-form"
        style={{ marginBottom: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ search: searchInput });
        }}
      >
        <input type="text" className="search-input" style={{ minWidth: 260 }} placeholder="Search by customer or contact…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <button type="submit" className="btn-small btn-search">Search</button>
      </form>

      {data.items.length === 0 ? (
        <div className="empty-state"><p>No debt records found.</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th><th>Contact</th><th>Description</th><th>Owed</th><th>Paid</th>
                  <th>Balance</th><th>Due</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-name">{d.customer_name}</td>
                    <td className="text-muted">{d.customer_contact}</td>
                    <td className="cell-desc">{d.description}</td>
                    <td>₦{d.amount_owed.toLocaleString()}</td>
                    <td>₦{d.amount_paid.toLocaleString()}</td>
                    <td className={d.balance > 0 ? 'text-low' : ''}>₦{d.balance.toLocaleString()}</td>
                    <td className="text-muted">{d.due_date || '—'}</td>
                    <td><span className={`status-badge status-${d.status === 'paid' ? 'collected' : 'received'}`}>{d.status}</span></td>
                    <td className="cell-actions">
                      {d.balance > 0 && (
                        <button type="button" className="btn-small btn-restock" onClick={() => recordPayment(d.id)}>Record Payment</button>
                      )}
                      <Link to={`/debts/${d.id}/edit`} className="btn-text-link">Edit</Link>
                      {user.role === 'admin' && (
                        <button type="button" className="btn-text-danger" onClick={() => doDelete(d)}>Remove</button>
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

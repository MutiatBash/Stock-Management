import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import api from '../api/client';

export default function Statements() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], totals: {}, currentPage: 1, totalPages: 1 });

  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const page = params.get('page') || '1';

  useEffect(() => {
    load();
  }, [from, to, page]);

  async function load() {
    const qs = new URLSearchParams({ from, to, page }).toString();
    setData(await api.get(`/statements?${qs}`));
  }

  function updateParams(next) {
    const merged = { from, to, page: '1', ...next };
    const qs = {};
    Object.entries(merged).forEach(([k, v]) => v && (qs[k] = v));
    setParams(qs);
  }

  return (
    <Layout title="Statements">
      <p className="page-subtitle">Every sale recorded by every staff member. Click one to view or print it.</p>

      <form
        className="filter-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="field field-small">
          <label>From date</label>
          <input type="date" value={from} onChange={(e) => updateParams({ from: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>To date</label>
          <input type="date" value={to} onChange={(e) => updateParams({ to: e.target.value })} />
        </div>
        {(from || to) && (
          <a className="btn-text-link" onClick={() => setParams({})}>Clear</a>
        )}
      </form>

      <section className="summary-bar">
        <div className="summary-stat">
          <span className="summary-number">{data.totals.count || 0}</span>
          <span className="summary-label">sales</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{(data.totals.subtotal || 0).toLocaleString()}</span>
          <span className="summary-label">subtotal</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{(data.totals.vat || 0).toLocaleString()}</span>
          <span className="summary-label">VAT collected</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{(data.totals.total || 0).toLocaleString()}</span>
          <span className="summary-label">total revenue</span>
        </div>
      </section>

      {data.items.length === 0 ? (
        <div className="empty-state"><p>No sales in this date range.</p></div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Date</th><th>Staff</th><th>Subtotal</th><th>VAT</th><th>Total</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td>#{s.id}</td>
                    <td className="text-muted">{s.created_at}</td>
                    <td>{s.created_by_name}</td>
                    <td>₦{s.subtotal.toLocaleString()}</td>
                    <td>₦{s.vat_amount.toLocaleString()}</td>
                    <td className="cell-name">₦{s.total.toLocaleString()}</td>
                    <td><Link to={`/statements/${s.id}`} className="btn-text-link">View / Print</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={data.currentPage} totalPages={data.totalPages} onPageChange={(p) => updateParams({ page: String(p) })} />
        </>
      )}
    </Layout>
  );
}

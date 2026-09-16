import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api/client';

export default function ProfitLoss() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ totals: { revenue: 0, cost: 0, profit: 0, vat: 0 }, breakdown: [] });

  const from = params.get('from') || '';
  const to = params.get('to') || '';

  useEffect(() => {
    load();
  }, [from, to]);

  async function load() {
    const qs = new URLSearchParams({ from, to }).toString();
    setData(await api.get(`/reports/profit-loss?${qs}`));
  }

  return (
    <Layout title="Profit & Loss">
      <p className="page-subtitle">Revenue and cost from every sale (excluding VAT). Filter by date to check a specific period.</p>

      <form className="filter-form" onSubmit={(e) => e.preventDefault()}>
        <div className="field field-small">
          <label>From date</label>
          <input type="date" value={from} onChange={(e) => setParams({ from: e.target.value, to })} />
        </div>
        <div className="field field-small">
          <label>To date</label>
          <input type="date" value={to} onChange={(e) => setParams({ from, to: e.target.value })} />
        </div>
        {(from || to) && <a className="btn-text-link" onClick={() => setParams({})}>Clear</a>}
      </form>

      <section className="summary-bar">
        <div className="summary-stat">
          <span className="summary-number">₦{data.totals.revenue.toLocaleString()}</span>
          <span className="summary-label">revenue (excl. VAT)</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{data.totals.cost.toLocaleString()}</span>
          <span className="summary-label">cost of goods/services</span>
        </div>
        <div className="summary-stat">
          <span className={`summary-number ${data.totals.profit >= 0 ? 'text-profit' : 'text-loss'}`}>₦{data.totals.profit.toLocaleString()}</span>
          <span className="summary-label">{data.totals.profit >= 0 ? 'profit' : 'loss'}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">₦{data.totals.vat.toLocaleString()}</span>
          <span className="summary-label">VAT collected</span>
        </div>
      </section>

      <section className="items-section">
        <h2>By Product / Service</h2>
        {data.breakdown.length === 0 ? (
          <div className="empty-state"><p>No sales in this date range.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Qty Sold</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr>
              </thead>
              <tbody>
                {data.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td className="cell-name">{b.name}</td>
                    <td className="text-muted">{b.type}</td>
                    <td>{b.quantity}</td>
                    <td>₦{b.revenue.toLocaleString()}</td>
                    <td>₦{b.cost.toLocaleString()}</td>
                    <td className={b.profit >= 0 ? 'text-profit' : 'text-loss'}>₦{b.profit.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Layout>
  );
}

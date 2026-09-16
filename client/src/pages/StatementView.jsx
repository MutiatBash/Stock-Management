import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';

export default function StatementView() {
  const { id } = useParams();
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/sales/${id}`)
      .then((data) => {
        setSale(data.sale);
        setItems(data.items);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!sale) return <div className="page">Loading…</div>;

  return (
    <div className="page">
      <div className="no-print receipt-toolbar">
        <Link to="/" className="back-link">&larr; Back to New Sale</Link>
        <div className="receipt-toolbar-actions">
          <a href={`/api/sales/${sale.id}/download`} className="btn btn-secondary">Download Receipt</a>
          <button onClick={() => window.print()} className="btn btn-primary">Print This Receipt</button>
        </div>
      </div>

      <div className="receipt">
        <div className="receipt-header">
          <div className="receipt-brand">💻 IntelMind</div>
          <div className="receipt-sub">Computer Hardware &amp; Accessories</div>
        </div>

        <div className="receipt-meta">
          <div><strong>Receipt #</strong>{sale.id}</div>
          <div><strong>Date</strong>{sale.created_at}</div>
          <div><strong>Served by</strong>{sale.created_by_name}</div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>VAT</th><th>Line Total</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.name} <span className="receipt-tag">{i.item_type}</span></td>
                <td>{i.quantity}</td>
                <td>₦{i.unit_price.toLocaleString()}</td>
                <td>{i.vat_rate}%</td>
                <td>₦{(i.line_total + i.vat_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-totals">
          <div className="receipt-total-row"><span>Subtotal</span><span>₦{sale.subtotal.toLocaleString()}</span></div>
          <div className="receipt-total-row"><span>VAT</span><span>₦{sale.vat_amount.toLocaleString()}</span></div>
          <div className="receipt-total-row receipt-total-grand"><span>Total</span><span>₦{sale.total.toLocaleString()}</span></div>
        </div>

        <div className="receipt-footer">Thank you for shopping with IntelMind.</div>
      </div>
    </div>
  );
}

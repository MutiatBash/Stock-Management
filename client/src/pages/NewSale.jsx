import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import api from '../api/client';

function formatNaira(n) {
  return '₦' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function NewSale() {
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [cart, setCart] = useState([]); // { type, id, name, price, qty, maxStock, vatRate }
  const [productSearch, setProductSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.get('/sale-options');
    setProducts(data.products);
    setServices(data.services);
    setRecentSales(data.recentSales);
  }

  function addToCart(type, item) {
    if (type === 'product' && item.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.type === type && l.id === item.id);
      if (existing) {
        if (type === 'product' && existing.qty >= item.quantity) {
          alert(`Only ${item.quantity} of "${item.name}" in stock.`);
          return prev;
        }
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          type,
          id: item.id,
          name: item.name,
          price: item.price,
          qty: 1,
          maxStock: type === 'product' ? item.quantity : null,
          vatRate: item.vat_rate || 0,
        },
      ];
    });
  }

  function changeQty(index, delta) {
    setCart((prev) => {
      const line = prev[index];
      const newQty = line.qty + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== index);
      if (line.maxStock !== null && newQty > line.maxStock) {
        alert(`Only ${line.maxStock} of "${line.name}" in stock.`);
        return prev;
      }
      return prev.map((l, i) => (i === index ? { ...l, qty: newQty } : l));
    });
  }

  function removeLine(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const vatTotal = cart.reduce((sum, l) => sum + l.price * l.qty * (l.vatRate / 100), 0);
  const grandTotal = subtotal + vatTotal;

  async function completeSale() {
    setError('');
    setSubmitting(true);
    try {
      const lines = cart.map((l) => ({ type: l.type, id: l.id, qty: l.qty }));
      const data = await api.post('/sales', { lines });
      navigate(`/statements/${data.saleId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  const filteredServices = services.filter((s) => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));

  return (
    <Layout title="New Sale">
      <p className="page-subtitle">Tap products or services to add them, then complete the sale to view your receipt.</p>
      <Alert type="error" message={error} />

      <div className="sale-layout">
        <div className="sale-pickers">
          <section className="picker-section">
            <div className="section-heading-row">
              <h2>Products</h2>
              <input
                type="text"
                className="search-input"
                placeholder="Search products…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {filteredProducts.length === 0 ? (
              <p className="muted">No products found.</p>
            ) : (
              <div className="picker-grid">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="picker-card"
                    disabled={p.quantity <= 0}
                    onClick={() => addToCart('product', p)}
                  >
                    <span className="picker-name">{p.name}</span>
                    <span className="picker-price">{formatNaira(p.price)}</span>
                    <span className={`picker-stock ${p.quantity <= p.low_stock_level ? 'picker-stock-low' : ''}`}>
                      {p.quantity > 0 ? `${p.quantity} in stock` : 'Out of stock'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="picker-section">
            <div className="section-heading-row">
              <h2>Services</h2>
              <input
                type="text"
                className="search-input"
                placeholder="Search services…"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
            </div>
            {filteredServices.length === 0 ? (
              <p className="muted">No services found.</p>
            ) : (
              <div className="picker-grid">
                {filteredServices.map((s) => (
                  <button key={s.id} type="button" className="picker-card" onClick={() => addToCart('service', s)}>
                    <span className="picker-name">{s.name}</span>
                    <span className="picker-price">{formatNaira(s.price)}</span>
                    <span className="picker-stock">Service</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="cart-panel">
          <h2>This Sale</h2>
          {cart.length === 0 ? (
            <div className="muted">Nothing added yet. Tap a product or service.</div>
          ) : (
            <>
              <ul className="cart-list">
                {cart.map((line, index) => (
                  <li key={`${line.type}-${line.id}`} className="cart-item">
                    <div className="cart-item-info">
                      <div className="cart-item-name">{line.name}</div>
                      <div className="cart-item-price">
                        {formatNaira(line.price)} each{line.vatRate ? ` · VAT ${line.vatRate}%` : ''}
                      </div>
                    </div>
                    <div className="cart-item-controls">
                      <button type="button" className="qty-btn" onClick={() => changeQty(index, -1)}>
                        –
                      </button>
                      <span className="qty-value">{line.qty}</span>
                      <button type="button" className="qty-btn" onClick={() => changeQty(index, 1)}>
                        +
                      </button>
                      <button type="button" className="remove-btn" onClick={() => removeLine(index)}>
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="cart-totals">
                <div className="cart-total-row">
                  <span>Subtotal</span>
                  <span>{formatNaira(subtotal)}</span>
                </div>
                <div className="cart-total-row">
                  <span>VAT</span>
                  <span>{formatNaira(vatTotal)}</span>
                </div>
                <div className="cart-total-row cart-total-grand">
                  <span>Total</span>
                  <span>{formatNaira(grandTotal)}</span>
                </div>
              </div>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={cart.length === 0 || submitting}
            onClick={completeSale}
          >
            {submitting ? 'Saving…' : 'Complete Sale & View Receipt'}
          </button>
        </aside>
      </div>

      {recentSales.length > 0 && (
        <section className="activity-section">
          <h2>Recent Sales</h2>
          <ul className="activity-list">
            {recentSales.map((s) => (
              <li key={s.id}>
                <Link to={`/statements/${s.id}`}>
                  Sale #{s.id} — {formatNaira(s.total)} by {s.created_by_name}
                </Link>
                <span className="activity-time">{s.created_at}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Layout>
  );
}

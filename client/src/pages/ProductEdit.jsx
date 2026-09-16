import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import CategoryPicker from '../components/CategoryPicker';
import api from '../api/client';

const CATEGORY_OPTIONS = [
  'Charger', 'Cable', 'Adapter', 'Pouch', 'Laptop Bag', 'Screen Guard', 'Keyboard',
  'Mouse', 'Headset', 'Speaker', 'Battery', 'Memory (RAM)', 'Storage (SSD/HDD)',
  'Cooling Pad', 'Flash Drive', 'Other Accessory',
];

export default function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/products/${id}`).then(setForm);
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/products/${id}`, form);
      navigate('/products');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!form) return <Layout title="Edit Product">Loading…</Layout>;

  return (
    <Layout title="Edit Product">
      <Link to="/products" className="back-link">&larr; Back to products</Link>
      <h2 className="edit-title">Edit "{form.name}"</h2>

      <form onSubmit={handleSubmit} className="add-item-form">
        <Alert type="error" message={error} />
        <div className="field">
          <label>Product name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field field-small">
          <label>SKU / code</label>
          <input type="text" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <CategoryPicker value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} />
        <div className="field field-wide">
          <label>Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Image URL</label>
          <input type="text" value={form.image_url || ''} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
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
        <p className="hint-text">To change how many are in stock, use "+ Stock" on the Products page instead.</p>
        <button type="submit" className="btn btn-primary">Save Changes</button>
      </form>
    </Layout>
  );
}

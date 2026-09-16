import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import CategoryPicker from '../components/CategoryPicker';
import api from '../api/client';

const CATEGORY_OPTIONS = ['Repair', 'Installation', 'Diagnostics', 'Data Recovery', 'Cleaning', 'Upgrade', 'Software Setup', 'Consultation'];

export default function ServiceEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/services/${id}`).then(setForm);
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.patch(`/services/${id}`, form);
      navigate('/services');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!form) return <Layout title="Edit Service">Loading…</Layout>;

  return (
    <Layout title="Edit Service">
      <Link to="/services" className="back-link">&larr; Back to services</Link>
      <h2 className="edit-title">Edit "{form.name}"</h2>

      <form onSubmit={handleSubmit} className="add-item-form">
        <Alert type="error" message={error} />
        <div className="field">
          <label>Service name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <CategoryPicker value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} />
        <div className="field field-wide">
          <label>Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Cost to you (₦)</label>
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
        <button type="submit" className="btn btn-primary">Save Changes</button>
      </form>
    </Layout>
  );
}

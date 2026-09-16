import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import api from '../api/client';

const emptyForm = {
  customer_name: '', customer_contact: '', item: '', item_condition: '', reason: '',
  amount_charged: 0, mode_of_payment: '', date_received: '', date_collected: '',
};

export default function ServiceJobForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) api.get(`/service-jobs/${id}`).then(setForm);
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await api.patch(`/service-jobs/${id}`, form);
      } else {
        await api.post('/service-jobs', form);
      }
      navigate('/service-jobs');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title={isEdit ? 'Edit Service Record' : 'New Service Record'}>
      <Link to="/service-jobs" className="back-link">&larr; Back to Service Records</Link>
      <h2 className="edit-title">{isEdit ? `Edit Record for ${form.customer_name}` : 'New Service Record'}</h2>

      <form onSubmit={handleSubmit} className="add-item-form">
        <Alert type="error" message={error} />

        <div className="field field-small">
          <label>Customer name</label>
          <input type="text" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
        </div>
        <div className="field field-small">
          <label>Customer contact</label>
          <input type="text" value={form.customer_contact} onChange={(e) => setForm({ ...form, customer_contact: e.target.value })} placeholder="Phone number or email" />
        </div>

        <div className="field field-small">
          <label>Item brought in</label>
          <input type="text" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. HP Laptop" required />
        </div>
        <div className="field field-small">
          <label>Condition of item</label>
          <input type="text" value={form.item_condition} onChange={(e) => setForm({ ...form, item_condition: e.target.value })} placeholder="e.g. Cracked screen, powers on" />
        </div>

        <div className="field field-wide">
          <label>Reason for repair / service</label>
          <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="What the customer wants done" />
        </div>

        <div className="field field-small">
          <label>Amount charged (₦)</label>
          <input type="number" min="0" step="0.01" value={form.amount_charged} onChange={(e) => setForm({ ...form, amount_charged: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Mode of payment</label>
          <select value={form.mode_of_payment} onChange={(e) => setForm({ ...form, mode_of_payment: e.target.value })}>
            <option value="">Not paid yet</option>
            {['Cash', 'Bank Transfer', 'POS / Card', 'Mobile Money'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="field field-small">
          <label>Date received</label>
          <input type="date" value={form.date_received || ''} onChange={(e) => setForm({ ...form, date_received: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Date collected</label>
          <input type="date" value={form.date_collected || ''} onChange={(e) => setForm({ ...form, date_collected: e.target.value })} />
        </div>
        <p className="hint-text">Leave "Date collected" empty if the customer hasn't picked it up yet. Filling it in marks this record as Collected.</p>

        <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Create Record'}</button>
      </form>
    </Layout>
  );
}

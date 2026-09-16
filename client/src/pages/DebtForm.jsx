import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import api from '../api/client';

const emptyForm = {
  customer_name: '', customer_contact: '', description: '', amount_owed: 0,
  amount_paid: 0, date_incurred: '', due_date: '', notes: '',
};

export default function DebtForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) api.get(`/debts/${id}`).then(setForm);
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await api.patch(`/debts/${id}`, form);
      } else {
        await api.post('/debts', form);
      }
      navigate('/debts');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout title={isEdit ? 'Edit Debt Record' : 'New Debt Record'}>
      <Link to="/debts" className="back-link">&larr; Back to Debts</Link>
      <h2 className="edit-title">{isEdit ? `Edit Record for ${form.customer_name}` : 'New Debt Record'}</h2>

      <form onSubmit={handleSubmit} className="add-item-form">
        <Alert type="error" message={error} />
        <div className="field field-small">
          <label>Customer name</label>
          <input type="text" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
        </div>
        <div className="field field-small">
          <label>Customer contact</label>
          <input type="text" value={form.customer_contact} onChange={(e) => setForm({ ...form, customer_contact: e.target.value })} />
        </div>
        <div className="field field-wide">
          <label>Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was bought on credit" />
        </div>
        <div className="field field-small">
          <label>Amount owed (₦)</label>
          <input type="number" min="0" step="0.01" value={form.amount_owed} onChange={(e) => setForm({ ...form, amount_owed: e.target.value })} required />
        </div>
        <div className="field field-small">
          <label>Amount already paid (₦)</label>
          <input type="number" min="0" step="0.01" value={form.amount_paid} onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Date incurred</label>
          <input type="date" value={form.date_incurred || ''} onChange={(e) => setForm({ ...form, date_incurred: e.target.value })} />
        </div>
        <div className="field field-small">
          <label>Due date</label>
          <input type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
        <div className="field field-wide">
          <label>Notes</label>
          <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-primary">{isEdit ? 'Save Changes' : 'Create Record'}</button>
      </form>
    </Layout>
  );
}

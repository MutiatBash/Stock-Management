import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import ConfirmModal, { useConfirmDelete } from '../components/ConfirmModal';
import api from '../api/client';

const emptyForm = { name: '', username: '', password: '' };

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const confirmDelete = useConfirmDelete();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await api.get('/staff');
    setStaff(data.staff);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.post('/staff', form);
      setSuccess(`Login created for ${form.name}.`);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function doDelete(s) {
    confirmDelete.request(`the login for "${s.name}"`, async () => {
      await api.delete(`/staff/${s.id}`);
      load();
    });
  }

  return (
    <Layout title="Staff">
      <p className="page-subtitle">Give each staff member their own username and password. They can record sales and view Products/Services, but can't change prices, stock, or settings.</p>

      <section className="add-item-section">
        <h2>Add a Staff Login</h2>
        <form onSubmit={handleSubmit} className="add-item-form">
          <Alert type="error" message={error} />
          <Alert type="success" message={success} />
          <div className="field">
            <label>Staff member's name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amaka Obi" required />
          </div>
          <div className="field field-small">
            <label>Username</label>
            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. amaka" required />
          </div>
          <div className="field field-small">
            <label>Password</label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Choose a password" required />
          </div>
          <button type="submit" className="btn btn-primary">Create Login</button>
        </form>
      </section>

      <section className="items-section">
        <h2>Current Staff <span className="count-pill">{staff.length}</span></h2>
        {staff.length === 0 ? (
          <div className="empty-state"><p>No staff logins yet. Add one above.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Username</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-name">{s.name}</td>
                    <td className="text-muted">{s.username}</td>
                    <td className="text-muted">{s.created_at}</td>
                    <td><button type="button" className="btn-text-danger" onClick={() => doDelete(s)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal {...confirmDelete} />
    </Layout>
  );
}

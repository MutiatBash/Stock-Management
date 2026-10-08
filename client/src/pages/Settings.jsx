import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import api from '../api/client';

export default function Settings() {
  const [vatRate, setVatRate] = useState(0);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/settings').then((d) => setVatRate(d.defaultVatRate));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const data = await api.post('/settings', { default_vat_rate: vatRate });
    setVatRate(data.defaultVatRate);
    setSuccess(`Default VAT rate set to ${data.defaultVatRate}%.`);
  }

  return (
    <Layout title="Settings">
      <section className="add-item-section">
        <h2>Default VAT Rate</h2>
        <p className="page-subtitle">
          VAT is set per product and per service — each can have its own rate. This number just pre-fills the field
          when you add a new product or service. It doesn't change existing items.
        </p>
        <form onSubmit={handleSubmit} className="add-item-form">
          <Alert type="success" message={success} />
          <div className="field field-small">
            <label>Default VAT rate (%)</label>
            <input type="number" min="0" step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary">Save Default</button>
        </form>
      </section>

      <section className="add-item-section">
        <h2>Export Your Data</h2>
        <p className="page-subtitle">
          Your data is stored in your Supabase database, separate from the app server. This button downloads a
          complete copy of it — products, services, sales, service records, debts and stock activity — as one file.
          Keep a copy somewhere safe (email it to yourself or save it to a USB drive) and do it regularly. Staff
          passwords are not included.
        </p>
        <a href="/api/backup" className="btn btn-secondary">Download Data Export</a>
      </section>
    </Layout>
  );
}

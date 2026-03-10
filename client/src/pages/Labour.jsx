import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Labour() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', worker_name: '', labour_type: '', work_type: '', wage_type: 'daily', wage_amount: '', total_days_worked: '', payment_status: 'pending', month: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/labour?site_id=${siteFilter}` : '/api/labour';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const salary = (Number(form.wage_amount) || 0) * (Number(form.total_days_worked) || 0);
    await api.post('/api/labour', { ...form, total_salary: salary, attendance_days: form.total_days_worked });
    setForm({ site_id: '', worker_name: '', labour_type: '', work_type: '', wage_type: 'daily', wage_amount: '', total_days_worked: '', payment_status: 'pending', month: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this record?')) { await api.del(`/api/labour/${id}`); loadItems(); }
  };

  const togglePayment = async (item) => {
    const next = item.payment_status === 'paid' ? 'pending' : 'paid';
    await api.put(`/api/labour/${item.id}`, { payment_status: next });
    loadItems();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">👷 Labour Salary</h1>
        <div className="flex gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input required placeholder="Worker Name *" value={form.worker_name} onChange={e => setForm({ ...form, worker_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.labour_type} onChange={e => setForm({ ...form, labour_type: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Labour Type</option>
              <option>Mason</option><option>Helper</option><option>Carpenter</option><option>Plumber</option><option>Electrician</option><option>Welder</option><option>Painter</option>
            </select>
            <input placeholder="Work Type" value={form.work_type} onChange={e => setForm({ ...form, work_type: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.wage_type} onChange={e => setForm({ ...form, wage_type: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="daily">Daily Wage</option><option value="monthly">Monthly Wage</option>
            </select>
            <input type="number" placeholder="Wage Amount (₹)" value={form.wage_amount} onChange={e => setForm({ ...form, wage_amount: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Total Days Worked" value={form.total_days_worked} onChange={e => setForm({ ...form, total_days_worked: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Month (e.g., 2024-06)" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Worker</th>
              <th className="text-left p-3">Type</th>
              <th className="text-right p-3">Wage</th>
              <th className="text-right p-3">Days</th>
              <th className="text-right p-3">Total</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.worker_name}</td>
                <td className="p-3">{item.labour_type}</td>
                <td className="p-3 text-right">₹{Number(item.wage_amount).toLocaleString('en-IN')}/{item.wage_type === 'daily' ? 'day' : 'month'}</td>
                <td className="p-3 text-right">{item.total_days_worked}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.total_salary).toLocaleString('en-IN')}</td>
                <td className="p-3 text-center">
                  <button onClick={() => togglePayment(item)} className={`text-xs px-2 py-1 rounded-full ${item.payment_status === 'paid' ? 'bg-green-100 text-green-700' : item.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                    {item.payment_status}
                  </button>
                </td>
                <td className="p-3">
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-gray-400">No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

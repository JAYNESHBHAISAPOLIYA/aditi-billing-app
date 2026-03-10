import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Government() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', department_name: '', payment_type: '', amount: '', payment_date: '', notes: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/government?site_id=${siteFilter}` : '/api/government';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/government', form);
    setForm({ site_id: '', department_name: '', payment_type: '', amount: '', payment_date: '', notes: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/government/${id}`); loadItems(); }
  };

  const paymentTypes = ['Tender Deposit', 'Security Deposit', 'Approval Fees', 'Government Charges', 'Other'];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🏛️ Government Payments</h1>
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
            <input placeholder="Department Name" value={form.department_name} onChange={e => setForm({ ...form, department_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Payment Type</option>
              {paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="number" required placeholder="Amount (₹) *" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Department</th>
              <th className="text-left p-3">Type</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Notes</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.department_name}</td>
                <td className="p-3">{item.payment_type}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                <td className="p-3">{item.payment_date}</td>
                <td className="p-3 text-gray-500">{item.notes}</td>
                <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-gray-400">No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../api';

export default function SaleBills() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', bill_number: '', work_description: '', bill_amount: '', bill_date: '', approved_amount: '', payment_status: 'pending', payment_received_date: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/sales?site_id=${siteFilter}` : '/api/sales';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/sales', form);
    setForm({ site_id: '', bill_number: '', work_description: '', bill_amount: '', bill_date: '', approved_amount: '', payment_status: 'pending', payment_received_date: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/sales/${id}`); loadItems(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">💰 Sale Bills</h1>
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
            <input placeholder="Bill Number" value={form.bill_number} onChange={e => setForm({ ...form, bill_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Work Description" value={form.work_description} onChange={e => setForm({ ...form, work_description: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" required placeholder="Bill Amount (₹) *" value={form.bill_amount} onChange={e => setForm({ ...form, bill_amount: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Approved Amount" value={form.approved_amount} onChange={e => setForm({ ...form, approved_amount: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.payment_status} onChange={e => setForm({ ...form, payment_status: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="pending">Pending</option><option value="approved">Approved</option><option value="partial">Partial</option><option value="received">Received</option>
            </select>
            <input type="date" placeholder="Payment Received Date" value={form.payment_received_date} onChange={e => setForm({ ...form, payment_received_date: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Bill #</th>
              <th className="text-left p-3">Description</th>
              <th className="text-right p-3">Bill Amount</th>
              <th className="text-right p-3">Approved</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.bill_number}</td>
                <td className="p-3">{item.work_description}</td>
                <td className="p-3 text-right">₹{Number(item.bill_amount).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.approved_amount).toLocaleString('en-IN')}</td>
                <td className="p-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${item.payment_status === 'received' ? 'bg-green-100 text-green-700' : item.payment_status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {item.payment_status}
                  </span>
                </td>
                <td className="p-3">{item.bill_date}</td>
                <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-gray-400">No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

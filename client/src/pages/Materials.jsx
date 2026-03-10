import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Materials() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', material_name: '', supplier: '', quantity: '', unit: 'bags', rate: '', purchase_date: '', notes: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/materials?site_id=${siteFilter}` : '/api/materials';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = (Number(form.quantity) || 0) * (Number(form.rate) || 0);
    await api.post('/api/materials', { ...form, total_amount: total });
    setForm({ site_id: '', material_name: '', supplier: '', quantity: '', unit: 'bags', rate: '', purchase_date: '', notes: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this record?')) { await api.del(`/api/materials/${id}`); loadItems(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🧱 Material Purchases</h1>
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
            <input required placeholder="Material Name *" value={form.material_name} onChange={e => setForm({ ...form, material_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Supplier" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Rate (₹)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Material</th>
              <th className="text-left p-3">Supplier</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">Rate</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.material_name}</td>
                <td className="p-3">{item.supplier}</td>
                <td className="p-3 text-right">{item.quantity} {item.unit}</td>
                <td className="p-3 text-right">₹{Number(item.rate).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.total_amount).toLocaleString('en-IN')}</td>
                <td className="p-3">{item.purchase_date}</td>
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

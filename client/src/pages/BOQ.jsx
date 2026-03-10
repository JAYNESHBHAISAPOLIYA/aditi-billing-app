import { useState, useEffect } from 'react';
import { api } from '../api';

export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/boq?site_id=${siteFilter}` : '/api/boq';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = (Number(form.quantity) || 0) * (Number(form.rate) || 0);
    const remaining = (Number(form.quantity) || 0) * (1 - (Number(form.work_completed_pct) || 0) / 100);
    await api.post('/api/boq', { ...form, total_amount: total, remaining_work: remaining });
    setForm({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/boq/${id}`); loadItems(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📋 BOQ & Item Tracking</h1>
        <div className="flex gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add Item'}
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
            <input placeholder="Item Number" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Rate (₹)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Work Completed %" min="0" max="100" value={form.work_completed_pct} onChange={e => setForm({ ...form, work_completed_pct: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Actual Cost (₹)" value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Item #</th>
              <th className="text-left p-3">Description</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">Rate</th>
              <th className="text-right p-3">Estimated</th>
              <th className="text-right p-3">Actual</th>
              <th className="text-center p-3">Progress</th>
              <th className="text-right p-3">Remaining</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.item_number}</td>
                <td className="p-3">{item.description}</td>
                <td className="p-3 text-right">{item.quantity} {item.unit}</td>
                <td className="p-3 text-right">₹{Number(item.rate).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right">₹{Number(item.total_amount).toLocaleString('en-IN')}</td>
                <td className={`p-3 text-right font-semibold ${item.actual_cost > item.total_amount ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Number(item.actual_cost).toLocaleString('en-IN')}
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${item.work_completed_pct}%` }}></div>
                    </div>
                    <span className="text-xs">{item.work_completed_pct}%</span>
                  </div>
                </td>
                <td className="p-3 text-right">{Number(item.remaining_work).toFixed(1)} {item.unit}</td>
                <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="9" className="text-center py-8 text-gray-400">No BOQ items found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

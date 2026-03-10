import { useState, useEffect } from 'react';
import { api } from '../api';

export default function FuelExpenses() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', vehicle_name: '', fuel_type: 'diesel', quantity: '', rate: '', expense_date: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/fuel?site_id=${siteFilter}` : '/api/fuel';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = (Number(form.quantity) || 0) * (Number(form.rate) || 0);
    await api.post('/api/fuel', { ...form, total_cost: total });
    setForm({ site_id: '', vehicle_name: '', fuel_type: 'diesel', quantity: '', rate: '', expense_date: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/fuel/${id}`); loadItems(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">⛽ Fuel Expenses</h1>
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
            <input required placeholder="Vehicle/Machine Name *" value={form.vehicle_name} onChange={e => setForm({ ...form, vehicle_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="diesel">Diesel</option><option value="petrol">Petrol</option>
            </select>
            <input type="number" placeholder="Quantity (L)" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Rate (₹/L)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Vehicle</th>
              <th className="text-left p-3">Fuel</th>
              <th className="text-right p-3">Qty (L)</th>
              <th className="text-right p-3">Rate</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.vehicle_name}</td>
                <td className="p-3 capitalize">{item.fuel_type}</td>
                <td className="p-3 text-right">{item.quantity}</td>
                <td className="p-3 text-right">₹{Number(item.rate).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.total_cost).toLocaleString('en-IN')}</td>
                <td className="p-3">{item.expense_date}</td>
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

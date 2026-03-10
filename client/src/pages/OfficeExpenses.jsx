import { useState, useEffect } from 'react';
import { api } from '../api';

export default function OfficeExpenses() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', category: '', amount: '', expense_date: '', description: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/expenses?site_id=${siteFilter}` : '/api/expenses';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/expenses', form);
    setForm({ site_id: '', category: '', amount: '', expense_date: '', description: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/expenses/${id}`); loadItems(); }
  };

  const categories = ['Staff Salary', 'House Rent', 'Kitchen/Food', 'Office Supplies', 'Electricity', 'Internet', 'Other'];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🏢 Office Expenses</h1>
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
            <select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Category *</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" required placeholder="Amount (₹) *" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2 md:col-span-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Category</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Description</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{item.category}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                <td className="p-3">{item.expense_date}</td>
                <td className="p-3 text-gray-500">{item.description}</td>
                <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-gray-400">No records found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

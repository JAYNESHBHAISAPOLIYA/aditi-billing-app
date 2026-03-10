import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ vendor_name: '', contact_number: '', material_type: '', address: '', payment_pending: '', total_purchase: '' });

  useEffect(() => { loadVendors(); }, []);
  const loadVendors = () => api.get('/api/vendors').then(setVendors).catch(console.error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/vendors', form);
    setForm({ vendor_name: '', contact_number: '', material_type: '', address: '', payment_pending: '', total_purchase: '' });
    setShowForm(false);
    loadVendors();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/vendors/${id}`); loadVendors(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🤝 Vendor Management</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Vendor'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input required placeholder="Vendor Name *" value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Contact Number" value={form.contact_number} onChange={e => setForm({ ...form, contact_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Material Type" value={form.material_type} onChange={e => setForm({ ...form, material_type: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Payment Pending (₹)" value={form.payment_pending} onChange={e => setForm({ ...form, payment_pending: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Total Purchase (₹)" value={form.total_purchase} onChange={e => setForm({ ...form, total_purchase: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map(v => (
          <div key={v.id} className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold">{v.vendor_name}</h3>
              <button onClick={() => handleDelete(v.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
            <p className="text-sm text-gray-500">📞 {v.contact_number || 'N/A'}</p>
            <p className="text-sm text-gray-500">📦 {v.material_type || 'N/A'}</p>
            <div className="mt-3 pt-3 border-t flex justify-between text-sm">
              <div>
                <p className="text-gray-400">Total Purchase</p>
                <p className="font-semibold">₹{Number(v.total_purchase || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400">Pending</p>
                <p className={`font-semibold ${v.payment_pending > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{Number(v.payment_pending || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        ))}
        {vendors.length === 0 && <div className="col-span-full bg-white rounded-xl shadow p-8 text-center text-gray-400">No vendors found</div>}
      </div>
    </div>
  );
}

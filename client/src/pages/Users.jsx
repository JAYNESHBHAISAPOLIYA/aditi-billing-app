import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'site_manager', email: '', phone: '', assigned_site_id: '' });

  useEffect(() => {
    api.get('/api/auth/users').then(setUsers).catch(console.error);
    api.get('/api/sites').then(setSites).catch(console.error);
  }, []);

  const loadUsers = () => api.get('/api/auth/users').then(setUsers).catch(console.error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/auth/users', form);
    setForm({ username: '', password: '', full_name: '', role: 'site_manager', email: '', phone: '', assigned_site_id: '' });
    setShowForm(false);
    loadUsers();
  };

  const toggleActive = async (user) => {
    await api.put(`/api/auth/users/${user.id}`, { active: user.active ? 0 : 1 });
    loadUsers();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">👥 User Management</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <input required placeholder="Username *" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input required type="password" placeholder="Password *" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input required placeholder="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="owner">Owner</option>
              <option value="site_manager">Site Manager</option>
              <option value="accountant">Accountant</option>
              <option value="worker">Worker</option>
            </select>
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.assigned_site_id} onChange={e => setForm({ ...form, assigned_site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">No Assigned Site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Create User</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Username</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-center p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{u.full_name}</td>
                <td className="p-3">{u.username}</td>
                <td className="p-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 capitalize">{u.role.replace('_', ' ')}</span>
                </td>
                <td className="p-3">{u.email || '-'}</td>
                <td className="p-3">{u.phone || '-'}</td>
                <td className="p-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3">
                  <button onClick={() => toggleActive(u)} className="text-xs text-blue-600 hover:underline">
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

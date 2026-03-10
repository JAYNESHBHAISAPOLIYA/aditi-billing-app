import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Sites() {
  const { user } = useAuth();
  const [sites, setSites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_name: '', site_location: '', project_type: '', tender_number: '', start_date: '', completion_date: '', estimated_cost: '', contractor_name: '', department_name: '' });

  useEffect(() => { loadSites(); }, []);

  const loadSites = () => api.get('/api/sites').then(setSites).catch(console.error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/sites', form);
    setForm({ site_name: '', site_location: '', project_type: '', tender_number: '', start_date: '', completion_date: '', estimated_cost: '', contractor_name: '', department_name: '' });
    setShowForm(false);
    loadSites();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🏗️ Construction Sites ({sites.length})</h1>
        {user?.role === 'owner' && (
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add Site'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <input required placeholder="Site Name *" value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Location" value={form.site_location} onChange={e => setForm({ ...form, site_location: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Project Type" value={form.project_type} onChange={e => setForm({ ...form, project_type: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Tender Number" value={form.tender_number} onChange={e => setForm({ ...form, tender_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <div><label className="text-xs text-gray-500">Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="border rounded-lg px-3 py-2 w-full" /></div>
            <div><label className="text-xs text-gray-500">Completion Date</label><input type="date" value={form.completion_date} onChange={e => setForm({ ...form, completion_date: e.target.value })} className="border rounded-lg px-3 py-2 w-full" /></div>
            <input type="number" placeholder="Estimated Cost" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Contractor Name" value={form.contractor_name} onChange={e => setForm({ ...form, contractor_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Department Name" value={form.department_name} onChange={e => setForm({ ...form, department_name: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Create Site</button>
        </form>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map(site => (
          <Link key={site.id} to={`/sites/${site.id}`} className="bg-white rounded-xl shadow p-5 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-lg">{site.site_name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${site.status === 'active' ? 'bg-green-100 text-green-700' : site.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {site.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-1">📍 {site.site_location || 'N/A'}</p>
            <p className="text-sm text-gray-500 mb-1">📋 {site.project_type || 'N/A'} | {site.tender_number || 'N/A'}</p>
            <p className="text-sm text-gray-500 mb-1">🏢 {site.department_name || 'N/A'}</p>
            <p className="text-sm text-gray-500 mb-3">👤 {site.manager_name || 'Unassigned'}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${site.progress_percentage || 0}%` }}></div>
              </div>
              <span className="text-sm font-medium">{site.progress_percentage || 0}%</span>
            </div>
            <p className="text-sm text-gray-400 mt-2">Estimated: ₹{Number(site.estimated_cost || 0).toLocaleString('en-IN')}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

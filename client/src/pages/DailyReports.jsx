import { useState, useEffect } from 'react';
import { api } from '../api';

export default function DailyReports() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', report_date: '', work_completed: '', labour_count: '', machinery_used: '', material_used: '', weather: '', problems: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? `/api/daily-reports?site_id=${siteFilter}` : '/api/daily-reports';
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/api/daily-reports', form);
    setForm({ site_id: '', report_date: '', work_completed: '', labour_count: '', machinery_used: '', material_used: '', weather: '', problems: '' });
    setShowForm(false);
    loadItems();
  };

  const weatherOptions = ['Sunny', 'Cloudy', 'Rainy', 'Stormy', 'Foggy', 'Hot', 'Cold'];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📝 Daily Site Reports</h1>
        <div className="flex gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add Report'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input type="date" required value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className="border rounded-lg px-3 py-2" />
            <textarea placeholder="Work Completed Today *" required value={form.work_completed} onChange={e => setForm({ ...form, work_completed: e.target.value })} className="border rounded-lg px-3 py-2 md:col-span-2" rows="3" />
            <input type="number" placeholder="Labour Count" value={form.labour_count} onChange={e => setForm({ ...form, labour_count: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Machinery Used" value={form.machinery_used} onChange={e => setForm({ ...form, machinery_used: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Material Used" value={form.material_used} onChange={e => setForm({ ...form, material_used: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Weather</option>
              {weatherOptions.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <textarea placeholder="Problems / Issues" value={form.problems} onChange={e => setForm({ ...form, problems: e.target.value })} className="border rounded-lg px-3 py-2 md:col-span-2" rows="2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Submit Report</button>
        </form>
      )}

      {/* Timeline View */}
      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="bg-white rounded-xl shadow p-5">
            <div className="flex flex-col sm:flex-row justify-between mb-3">
              <div>
                <span className="text-sm font-semibold text-blue-600">{item.report_date}</span>
                <span className="text-sm text-gray-400 ml-2">by {item.submitted_by_name || 'Unknown'}</span>
              </div>
              <div className="flex items-center gap-3 mt-2 sm:mt-0">
                {item.weather && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">{item.weather}</span>}
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">👷 {item.labour_count || 0} workers</span>
              </div>
            </div>
            <p className="text-gray-700 mb-2">{item.work_completed}</p>
            {item.machinery_used && <p className="text-sm text-gray-500">🚜 Machinery: {item.machinery_used}</p>}
            {item.material_used && <p className="text-sm text-gray-500">🧱 Material: {item.material_used}</p>}
            {item.problems && <p className="text-sm text-red-500 mt-2">⚠️ Issues: {item.problems}</p>}
          </div>
        ))}
        {items.length === 0 && <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No daily reports submitted yet</div>}
      </div>
    </div>
  );
}

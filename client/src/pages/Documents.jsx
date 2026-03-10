import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Documents() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', doc_type: '', doc_name: '' });
  const [file, setFile] = useState(null);

  const docTypes = ['Tender Document', 'BOQ File', 'Agreement', 'Drawing Files', 'Measurement Book', 'Work Orders', 'Site Photos', 'Government Letters', 'Other'];

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter, typeFilter, search]);

  const loadItems = () => {
    let url = '/api/documents?';
    if (siteFilter) url += `site_id=${siteFilter}&`;
    if (typeFilter) url += `doc_type=${typeFilter}&`;
    if (search) url += `search=${search}&`;
    api.get(url).then(setItems).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return alert('Please select a file');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('site_id', form.site_id);
    fd.append('doc_type', form.doc_type);
    fd.append('doc_name', form.doc_name || file.name);
    await api.upload('/api/documents', fd);
    setForm({ site_id: '', doc_type: '', doc_name: '' });
    setFile(null);
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/documents/${id}`); loadItems(); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📄 Document Management</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Upload'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          {docTypes.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input placeholder="🔍 Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48" />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <select required value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Document Type *</option>
              {docTypes.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input placeholder="Document Name" value={form.doc_name} onChange={e => setForm({ ...form, doc_name: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="file" onChange={e => setFile(e.target.files[0])} accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx" className="border rounded-lg px-3 py-2" required />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Upload</button>
        </form>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(doc => (
          <div key={doc.id} className="bg-white rounded-xl shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{doc.doc_type}</span>
              <button onClick={() => handleDelete(doc.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
            <h3 className="font-semibold text-sm mb-1">{doc.doc_name}</h3>
            <p className="text-xs text-gray-400">Uploaded by {doc.uploaded_by_name || 'Unknown'}</p>
            <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</p>
            <a href={`/uploads/${doc.file_path}`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline mt-2 inline-block">
              📥 Download
            </a>
          </div>
        ))}
        {items.length === 0 && <div className="col-span-full bg-white rounded-xl shadow p-8 text-center text-gray-400">No documents found</div>}
      </div>
    </div>
  );
}

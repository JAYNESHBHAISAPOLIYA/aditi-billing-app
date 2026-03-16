import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
  const [sorMatches, setSorMatches] = useState([]);
  const [sorLoading, setSorLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSiteId, setUploadSiteId] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

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
    setSorMatches([]);
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete?')) { await api.del(`/api/boq/${id}`); loadItems(); }
  };

  // SOR rate matching on description change
  const handleDescriptionChange = async (desc) => {
    setForm(f => ({ ...f, description: desc }));
    if (desc.length < 4) { setSorMatches([]); return; }
    setSorLoading(true);
    try {
      const matches = await api.get(`/api/ai/sor-match?description=${encodeURIComponent(desc)}`);
      setSorMatches(matches || []);
    } catch {
      setSorMatches([]);
    } finally {
      setSorLoading(false);
    }
  };

  const applySorRate = (sor) => {
    setForm(f => ({ ...f, rate: sor.rate, unit: f.unit || sor.unit }));
    setSorMatches([]);
  };

  // PDF BOQ upload
  const handleUpload = async (file) => {
    if (!uploadSiteId) { setUploadError('Please select a site first.'); return; }
    if (!file || !file.name.endsWith('.pdf')) { setUploadError('Only PDF files are supported.'); return; }
    setUploading(true);
    setUploadResult(null);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await api.upload(`/api/ai/upload-boq/${uploadSiteId}`, formData);
      setUploadResult(result);
      loadItems();
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
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

      {/* AI BOQ PDF Upload */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <h2 className="font-semibold mb-3 text-gray-700">🤖 AI BOQ Upload — Extract items from PDF</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <select value={uploadSiteId} onChange={e => setUploadSiteId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Select Site for Upload *</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
        </div>
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); }} />
          {uploading ? (
            <div className="text-blue-600">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="font-medium">Extracting BOQ items with AI... please wait</p>
            </div>
          ) : (
            <>
              <p className="text-3xl mb-2">📄</p>
              <p className="font-medium text-gray-700">Drag & drop BOQ PDF or click to upload</p>
              <p className="text-sm text-gray-500 mt-1">AI will extract all items and auto-match SOR rates</p>
            </>
          )}
        </div>
        {uploadError && <p className="text-red-600 text-sm mt-2">⚠️ {uploadError}</p>}
        {uploadResult && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-700 font-medium">✅ Extracted {uploadResult.items_extracted} items, saved {uploadResult.items_saved} to BOQ</p>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {(uploadResult.items || []).map((item, i) => (
                <div key={i} className="text-xs text-gray-600 flex justify-between">
                  <span>{item.description}</span>
                  <span className="text-gray-500">
                    {item.sor_match ? `SOR: ₹${Number(item.sor_match.rate).toLocaleString('en-IN')}/${item.unit} (${item.sor_match.confidence}%)` : `₹${Number(item.sor_rate).toLocaleString('en-IN')}/${item.unit}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold mb-3 text-gray-700">Add BOQ Item</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input placeholder="Item Number" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <div className="relative md:col-span-1">
              <input
                placeholder="Description"
                value={form.description}
                onChange={e => handleDescriptionChange(e.target.value)}
                className="border rounded-lg px-3 py-2 w-full"
              />
              {/* SOR Suggestions */}
              {sorLoading && <p className="text-xs text-blue-500 mt-1">Searching SOR rates...</p>}
              {sorMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <p className="text-xs text-gray-500 px-3 pt-2 pb-1 font-medium">SOR Rate Suggestions:</p>
                  {sorMatches.map(sor => (
                    <button
                      key={sor.id}
                      type="button"
                      onClick={() => applySorRate(sor)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-t"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-gray-700 flex-1 mr-2">{sor.description}</span>
                        <span className="text-blue-600 font-medium whitespace-nowrap">₹{Number(sor.rate).toLocaleString('en-IN')}/{sor.unit}</span>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sor.confidence > 70 ? 'bg-green-100 text-green-700' : sor.confidence > 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                        {sor.confidence}% match · {sor.item_code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

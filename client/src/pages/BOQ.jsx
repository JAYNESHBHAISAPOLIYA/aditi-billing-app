import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

// ─────────────────────────────────────────────────────────────────
// SOR Rate Matcher sub-component
// ─────────────────────────────────────────────────────────────────
function SORMatcher({ item, onOverride }) {
  const [editing, setEditing] = useState(false);
  const [sorRates, setSorRates] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const openMatcher = async () => {
    if (!sorRates.length) {
      const data = await api.get('/api/boq/sor-rates').catch(() => []);
      setSorRates(data || []);
      setResults(data || []);
    }
    setEditing(true);
  };

  const search = async () => {
    setLoading(true);
    const data = await api.get(`/api/boq/sor-rates?q=${encodeURIComponent(q)}`).catch(() => []);
    setResults(data || []);
    setLoading(false);
  };

  const pick = (sor) => {
    onOverride(item.id, sor.rate, sor.id);
    setEditing(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <span className="font-semibold">₹{Number(item.rate || 0).toLocaleString('en-IN')}</span>
        {item.sor_match_pct > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.sor_match_pct >= 60 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {item.sor_match_pct}%
          </span>
        )}
        <button onClick={openMatcher} className="text-blue-500 text-xs hover:underline ml-1">SOR</button>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center" onClick={() => setEditing(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">SOR Rate Matcher</h3>
              <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Item: <strong>{item.description}</strong></p>
            <div className="flex gap-2 mb-4">
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Search SOR rates..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={search} disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {loading ? '...' : 'Search'}
              </button>
            </div>
            <div className="overflow-y-auto max-h-64 divide-y">
              {results.map(sor => (
                <div key={sor.id} className="py-3 flex justify-between items-start hover:bg-gray-50 cursor-pointer px-2 rounded" onClick={() => pick(sor)}>
                  <div>
                    <p className="text-sm font-medium">{sor.description}</p>
                    <p className="text-xs text-gray-400">{sor.item_code} - {sor.category} - {sor.unit}</p>
                  </div>
                  <span className="text-green-700 font-bold text-sm ml-3 shrink-0">Rs.{Number(sor.rate).toLocaleString('en-IN')}/{sor.unit}</span>
                </div>
              ))}
              {results.length === 0 && <p className="text-center text-gray-400 py-4 text-sm">No rates found</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// BOQ Upload sub-component
// ─────────────────────────────────────────────────────────────────
function BOQUpload({ siteId, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const processFile = async (file) => {
    if (!file) return;
    if (!siteId) { setError('Please select a site first'); return; }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.pdf') { setError('Only PDF files are supported for BOQ upload'); return; }
    setUploading(true); setProgress(10); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      setProgress(40);
      const data = await api.upload(`/api/ai/upload-boq/${siteId}`, form);
      setProgress(100);
      setResult(data);
      onUploaded();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); };

  return (
    <div className="mb-6">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
      >
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => processFile(e.target.files[0])} />
        <div className="text-4xl mb-2">{uploading ? '...' : 'PDF'}</div>
        <p className="font-medium text-gray-700">{uploading ? 'AI is processing your BOQ...' : 'Upload BOQ PDF'}</p>
        <p className="text-sm text-gray-400 mt-1">{uploading ? 'Extracting items and matching SOR rates' : 'Drag and drop or click to select PDF'}</p>
        {uploading && (
          <div className="mt-4 mx-auto w-64">
            <div className="bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{progress}%</p>
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      {result && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700 font-medium">BOQ uploaded successfully</p>
          <p className="text-sm text-green-600 mt-1">{result.items_extracted} items extracted - {result.items_saved} items saved to database</p>
          {result.items && result.items.slice(0, 3).map((it, i) => (
            <p key={i} className="text-xs text-gray-500 mt-1">- {it.description} - {it.sor_match ? `SOR matched at ${it.sor_match.match_pct}%` : 'No SOR match'}</p>
          ))}
          {result.items && result.items.length > 3 && <p className="text-xs text-gray-400 mt-1">...and {result.items.length - 3} more items</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// DPR Upload sub-component
// ─────────────────────────────────────────────────────────────────
function DPRUpload({ siteId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const processFile = async (file) => {
    if (!file || !siteId) { setError('Select site first'); return; }
    setUploading(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api.upload(`/api/ai/upload-dpr/${siteId}`, form);
      setResult(data);
      onUploaded();
    } catch (err) {
      setError(err.message || 'DPR upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading || !siteId}
        className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50"
      >
        {uploading ? 'Processing DPR...' : 'Upload DPR'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => processFile(e.target.files[0])} />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      {result && (
        <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <p className="text-green-700 font-medium">DPR processed</p>
          <p className="text-xs text-green-600">{result.boq_items_updated?.length || 0} BOQ items updated</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main BOQ Page
// ─────────────────────────────────────────────────────────────────
export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSORTable, setShowSORTable] = useState(false);
  const [sorRates, setSorRates] = useState([]);
  const [sorSearch, setSorSearch] = useState('');
  const [sorLoading, setSorLoading] = useState(false);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
  const [downloading, setDownloading] = useState(false);

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
    if (confirm('Delete this BOQ item?')) { await api.del(`/api/boq/${id}`); loadItems(); }
  };

  const handleSOROverride = async (itemId, newRate) => {
    await api.put(`/api/boq/${itemId}`, { rate: newRate });
    loadItems();
  };

  const loadSORRates = async (q) => {
    setSorLoading(true);
    const searchQ = q !== undefined ? q : sorSearch;
    const data = await api.get(`/api/boq/sor-rates?q=${encodeURIComponent(searchQ)}`).catch(() => []);
    setSorRates(data || []);
    setSorLoading(false);
  };

  const handleShowSOR = () => {
    setShowSORTable(!showSORTable);
    if (!showSORTable && sorRates.length === 0) loadSORRates('');
  };

  const downloadRaBill = async () => {
    if (!siteFilter) { alert('Please select a site first'); return; }
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const today = new Date().toISOString().split('T')[0];
      const url = `/api/boq/ra-bill/${siteFilter}?bill_no=1&bill_date=${today}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Download failed'); }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `RA_Bill_${siteFilter}_${today}.xlsx`;
      a.click();
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  };

  const totalEstimated = items.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0);
  const avgProgress = items.length > 0 ? items.reduce((s, i) => s + (i.work_completed_pct || 0), 0) / items.length : 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">BOQ and Item Tracking</h1>
        <div className="flex flex-wrap gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={() => { setShowUpload(!showUpload); setShowForm(false); }}
            className={`px-4 py-2 rounded-lg text-sm ${showUpload ? 'bg-gray-200' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
            {showUpload ? 'Hide Upload' : 'AI Upload BOQ'}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowUpload(false); }}
            className={`px-4 py-2 rounded-lg text-sm ${showForm ? 'bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {showForm ? 'Cancel' : '+ Add Item'}
          </button>
          <button onClick={handleShowSOR} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
            SOR Rates
          </button>
          {siteFilter && (
            <>
              <DPRUpload siteId={siteFilter} onUploaded={loadItems} />
              <button onClick={downloadRaBill} disabled={downloading}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                {downloading ? 'Generating...' : 'RA Bill Excel'}
              </button>
            </>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Total Items</p>
            <p className="text-2xl font-bold text-blue-600">{items.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Estimated Value</p>
            <p className="text-lg font-bold text-gray-800">Rs.{totalEstimated.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Actual Cost</p>
            <p className={`text-lg font-bold ${totalActual > totalEstimated ? 'text-red-600' : 'text-green-600'}`}>Rs.{totalActual.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Avg Progress</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full" style={{ width: `${avgProgress}%` }} /></div>
              <span className="text-sm font-bold">{avgProgress.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-bold text-lg mb-4">AI-Powered BOQ Extraction</h2>
          <p className="text-sm text-gray-500 mb-4">Upload a BOQ PDF - AI will extract all items and automatically match Gujarat PWD SOR 2024-25 rates.</p>
          <BOQUpload siteId={siteFilter} onUploaded={() => { loadItems(); setShowUpload(false); }} />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-bold text-lg mb-4">Add BOQ Item</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input placeholder="Item Number" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Rate (Rs.)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Work Completed %" min="0" max="100" value={form.work_completed_pct} onChange={e => setForm({ ...form, work_completed_pct: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Actual Cost (Rs.)" value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save</button>
        </form>
      )}

      {showSORTable && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">SOR Rates (Gujarat PWD 2024-25)</h2>
            <button onClick={() => setShowSORTable(false)} className="text-gray-400 hover:text-gray-600">Close</button>
          </div>
          <div className="flex gap-2 mb-4">
            <input value={sorSearch} onChange={e => setSorSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadSORRates(sorSearch)}
              placeholder="Search SOR rates..." className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => loadSORRates(sorSearch)} disabled={sorLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {sorLoading ? '...' : 'Search'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-center p-3">Unit</th>
                  <th className="text-right p-3">Rate (Rs.)</th>
                  <th className="text-left p-3">Category</th>
                </tr>
              </thead>
              <tbody>
                {sorRates.map(sor => (
                  <tr key={sor.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{sor.item_code}</td>
                    <td className="p-3">{sor.description}</td>
                    <td className="p-3 text-center">{sor.unit}</td>
                    <td className="p-3 text-right font-semibold text-green-700">Rs.{Number(sor.rate).toLocaleString('en-IN')}</td>
                    <td className="p-3 text-xs text-gray-500">{sor.category}</td>
                  </tr>
                ))}
                {sorRates.length === 0 && <tr><td colSpan="5" className="text-center py-6 text-gray-400">No SOR rates found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Item #</th>
              <th className="text-left p-3">Description</th>
              <th className="text-right p-3">Tender Qty</th>
              <th className="text-right p-3">Used Qty</th>
              <th className="text-right p-3">Balance</th>
              <th className="text-right p-3">SOR Rate</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-center p-3">Progress</th>
              <th className="text-right p-3">Actual</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const balance = (item.quantity || 0) - (item.qty_used || 0);
              return (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium text-xs">{item.item_number || '-'}</td>
                  <td className="p-3 max-w-xs">
                    <p className="truncate">{item.description}</p>
                    {item.source_doc && <p className="text-xs text-gray-400 truncate">{item.source_doc}</p>}
                  </td>
                  <td className="p-3 text-right">{Number(item.quantity || 0).toLocaleString('en-IN')} {item.unit}</td>
                  <td className="p-3 text-right text-blue-600">{Number(item.qty_used || 0).toLocaleString('en-IN')} {item.unit}</td>
                  <td className={`p-3 text-right font-medium ${balance < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {Number(balance).toLocaleString('en-IN')} {item.unit}
                  </td>
                  <td className="p-3 text-right">
                    <SORMatcher item={item} onOverride={handleSOROverride} />
                  </td>
                  <td className="p-3 text-right">Rs.{Number(item.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${item.work_completed_pct >= 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.min(100, item.work_completed_pct || 0)}%` }} />
                      </div>
                      <span className="text-xs">{Math.round(item.work_completed_pct || 0)}%</span>
                    </div>
                  </td>
                  <td className={`p-3 text-right font-semibold ${(item.actual_cost || 0) > (item.total_amount || 0) ? 'text-red-600' : 'text-green-600'}`}>
                    Rs.{Number(item.actual_cost || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan="10" className="text-center py-10 text-gray-400">
                <p className="text-lg mb-1">No BOQ items found</p>
                <p className="text-xs">Use AI Upload BOQ to extract items from a PDF, or add manually</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

function SORMatchBadge({ score }) {
  if (!score) return null;
  const color = score >= 80 ? 'bg-green-100 text-green-800' : score >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{score}% match</span>;
}

export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [tab, setTab] = useState('table');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
  const [sorRates, setSorRates] = useState([]);
  const [sorSearch, setSorSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSiteId, setUploadSiteId] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  useEffect(() => {
    if (tab === 'sor') loadSOR();
  }, [tab, sorSearch]);

  const loadItems = () => {
    const url = siteFilter ? `/api/boq?site_id=${siteFilter}` : '/api/boq';
    api.get(url).then(setItems).catch(console.error);
  };

  const loadSOR = () => {
    const url = sorSearch ? `/api/sor?q=${encodeURIComponent(sorSearch)}` : '/api/sor';
    api.get(url).then(setSorRates).catch(console.error);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const total = (Number(form.quantity) || 0) * (Number(form.rate) || 0);
    const remaining = (Number(form.quantity) || 0) * (1 - (Number(form.work_completed_pct) || 0) / 100);
    await api.post('/api/boq', { ...form, total_amount: total, remaining_work: remaining, qty_tender: form.quantity, sor_rate: form.rate });
    setForm({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this BOQ item?')) { await api.del(`/api/boq/${id}`); loadItems(); }
  };

  const handleFileUpload = async (file) => {
    if (!uploadSiteId) { alert('Please select a site first'); return; }
    if (!file) return;
    setUploading(true);
    setUploadProgress('Uploading PDF...');
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploadProgress('AI is extracting BOQ items and matching SOR rates...');
      const result = await api.upload(`/api/ai/upload-boq/${uploadSiteId}`, formData);
      setUploadResult(result);
      setUploadProgress('');
      if (siteFilter === uploadSiteId || !siteFilter) loadItems();
    } catch (err) {
      setUploadProgress('');
      setUploadResult({ error: err.message });
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const totalBOQ = items.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0);
  const avgProgress = items.length ? items.reduce((s, i) => s + (i.work_completed_pct || 0), 0) / items.length : 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📋 BOQ & SOR Management</h1>
        <div className="flex gap-2 flex-wrap">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          {tab === 'table' && (
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              {showForm ? 'Cancel' : '+ Add Item'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b">
        {[['table', '📊 BOQ Table'], ['upload', '🤖 AI Upload'], ['sor', '📖 SOR Rates']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === id ? 'bg-white border border-b-white text-blue-600 -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'table' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="text-xs text-gray-500">Total Items</div>
              <div className="text-xl font-bold text-blue-700 mt-1">{items.length}</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <div className="text-xs text-gray-500">Estimated Value</div>
              <div className="text-xl font-bold text-green-700 mt-1">₹{Number(totalBOQ).toLocaleString('en-IN')}</div>
            </div>
            <div className={`rounded-xl p-4 border ${totalActual > totalBOQ ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
              <div className="text-xs text-gray-500">Actual Cost</div>
              <div className={`text-xl font-bold mt-1 ${totalActual > totalBOQ ? 'text-red-700' : 'text-emerald-700'}`}>₹{Number(totalActual).toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <div className="text-xs text-gray-500">Avg Progress</div>
              <div className="text-xl font-bold text-purple-700 mt-1">{avgProgress.toFixed(1)}%</div>
            </div>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
              <h3 className="font-semibold mb-4">Add BOQ Item</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
                  <option value="">Select Site *</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
                </select>
                <input placeholder="Item Number" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input placeholder="Unit (RM/Nos/Cum)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input type="number" placeholder="Rate (₹)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input type="number" placeholder="Work Completed %" min="0" max="100" value={form.work_completed_pct} onChange={e => setForm({ ...form, work_completed_pct: e.target.value })} className="border rounded-lg px-3 py-2" />
                <input type="number" placeholder="Actual Cost (₹)" value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} className="border rounded-lg px-3 py-2" />
              </div>
              <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save Item</button>
            </form>
          )}

          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Item #</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Unit</th>
                  <th className="text-right p-3">Tender Qty</th>
                  <th className="text-right p-3">Used</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-right p-3">SOR Rate</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-center p-3">Progress</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const tender = item.qty_tender || item.quantity || 0;
                  const used = item.qty_used || 0;
                  const balance = Math.max(0, tender - used);
                  return (
                    <tr key={item.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{item.item_number}</td>
                      <td className="p-3">
                        <div>{item.description}</div>
                        {item.sor_match_score > 0 && <SORMatchBadge score={item.sor_match_score} />}
                      </td>
                      <td className="p-3">{item.unit}</td>
                      <td className="p-3 text-right">{Number(tender).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right">{Number(used).toLocaleString('en-IN')}</td>
                      <td className={`p-3 text-right font-medium ${balance === 0 ? 'text-green-600' : 'text-blue-600'}`}>{Number(balance).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right">
                        <div>₹{Number(item.sor_rate || item.rate || 0).toLocaleString('en-IN')}</div>
                        {item.sor_rate && item.sor_rate !== item.rate && (
                          <div className="text-xs text-gray-400">Orig: ₹{Number(item.rate).toLocaleString('en-IN')}</div>
                        )}
                      </td>
                      <td className="p-3 text-right">₹{Number(item.total_amount).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min(100, item.work_completed_pct || 0)}%` }}></div>
                          </div>
                          <span className="text-xs">{Number(item.work_completed_pct || 0).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-3"><button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button></td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan="10" className="text-center py-8 text-gray-400">No BOQ items. Use AI Upload tab to extract from PDF.</td></tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan="7" className="p-3">Total</td>
                    <td className="p-3 text-right">₹{Number(totalBOQ).toLocaleString('en-IN')}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {siteFilter && (
            <div className="mt-4 flex gap-3 items-center">
              <span className="text-sm text-gray-600">Generate RA Bill:</span>
              <a
                href={`/api/ra-bill/${siteFilter}?bill_no=1`}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700"
                download
              >
                📥 Download Excel
              </a>
            </div>
          )}
        </>
      )}

      {tab === 'upload' && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-xl shadow p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4">🤖 AI-Powered BOQ Extraction</h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a BOQ PDF. The AI will extract all line items and automatically match them to Gujarat PWD SOR 2024-25 rates.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Site *</label>
              <select value={uploadSiteId} onChange={e => setUploadSiteId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                <option value="">-- Select Site --</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
              </select>
            </div>

            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="font-medium text-gray-700">Drag & drop BOQ PDF here</p>
              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
              <p className="text-xs text-gray-400 mt-2">PDF files only, max 10MB</p>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => handleFileUpload(e.target.files[0])} />
            </div>

            {uploading && (
              <div className="mt-4 bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin text-blue-600 text-xl">⟳</div>
                  <div className="text-sm text-blue-700 font-medium">{uploadProgress}</div>
                </div>
                <div className="mt-2 bg-blue-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                </div>
              </div>
            )}

            {uploadResult && (
              <div className={`mt-4 rounded-lg p-4 ${uploadResult.error ? 'bg-red-50' : 'bg-green-50'}`}>
                {uploadResult.error ? (
                  <div>
                    <div className="font-medium text-red-700">❌ Error</div>
                    <div className="text-sm text-red-600 mt-1">{uploadResult.error}</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-green-700">✅ Extraction Complete!</div>
                    <div className="text-sm text-green-600 mt-1">
                      Extracted {uploadResult.extracted_count} items, saved {uploadResult.saved_count} to database
                    </div>
                    {uploadResult.items && uploadResult.items.length > 0 && (
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        {uploadResult.items.map((item, i) => (
                          <div key={i} className="text-xs bg-white rounded p-2 border border-green-200">
                            <div className="font-medium">{item.sr_no}. {item.description}</div>
                            <div className="text-gray-500 flex gap-3 mt-1">
                              <span>Qty: {item.quantity} {item.unit}</span>
                              <span>Rate: ₹{Number(item.sor_rate).toLocaleString('en-IN')}</span>
                              {item.sor_match && <SORMatchBadge score={item.sor_match.score} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setTab('table')} className="mt-3 bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700">
                      View BOQ Table →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold text-lg mb-2">📝 DPR Upload (Auto BOQ Update)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a Daily Progress Report (PDF or image). AI extracts progress data and updates BOQ quantities.
            </p>
            <DPRUpload sites={sites} onSuccess={loadItems} />
          </div>
        </div>
      )}

      {tab === 'sor' && (
        <div>
          <div className="flex gap-3 mb-4">
            <input
              value={sorSearch}
              onChange={e => setSorSearch(e.target.value)}
              placeholder="Search SOR rates (e.g., DI pipe, valve, PCC)..."
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-left p-3">Unit</th>
                  <th className="text-right p-3">Rate (₹)</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Year</th>
                </tr>
              </thead>
              <tbody>
                {sorRates.map(r => (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs font-medium text-blue-700">{r.item_code}</td>
                    <td className="p-3">{r.description}</td>
                    <td className="p-3">{r.unit}</td>
                    <td className="p-3 text-right font-semibold">₹{Number(r.rate).toLocaleString('en-IN')}</td>
                    <td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{r.category}</span></td>
                    <td className="p-3 text-gray-500">{r.year}</td>
                  </tr>
                ))}
                {sorRates.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-8 text-gray-400">No SOR rates found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DPRUpload({ sites, onSuccess }) {
  const [siteId, setSiteId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const handleUpload = async (file) => {
    if (!siteId) { alert('Select a site first'); return; }
    if (!file) return;
    setUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.upload(`/api/ai/upload-dpr/${siteId}`, formData);
      setResult(res);
      if (onSuccess) onSuccess();
    } catch (err) {
      setResult({ error: err.message });
    }
    setUploading(false);
  };

  return (
    <div>
      <div className="mb-3">
        <select value={siteId} onChange={e => setSiteId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
          <option value="">-- Select Site --</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
      </div>
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400"
        onClick={() => fileRef.current?.click()}
      >
        <div className="text-2xl mb-2">📸</div>
        <p className="text-sm text-gray-600">Upload DPR (PDF or image)</p>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleUpload(e.target.files[0])} />
      </div>
      {uploading && <div className="mt-2 text-sm text-blue-600 animate-pulse">AI is extracting DPR data...</div>}
      {result && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {result.error ? `❌ ${result.error}` : `✅ DPR saved. Updated ${result.boq_updates ? result.boq_updates.length : 0} BOQ item(s).`}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

function BOQUpload({ sites, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!siteId) { setError('Please select a site first'); return; }
    if (!file || file.type !== 'application/pdf') { setError('Please upload a PDF file'); return; }
    setError(''); setUploading(true); setProgress(10);
    const fd = new FormData();
    fd.append('file', file);
    try {
      setProgress(40);
      const data = await api.upload('/api/ai/upload-boq/' + siteId, fd);
      setProgress(100);
      setResult(data);
      onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">🤖 AI BOQ Upload (Auto-extract + SOR Match)</h2>
      <div className="mb-3">
        <select required value={siteId} onChange={e => setSiteId(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
          <option value="">Select Site *</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
      </div>
      <div
        className={'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ' + (dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        <div className="text-4xl mb-2">📄</div>
        <p className="text-gray-600">Drag &amp; drop BOQ PDF here, or click to browse</p>
        <p className="text-sm text-gray-400 mt-1">AI will extract items &amp; auto-match SOR rates</p>
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      </div>
      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1"><span>Processing...</span><span>{progress}%</span></div>
          <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: progress + '%' }}></div></div>
        </div>
      )}
      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="mt-4 bg-green-50 rounded-lg p-4">
          <p className="text-green-700 font-medium">✅ Extracted {result.count} BOQ items {result.mock ? '(demo mode — add ANTHROPIC_API_KEY for real AI)' : 'using AI'}</p>
          <SORMatcher items={result.extracted} />
        </div>
      )}
    </div>
  );
}

function SORMatcher({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left p-2">Sr</th>
            <th className="text-left p-2">Description</th>
            <th className="text-left p-2">Unit</th>
            <th className="text-right p-2">Qty</th>
            <th className="text-right p-2">SOR Rate</th>
            <th className="text-right p-2">Amount</th>
            <th className="text-center p-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{item.sr_no}</td>
              <td className="p-2">{item.description}</td>
              <td className="p-2">{item.unit}</td>
              <td className="p-2 text-right">{Number(item.quantity).toLocaleString('en-IN')}</td>
              <td className="p-2 text-right">₹{Number(item.sor_rate).toLocaleString('en-IN')}</td>
              <td className="p-2 text-right">₹{Number(item.total_amount).toLocaleString('en-IN')}</td>
              <td className="p-2 text-center">
                {item.confidence > 0 ? (
                  <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + (item.confidence >= 70 ? 'bg-green-100 text-green-700' : item.confidence >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                    {item.confidence}%
                  </span>
                ) : <span className="text-gray-400">Manual</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BOQTable({ items, onDelete }) {
  if (items.length === 0) return <div className="text-center py-8 text-gray-400">No BOQ items found</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3">Sr #</th>
            <th className="text-left p-3">Description</th>
            <th className="text-left p-3">Unit</th>
            <th className="text-right p-3">Tender Qty</th>
            <th className="text-right p-3">Used Qty</th>
            <th className="text-right p-3">Balance</th>
            <th className="text-right p-3">SOR Rate</th>
            <th className="text-right p-3">Amount</th>
            <th className="text-center p-3">Progress</th>
            <th className="text-left p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(function(item) {
            var qtyTender = item.qty_tender || item.quantity || 0;
            var qtyUsed = item.qty_used || 0;
            var balance = qtyTender - qtyUsed;
            var sorRate = item.sor_rate || item.rate || 0;
            var pct = item.work_completed_pct || 0;
            return (
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium text-blue-700">{item.item_number}</td>
                <td className="p-3 max-w-xs">
                  <div>{item.description}</div>
                  {item.sor_item_code && <div className="text-xs text-gray-400">SOR: {item.sor_item_code}</div>}
                </td>
                <td className="p-3">{item.unit}</td>
                <td className="p-3 text-right">{Number(qtyTender).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right text-blue-600">{Number(qtyUsed).toLocaleString('en-IN')}</td>
                <td className={'p-3 text-right font-medium ' + (balance < 0 ? 'text-red-600' : 'text-green-600')}>{Number(balance).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right">₹{Number(sorRate).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right font-semibold">₹{Number(item.total_amount || 0).toLocaleString('en-IN')}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div className={'h-2 rounded-full ' + (pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-yellow-500')} style={{ width: Math.min(100, pct) + '%' }}></div>
                    </div>
                    <span className="text-xs">{Number(pct).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="p-3">
                  <button onClick={() => onDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DPRUpload({ sites, onUploaded }) {
  const [siteId, setSiteId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!siteId) { setError('Please select a site first'); return; }
    if (!file) return;
    setError(''); setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await api.upload('/api/ai/upload-dpr/' + siteId, fd);
      setResult(data);
      onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">📊 DPR Upload (Auto-update BOQ Progress)</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <select value={siteId} onChange={e => setSiteId(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="">Select Site *</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
        </select>
        <button
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={!siteId || uploading}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {uploading ? 'Processing...' : '📤 Upload DPR (PDF/Image)'}
        </button>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => handleFile(e.target.files[0])} />
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="mt-4 bg-purple-50 rounded-lg p-4 text-sm">
          <p className="font-medium text-purple-700">✅ DPR Processed — {(result.boq_updated && result.boq_updated.length) || 0} BOQ items updated</p>
          {result.dpr && (
            <div className="mt-2 text-gray-600">
              <div>Date: {result.dpr.date} | Weather: {result.dpr.weather}</div>
              <div>Labour: {(result.dpr.labour && result.dpr.labour.skilled) || 0} skilled + {(result.dpr.labour && result.dpr.labour.unskilled) || 0} unskilled = ₹{Number((result.dpr.labour && result.dpr.labour.amount) || 0).toLocaleString('en-IN')}</div>
              {result.dpr.remarks && <div>Remarks: {result.dpr.remarks}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDPR, setShowDPR] = useState(false);
  const [activeTab, setActiveTab] = useState('items');
  const [sorRates, setSorRates] = useState([]);
  const [dprRecords, setDprRecords] = useState([]);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
    loadItems();
  }, [siteFilter]);

  useEffect(() => {
    if (activeTab === 'sor') loadSorRates();
    if (activeTab === 'dpr') loadDPR();
  }, [activeTab, siteFilter]);

  const loadItems = () => {
    const url = siteFilter ? '/api/boq?site_id=' + siteFilter : '/api/boq';
    api.get(url).then(setItems).catch(console.error);
  };

  const loadSorRates = () => {
    api.get('/api/sor').then(setSorRates).catch(console.error);
  };

  const loadDPR = () => {
    const url = siteFilter ? '/api/dpr?site_id=' + siteFilter : '/api/dpr';
    api.get(url).then(setDprRecords).catch(console.error);
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
    if (confirm('Delete this BOQ item?')) { await api.del('/api/boq/' + id); loadItems(); }
  };

  const downloadRaBill = () => {
    if (!siteFilter) { alert('Please select a site to download RA Bill'); return; }
    var today = new Date().toISOString().split('T')[0];
    window.open('/api/ra-bill/' + siteFilter + '?bill_no=1&bill_period_from=' + today + '&bill_period_to=' + today + '&bill_date=' + today, '_blank');
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const totalUsedValue = items.reduce((sum, i) => sum + ((i.qty_used || 0) * (i.sor_rate || i.rate || 0)), 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📋 BOQ &amp; Item Tracking</h1>
        <div className="flex flex-wrap gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          <button onClick={() => { setShowUpload(!showUpload); setShowDPR(false); setShowForm(false); }} className={'px-4 py-2 rounded-lg text-sm ' + (showUpload ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700')}>
            🤖 AI Upload BOQ
          </button>
          <button onClick={() => { setShowDPR(!showDPR); setShowUpload(false); setShowForm(false); }} className={'px-4 py-2 rounded-lg text-sm ' + (showDPR ? 'bg-gray-200 text-gray-700' : 'bg-purple-600 text-white hover:bg-purple-700')}>
            📊 Upload DPR
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowUpload(false); setShowDPR(false); }} className={'px-4 py-2 rounded-lg text-sm ' + (showForm ? 'bg-gray-200 text-gray-700' : 'bg-green-600 text-white hover:bg-green-700')}>
            + Manual Add
          </button>
          {siteFilter && (
            <button onClick={downloadRaBill} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700">
              📥 RA Bill Excel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Total Items</p>
          <p className="text-2xl font-bold text-blue-600">{items.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">BOQ Value</p>
          <p className="text-xl font-bold text-gray-800">₹{Number(totalAmount).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Work Done Value</p>
          <p className="text-xl font-bold text-green-600">₹{Number(totalUsedValue).toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-sm text-gray-500">Balance</p>
          <p className="text-xl font-bold text-orange-600">₹{Number(totalAmount - totalUsedValue).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {showUpload && <BOQUpload sites={sites} onUploaded={() => { loadItems(); setShowUpload(false); }} />}
      {showDPR && <DPRUpload sites={sites} onUploaded={() => { loadItems(); setShowDPR(false); }} />}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add BOQ Item Manually</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input placeholder="Item Number (e.g. B-1-1)" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Unit (RM, Nos, CUM...)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="SOR Rate (₹)" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Work Completed %" min="0" max="100" value={form.work_completed_pct} onChange={e => setForm({ ...form, work_completed_pct: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Actual Cost (₹)" value={form.actual_cost} onChange={e => setForm({ ...form, actual_cost: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">Save Item</button>
        </form>
      )}

      <div className="flex gap-2 mb-4 border-b">
        {[['items', '📋 BOQ Items'], ['sor', '📖 SOR Rates'], ['dpr', '📊 DPR Records']].map(function(tabInfo) {
          var tab = tabInfo[0]; var label = tabInfo[1];
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        {activeTab === 'items' && <BOQTable items={items} onDelete={handleDelete} />}
        {activeTab === 'sor' && (
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
              {sorRates.map(sor => (
                <tr key={sor.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium text-blue-700">{sor.item_code}</td>
                  <td className="p-3">{sor.description}</td>
                  <td className="p-3">{sor.unit}</td>
                  <td className="p-3 text-right font-semibold">₹{Number(sor.rate).toLocaleString('en-IN')}</td>
                  <td className="p-3">{sor.category}</td>
                  <td className="p-3 text-gray-500">{sor.state} {sor.year}</td>
                </tr>
              ))}
              {sorRates.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-gray-400">No SOR rates found</td></tr>}
            </tbody>
          </table>
        )}
        {activeTab === 'dpr' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Work Done</th>
                <th className="text-right p-3">Labour (S/U)</th>
                <th className="text-right p-3">Labour Amount</th>
                <th className="text-left p-3">Weather</th>
                <th className="text-left p-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {dprRecords.map(dpr => (
                <tr key={dpr.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{dpr.report_date}</td>
                  <td className="p-3 max-w-xs">
                    {Array.isArray(dpr.work_done) ? dpr.work_done.map((w, i) => (
                      <div key={i} className="text-xs">{w.item} — {w.qty} {w.unit}</div>
                    )) : '-'}
                  </td>
                  <td className="p-3 text-right">{dpr.labour_skilled}/{dpr.labour_unskilled}</td>
                  <td className="p-3 text-right">₹{Number(dpr.labour_amount).toLocaleString('en-IN')}</td>
                  <td className="p-3">{dpr.weather}</td>
                  <td className="p-3 text-gray-500 text-xs">{dpr.remarks}</td>
                </tr>
              ))}
              {dprRecords.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-gray-400">No DPR records found</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

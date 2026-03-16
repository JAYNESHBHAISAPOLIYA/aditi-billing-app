import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

// ── BOQUpload Component ────────────────────────────────────────────────────
function BOQUpload({ siteId, onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!siteId) return setError('Please select a site first');
    if (!file || file.type !== 'application/pdf') return setError('Only PDF files are supported');
    setError('');
    setResult(null);
    setUploading(true);
    setProgress(10);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgress(40);
      const data = await api.upload(`/api/ai/upload-boq/${siteId}`, formData);
      setProgress(100);
      setResult(data);
      onSuccess && onSuccess();
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="font-semibold text-lg mb-3">🤖 AI BOQ Upload</h2>
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {uploading ? (
          <div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="text-sm text-gray-500">AI is extracting BOQ items and matching SOR rates…</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-2">📄</div>
            <p className="font-medium text-gray-700">Drop BOQ PDF here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">AI will auto-extract items & match Gujarat PWD SOR 2024-25 rates</p>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm">
          <p className="text-green-700 font-semibold">✅ Extracted {result.items_extracted} items</p>
          <p className="text-green-600">{result.items?.filter(i => i.sor_match).length || 0} items matched with SOR rates</p>
        </div>
      )}
    </div>
  );
}

// ── SORMatcher Component ──────────────────────────────────────────────────
function SORMatcher({ item, onOverride }) {
  const [showOverride, setShowOverride] = useState(false);
  const [sorRates, setSorRates] = useState([]);
  const [selectedSor, setSelectedSor] = useState('');

  const loadSorRates = async () => {
    try {
      const rates = await api.get('/api/ai/sor-rates');
      setSorRates(rates);
    } catch {}
  };

  const handleOverride = async () => {
    if (!selectedSor) return;
    const sor = sorRates.find(r => r.id === Number(selectedSor));
    if (!sor) return;
    await api.post('/api/ai/override-sor', { boq_item_id: item.id, sor_rate: sor.rate, sor_item_id: sor.id });
    onOverride && onOverride();
    setShowOverride(false);
  };

  const conf = item.sor_match_confidence || 0;
  const confColor = conf >= 70 ? 'text-green-600' : conf >= 40 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="text-xs">
      {item.sor_rate > 0 ? (
        <div className="flex items-center gap-1">
          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">SOR</span>
          <span>₹{Number(item.sor_rate).toLocaleString('en-IN')}</span>
          <span className={confColor}>{conf}%</span>
          <button onClick={() => { setShowOverride(!showOverride); loadSorRates(); }} className="text-blue-500 underline ml-1">override</button>
        </div>
      ) : (
        <button onClick={() => { setShowOverride(!showOverride); loadSorRates(); }} className="text-orange-500 underline">Match SOR</button>
      )}
      {showOverride && (
        <div className="mt-1 flex gap-1">
          <select value={selectedSor} onChange={e => setSelectedSor(e.target.value)} className="border rounded px-1 py-0.5 text-xs flex-1">
            <option value="">Select SOR rate</option>
            {sorRates.map(r => (
              <option key={r.id} value={r.id}>{r.item_code} – {r.description.substring(0, 40)} (₹{r.rate}/{r.unit})</option>
            ))}
          </select>
          <button onClick={handleOverride} className="bg-blue-600 text-white px-2 rounded text-xs">Apply</button>
        </div>
      )}
    </div>
  );
}

// ── DPRUpload Component ───────────────────────────────────────────────────
function DPRUpload({ siteId, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!siteId) return setError('Select a site first');
    setError('');
    setResult(null);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const data = await api.upload(`/api/ai/upload-dpr/${siteId}`, formData);
      setResult(data);
      onSuccess && onSuccess();
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="font-semibold text-lg mb-3">📋 Upload DPR</h2>
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-5 text-center cursor-pointer hover:border-purple-400"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => handleFile(e.target.files[0])} />
        {uploading ? (
          <p className="text-sm text-gray-500 animate-pulse">AI extracting DPR data and updating BOQ progress…</p>
        ) : (
          <>
            <div className="text-3xl mb-1">📷</div>
            <p className="text-sm text-gray-600">Upload DPR PDF or photo</p>
            <p className="text-xs text-gray-400">Auto-updates BOQ quantities used</p>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="mt-2 p-2 bg-purple-50 rounded text-sm">
          <p className="text-purple-700 font-medium">✅ DPR saved for {result.date}</p>
          <p className="text-purple-600">{result.work_items} work items extracted</p>
          {result.labour && <p className="text-purple-600">Labour: {(result.labour.skilled || 0) + (result.labour.unskilled || 0)} workers</p>}
        </div>
      )}
    </div>
  );
}

// ── AIChat Component ──────────────────────────────────────────────────────
function AIChat({ siteId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgEndRef = useRef();

  const quickQuestions = [
    'DI K7 pipe 100mm ketli lagi?',
    'Project finish hase kyare?',
    'Aaj no total kharcho?',
    'BOQ completion percentage?',
    'Labour this month?',
    'Balance work value?',
  ];

  useEffect(() => {
    if (open && siteId) loadHistory();
  }, [open, siteId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const hist = await api.get(`/api/ai/chat-history/${siteId}`);
      setMessages(hist.map(h => [
        { role: 'user', text: h.user_message, time: h.created_at },
        { role: 'ai', text: h.ai_response, sources: h.tables_referenced, time: h.created_at },
      ]).flat());
    } catch {}
  };

  const askQuestion = async (q) => {
    if (!siteId) { alert('Select a site first'); return; }
    const question = q || input.trim();
    if (!question) return;

    setMessages(prev => [...prev, { role: 'user', text: question, time: new Date().toISOString() }]);
    setInput('');
    setLoading(true);

    try {
      const data = await api.post(`/api/ai/ask/${siteId}`, { question });
      setMessages(prev => [...prev, {
        role: 'ai', text: data.answer,
        sources: data.tables_referenced?.join(', '),
        time: new Date().toISOString(),
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}`, time: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl hover:bg-blue-700 z-50 text-2xl"
        title="AI Assistant"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-96 bg-white rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col z-50" style={{ maxHeight: '80vh' }}>
      <div className="bg-blue-600 text-white px-4 py-3 rounded-t-xl flex justify-between items-center">
        <span className="font-semibold">🤖 AI Assistant (ERP)</span>
        <button onClick={() => setOpen(false)} className="text-white text-xl leading-none">×</button>
      </div>
      <div className="p-3 border-b flex flex-wrap gap-1.5">
        {quickQuestions.map(q => (
          <button key={q} onClick={() => askQuestion(q)}
            className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-1 hover:bg-blue-100 transition-colors">
            {q}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-4">Ask anything about your project in Gujarati, Hindi or English</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
              {msg.sources && <p className="text-xs mt-1 opacity-60">From: {msg.sources}</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-500 animate-pulse">AI is thinking…</div>
          </div>
        )}
        <div ref={msgEndRef} />
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && askQuestion()}
          placeholder="Type in Gujarati, Hindi or English…"
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button onClick={() => askQuestion()} disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          Send
        </button>
      </div>
    </div>
  );
}

// ── RaBillModal Component ────────────────────────────────────────────────
function RaBillModal({ siteId, onClose }) {
  const [form, setForm] = useState({
    bill_no: 1,
    bill_period_from: '',
    bill_period_to: '',
    bill_date: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ra-bill/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: siteId, ...form }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RA_Bill_${form.bill_no}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">📑 Generate RA Bill (Excel)</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Bill No</label>
            <input type="number" min="1" value={form.bill_no} onChange={e => setForm({ ...form, bill_no: e.target.value })} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Period From</label>
            <input type="date" value={form.bill_period_from} onChange={e => setForm({ ...form, bill_period_from: e.target.value })} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Period To</label>
            <input type="date" value={form.bill_period_to} onChange={e => setForm({ ...form, bill_period_to: e.target.value })} className="border rounded-lg px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bill Date</label>
            <input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} className="border rounded-lg px-3 py-2 w-full" />
          </div>
        </div>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={handleGenerate} disabled={loading}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Generating…' : '⬇ Download Excel'}
          </button>
          <button onClick={onClose} className="flex-1 border rounded-lg py-2 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main BOQ Page ─────────────────────────────────────────────────────────
export default function BOQ() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDPR, setShowDPR] = useState(false);
  const [showRaBill, setShowRaBill] = useState(false);
  const [form, setForm] = useState({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });

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
    const qty = Number(form.quantity) || 0;
    const rate = Number(form.rate) || 0;
    const total = qty * rate;
    const remaining = qty * (1 - (Number(form.work_completed_pct) || 0) / 100);
    await api.post('/api/boq', { ...form, qty_tender: qty, total_amount: total, remaining_work: remaining });
    setForm({ site_id: '', item_number: '', description: '', quantity: '', unit: '', rate: '', work_completed_pct: 0, actual_cost: '' });
    setShowForm(false);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this BOQ item?')) { await api.del(`/api/boq/${id}`); loadItems(); }
  };

  const totalValue = items.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalUsedQtyValue = items.reduce((s, i) => s + ((i.qty_used || 0) * (i.sor_rate || i.rate || 0)), 0);
  const avgProgress = items.length ? Math.round(items.reduce((s, i) => s + (i.work_completed_pct || 0), 0) / items.length) : 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">📋 BOQ & Item Tracking</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered SOR rate matching | Gujarat PWD 2024-25</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
          </select>
          {siteFilter && (
            <>
              <button onClick={() => setShowUpload(!showUpload)} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">
                🤖 AI Upload BOQ
              </button>
              <button onClick={() => setShowDPR(!showDPR)} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-indigo-700">
                📷 Upload DPR
              </button>
              <button onClick={() => setShowRaBill(true)} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700">
                📑 RA Bill
              </button>
            </>
          )}
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
            {showForm ? 'Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-xs text-gray-500">Total BOQ Value</p>
            <p className="text-lg font-bold text-blue-700">₹{Number(totalValue).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-xs text-gray-500">Work Done Value</p>
            <p className="text-lg font-bold text-green-700">₹{Number(totalUsedQtyValue).toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-xs text-gray-500">Avg Progress</p>
            <p className="text-lg font-bold text-orange-600">{avgProgress}%</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-xs text-gray-500">Total Items</p>
            <p className="text-lg font-bold text-gray-800">{items.length}</p>
          </div>
        </div>
      )}

      {showUpload && siteFilter && (
        <div className="mb-5">
          <BOQUpload siteId={siteFilter} onSuccess={() => { loadItems(); setShowUpload(false); }} />
        </div>
      )}
      {showDPR && siteFilter && (
        <div className="mb-5">
          <DPRUpload siteId={siteFilter} onSuccess={() => { loadItems(); setShowDPR(false); }} />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <select required value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select Site *</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
            <input placeholder="Item Number (e.g. B-1-01)" value={form.item_number} onChange={e => setForm({ ...form, item_number: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input placeholder="Unit (RM, Nos, Cum…)" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-3 py-2" />
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
              <th className="text-left p-3 whitespace-nowrap">Item #</th>
              <th className="text-left p-3">Description</th>
              <th className="text-right p-3 whitespace-nowrap">Unit</th>
              <th className="text-right p-3 whitespace-nowrap">Tender Qty</th>
              <th className="text-right p-3 whitespace-nowrap">Used</th>
              <th className="text-right p-3 whitespace-nowrap">Balance</th>
              <th className="text-left p-3 whitespace-nowrap">SOR Rate</th>
              <th className="text-right p-3 whitespace-nowrap">Amount</th>
              <th className="text-center p-3 whitespace-nowrap">Progress</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const tenderQty = item.qty_tender || item.quantity || 0;
              const usedQty = item.qty_used || 0;
              const balance = tenderQty - usedQty;
              return (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium whitespace-nowrap">{item.item_number}</td>
                  <td className="p-3 max-w-xs">
                    <p className="truncate" title={item.description}>{item.description}</p>
                    {item.source_doc && <p className="text-xs text-gray-400">📄 {item.source_doc}</p>}
                  </td>
                  <td className="p-3 text-right">{item.unit}</td>
                  <td className="p-3 text-right">{Number(tenderQty).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right text-green-700">{Number(usedQty).toLocaleString('en-IN')}</td>
                  <td className={`p-3 text-right font-medium ${balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                    {Number(balance).toLocaleString('en-IN')}
                  </td>
                  <td className="p-3">
                    <SORMatcher item={item} onOverride={loadItems} />
                  </td>
                  <td className="p-3 text-right font-semibold">₹{Number(item.total_amount || 0).toLocaleString('en-IN')}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${item.work_completed_pct >= 100 ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${Math.min(item.work_completed_pct || 0, 100)}%` }}></div>
                      </div>
                      <span className="text-xs whitespace-nowrap">{item.work_completed_pct || 0}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan="10" className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📋</p>
                <p>No BOQ items found. Upload a PDF or add manually.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showRaBill && <RaBillModal siteId={siteFilter} onClose={() => setShowRaBill(false)} />}
      <AIChat siteId={siteFilter} />
    </div>
  );
}

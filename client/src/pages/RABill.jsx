import { useState, useEffect } from 'react';
import { api } from '../api';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RABill() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [billNo, setBillNo] = useState('1');
  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/sites').then(setSites).catch(console.error);
  }, []);

  const loadPreview = async () => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/ra-bill/preview/${siteId}`);
      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (siteId) loadPreview();
    else setPreview(null);
  }, [siteId]);

  const downloadExcel = async () => {
    if (!siteId) return;
    setGenerating(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        bill_no: billNo,
        bill_from: billFrom,
        bill_to: billTo,
        bill_date: billDate
      });
      const res = await fetch(`/api/ra-bill/generate/${siteId}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RA_Bill_${billNo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">📑 RA Bill Generator</h1>
        <button
          onClick={downloadExcel}
          disabled={!siteId || generating}
          className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
        >
          {generating ? '⏳ Generating...' : '⬇️ Download Excel'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}

      {/* Bill Settings */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <h2 className="font-semibold mb-3 text-gray-700">Bill Settings</h2>
        <div className="grid md:grid-cols-5 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Site *</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select Site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bill No.</label>
            <input type="text" value={billNo} onChange={e => setBillNo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Period From</label>
            <input type="date" value={billFrom} onChange={e => setBillFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Period To</label>
            <input type="date" value={billTo} onChange={e => setBillTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Bill Date</label>
            <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-8 text-gray-500">Loading preview...</div>}

      {preview && (
        <>
          {/* Statement of Accounts */}
          <div className="bg-white rounded-xl shadow p-5 mb-6">
            <h2 className="font-semibold mb-4 text-gray-700">📊 Statement of Accounts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['A', 'Gross Amount (Upto Date)', preview.summary.upto_date_amount, false],
                    ['B', 'Additional Work / Variation', 0, false],
                    ['C', 'Total (A + B)', preview.summary.upto_date_amount, false],
                    ['D', 'T.P. Deduction -3.60% of C', -preview.summary.tp_deduction, false],
                    ['E', 'C - D', preview.summary.after_tp, false],
                    ['F', 'Price Variation (Clause-59)', 0, false],
                    ['G', 'E + F', preview.summary.after_tp, false],
                    ['H', '5% Retention of G', -preview.summary.retention, false],
                    ['I', 'Net Payable (G - H) — Excl. GST', preview.summary.net_payable, true],
                  ].map(([label, desc, amt, highlight]) => (
                    <tr key={label} className={`border-t ${highlight ? 'bg-green-50 font-bold text-green-800' : ''}`}>
                      <td className="py-2 px-3 w-8 text-center font-bold">{label}</td>
                      <td className="py-2 px-3">{desc}</td>
                      <td className={`py-2 px-3 text-right font-mono ${amt < 0 ? 'text-red-600' : ''}`}>
                        {amt < 0 ? '-' : ''}₹{fmt(Math.abs(amt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* BOQ Items Preview */}
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-700">📋 BOQ Items ({preview.boq_items.length} items)</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Item</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-center p-3">Unit</th>
                  <th className="text-right p-3">Tender Qty</th>
                  <th className="text-right p-3">Tender Rate</th>
                  <th className="text-right p-3">Tender Amt</th>
                  <th className="text-right p-3">Actual Cost</th>
                  <th className="text-center p-3">Progress</th>
                </tr>
              </thead>
              <tbody>
                {preview.boq_items.map((item, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.item_number || i + 1}</td>
                    <td className="p-3">{item.description}</td>
                    <td className="p-3 text-center">{item.unit}</td>
                    <td className="p-3 text-right">{Number(item.tender_qty || 0).toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right">₹{fmt(item.tender_rate)}</td>
                    <td className="p-3 text-right">₹{fmt(item.total_amount)}</td>
                    <td className={`p-3 text-right ${item.actual_cost > item.total_amount ? 'text-red-600' : 'text-green-700'}`}>
                      ₹{fmt(item.actual_cost)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.work_completed_pct >= 100 ? 'bg-green-100 text-green-700' : item.work_completed_pct > 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                        {item.work_completed_pct || 0}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr className="border-t-2">
                  <td colSpan="5" className="p-3 text-right">Total BOQ Amount:</td>
                  <td className="p-3 text-right">₹{fmt(preview.summary.total_boq_amount)}</td>
                  <td className="p-3 text-right text-green-700">₹{fmt(preview.summary.upto_date_amount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!siteId && (
        <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center text-gray-500">
          <p className="text-4xl mb-3">📑</p>
          <p className="font-medium">Select a site to preview the RA Bill</p>
          <p className="text-sm mt-1">The RA Bill will be generated in GUDCL format with Statement of Accounts</p>
        </div>
      )}
    </div>
  );
}

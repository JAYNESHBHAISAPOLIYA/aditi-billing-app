import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('site-expenses');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [data, setData] = useState(null);
  const [profitData, setProfitData] = useState(null);
  const [materialData, setMaterialData] = useState(null);
  const [vendorData, setVendorData] = useState(null);

  useEffect(() => { api.get('/api/sites').then(setSites).catch(console.error); }, []);

  const generateReport = async () => {
    setData(null); setProfitData(null); setMaterialData(null); setVendorData(null);
    try {
      if (reportType === 'site-expenses' && siteId) {
        const result = await api.get(`/api/dashboard/site-expenses?site_id=${siteId}`);
        setData(result);
      } else if (reportType === 'profit-loss') {
        const result = await api.get('/api/dashboard/profit-loss');
        setProfitData(result);
      } else if (reportType === 'material') {
        const url = siteId ? `/api/dashboard/material-report?site_id=${siteId}` : '/api/dashboard/material-report';
        const result = await api.get(url);
        setMaterialData(result);
      } else if (reportType === 'vendor') {
        const result = await api.get('/api/dashboard/vendor-report');
        setVendorData(result);
      } else if (reportType === 'labour' && siteId) {
        const result = await api.get(`/api/labour?site_id=${siteId}`);
        setData({ labour: result });
      }
    } catch (err) { console.error(err); }
  };

  const exportCSV = (rows, filename) => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📈 Reports & Export</h1>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="grid md:grid-cols-4 gap-4">
          <select value={reportType} onChange={e => setReportType(e.target.value)} className="border rounded-lg px-3 py-2">
            <option value="site-expenses">Site Expenses</option>
            <option value="labour">Labour Report</option>
            <option value="material">Material Consumption</option>
            <option value="vendor">Vendor Report</option>
            {user?.role === 'owner' && <option value="profit-loss">Profit / Loss</option>}
          </select>
          {['site-expenses', 'labour', 'material'].includes(reportType) && (
            <select value={siteId} onChange={e => setSiteId(e.target.value)} className="border rounded-lg px-3 py-2">
              <option value="">Select Site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.site_name}</option>)}
            </select>
          )}
          <button onClick={generateReport} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">Generate</button>
        </div>
      </div>

      {/* Site Expenses Report */}
      {data && reportType === 'site-expenses' && (
        <div className="space-y-4">
          {data.materials?.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold">Material Purchases ({data.materials.length})</h2>
                <button onClick={() => exportCSV(data.materials, 'materials')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="text-left p-2">Material</th><th className="text-left p-2">Supplier</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Total</th><th className="text-left p-2">Date</th></tr></thead>
                  <tbody>{data.materials.map(m => <tr key={m.id} className="border-t"><td className="p-2">{m.material_name}</td><td className="p-2">{m.supplier}</td><td className="p-2 text-right">{m.quantity}</td><td className="p-2 text-right">₹{Number(m.total_amount).toLocaleString('en-IN')}</td><td className="p-2">{m.purchase_date}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {data.labour?.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold">Labour Records ({data.labour.length})</h2>
                <button onClick={() => exportCSV(data.labour, 'labour')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="text-left p-2">Worker</th><th className="text-left p-2">Type</th><th className="text-right p-2">Days</th><th className="text-right p-2">Salary</th><th className="text-center p-2">Status</th></tr></thead>
                  <tbody>{data.labour.map(l => <tr key={l.id} className="border-t"><td className="p-2">{l.worker_name}</td><td className="p-2">{l.labour_type}</td><td className="p-2 text-right">{l.total_days_worked}</td><td className="p-2 text-right">₹{Number(l.total_salary).toLocaleString('en-IN')}</td><td className="p-2 text-center">{l.payment_status}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Labour Report */}
      {data && reportType === 'labour' && data.labour && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Labour Report ({data.labour.length})</h2>
            <button onClick={() => exportCSV(data.labour, 'labour-report')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Worker</th><th className="text-left p-2">Type</th><th className="text-right p-2">Wage</th><th className="text-right p-2">Days</th><th className="text-right p-2">Total</th><th className="text-center p-2">Status</th></tr></thead>
              <tbody>{data.labour.map(l => <tr key={l.id} className="border-t"><td className="p-2">{l.worker_name}</td><td className="p-2">{l.labour_type}</td><td className="p-2 text-right">₹{Number(l.wage_amount).toLocaleString('en-IN')}</td><td className="p-2 text-right">{l.total_days_worked}</td><td className="p-2 text-right font-semibold">₹{Number(l.total_salary).toLocaleString('en-IN')}</td><td className="p-2 text-center">{l.payment_status}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profit/Loss Report */}
      {profitData && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Profit / Loss Report</h2>
            <button onClick={() => exportCSV(profitData, 'profit-loss')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Site</th><th className="text-right p-2">Expenses</th><th className="text-right p-2">Revenue</th><th className="text-right p-2">P/L</th></tr></thead>
              <tbody>{profitData.map(p => <tr key={p.site_id} className="border-t"><td className="p-2 font-medium">{p.site_name}</td><td className="p-2 text-right">₹{Number(p.total_expenses).toLocaleString('en-IN')}</td><td className="p-2 text-right">₹{Number(p.total_revenue).toLocaleString('en-IN')}</td><td className={`p-2 text-right font-bold ${p.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{Number(p.profit_loss).toLocaleString('en-IN')}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Material Report */}
      {materialData && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Material Consumption Report</h2>
            <button onClick={() => exportCSV(materialData, 'material-report')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Material</th><th className="text-right p-2">Total Qty</th><th className="text-left p-2">Unit</th><th className="text-right p-2">Total Cost</th><th className="text-right p-2">Purchases</th></tr></thead>
              <tbody>{materialData.map((m, i) => <tr key={i} className="border-t"><td className="p-2 font-medium">{m.material_name}</td><td className="p-2 text-right">{m.total_quantity}</td><td className="p-2">{m.unit}</td><td className="p-2 text-right font-semibold">₹{Number(m.total_cost).toLocaleString('en-IN')}</td><td className="p-2 text-right">{m.purchase_count}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vendor Report */}
      {vendorData && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">Vendor Report</h2>
            <button onClick={() => exportCSV(vendorData, 'vendor-report')} className="text-sm text-blue-600 hover:underline">📥 Export CSV</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="text-left p-2">Vendor</th><th className="text-left p-2">Material</th><th className="text-left p-2">Contact</th><th className="text-right p-2">Total Purchase</th><th className="text-right p-2">Pending</th></tr></thead>
              <tbody>{vendorData.map(v => <tr key={v.id} className="border-t"><td className="p-2 font-medium">{v.vendor_name}</td><td className="p-2">{v.material_type}</td><td className="p-2">{v.contact_number}</td><td className="p-2 text-right">₹{Number(v.total_purchase).toLocaleString('en-IN')}</td><td className={`p-2 text-right font-semibold ${v.payment_pending > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{Number(v.payment_pending).toLocaleString('en-IN')}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

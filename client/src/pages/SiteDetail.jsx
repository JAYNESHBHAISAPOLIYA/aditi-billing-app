import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308', '#9333ea', '#f97316'];

export default function SiteDetail() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.get(`/api/sites/${id}`).then(setSite).catch(console.error);
    api.get(`/api/sites/${id}/summary`).then(setSummary).catch(console.error);
  }, [id]);

  if (!site) return <div className="text-center py-10">Loading...</div>;

  const pieData = summary ? [
    { name: 'Material', value: summary.material_cost },
    { name: 'Labour', value: summary.labour_cost },
    { name: 'Office', value: summary.office_cost },
    { name: 'Fuel', value: summary.fuel_cost },
    { name: 'Machinery', value: summary.machinery_cost },
    { name: 'Government', value: summary.government_cost },
  ].filter(d => d.value > 0) : [];

  return (
    <div>
      <Link to="/sites" className="text-blue-600 hover:underline text-sm mb-4 inline-block">← Back to Sites</Link>
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between">
          <div>
            <h1 className="text-2xl font-bold">{site.site_name}</h1>
            <p className="text-gray-500">📍 {site.site_location} | 📋 {site.tender_number}</p>
            <p className="text-gray-500">🏢 {site.department_name} | 👤 {site.manager_name || 'Unassigned'}</p>
            <p className="text-gray-500">📅 {site.start_date} → {site.completion_date}</p>
          </div>
          <div className="mt-4 md:mt-0 text-right">
            <span className={`text-sm px-3 py-1 rounded-full ${site.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{site.status}</span>
            <div className="mt-2">
              <div className="flex items-center gap-2 justify-end">
                <div className="w-32 bg-gray-200 rounded-full h-3">
                  <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${site.progress_percentage}%` }}></div>
                </div>
                <span className="font-bold">{site.progress_percentage}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Expenses</div>
              <div className="text-xl font-bold text-red-600">₹{Number(summary.total_expenses).toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Total Billed</div>
              <div className="text-xl font-bold text-blue-600">₹{Number(summary.total_billed).toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Payment Received</div>
              <div className="text-xl font-bold text-green-600">₹{Number(summary.payment_received).toLocaleString('en-IN')}</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-sm text-gray-500">Profit / Loss</div>
              <div className={`text-xl font-bold ${summary.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{Number(summary.profit_loss).toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow p-4">
              <h2 className="text-lg font-semibold mb-4">Expense Breakdown</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-center py-10">No data yet</p>}
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <h2 className="text-lg font-semibold mb-4">Cost Details</h2>
              <div className="space-y-3">
                {[
                  { label: '🧱 Material', value: summary.material_cost },
                  { label: '👷 Labour', value: summary.labour_cost },
                  { label: '🏢 Office', value: summary.office_cost },
                  { label: '⛽ Fuel', value: summary.fuel_cost },
                  { label: '🚜 Machinery', value: summary.machinery_cost },
                  { label: '🏛️ Government', value: summary.government_cost },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-semibold">₹{Number(item.value).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

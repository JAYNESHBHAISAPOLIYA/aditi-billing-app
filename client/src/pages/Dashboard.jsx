import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308', '#9333ea', '#f97316'];

function StatCard({ label, value, color = 'blue', icon }) {
  return (
    <div className={`bg-white rounded-xl shadow p-4 border-l-4 border-${color}-500`}>
      <div className="text-sm text-gray-500">{icon} {label}</div>
      <div className="text-xl md:text-2xl font-bold mt-1">₹{Number(value || 0).toLocaleString('en-IN')}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role === 'owner') {
      api.get('/api/dashboard/dashboard').then(setData).catch(console.error).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return <div className="text-center py-10">Loading dashboard...</div>;

  if (user?.role !== 'owner') {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <h1 className="text-2xl font-bold mb-4">Welcome, {user?.full_name}!</h1>
        <p className="text-gray-600">Role: <span className="capitalize font-semibold">{user?.role?.replace('_', ' ')}</span></p>
        <p className="text-gray-500 mt-4">Use the sidebar to navigate to your assigned sections.</p>
      </div>
    );
  }

  if (!data) return <div className="text-center py-10">No data available</div>;

  const { totals, sites, monthlySpending } = data;

  const pieData = [
    { name: 'Material', value: totals.total_material },
    { name: 'Labour', value: totals.total_labour },
    { name: 'Office', value: totals.total_office },
    { name: 'Fuel', value: totals.total_fuel },
    { name: 'Machinery', value: totals.total_machinery },
    { name: 'Government', value: totals.total_government },
  ].filter(d => d.value > 0);

  const siteBarData = sites.map(s => ({
    name: s.site_name.length > 15 ? s.site_name.slice(0, 15) + '...' : s.site_name,
    expenses: s.total_expenses,
    received: s.payment_received,
    progress: s.progress_percentage
  }));

  // Aggregate monthly spending
  const monthMap = {};
  (monthlySpending || []).forEach(m => {
    if (!monthMap[m.month]) monthMap[m.month] = { month: m.month };
    monthMap[m.month][m.type] = (monthMap[m.month][m.type] || 0) + m.amount;
  });
  const monthlyData = Object.values(monthMap).sort((a, b) => a.month?.localeCompare(b.month));

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">📊 Owner Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Expenses" value={totals.total_expenses} color="red" icon="💸" />
        <StatCard label="Total Billed" value={totals.total_billed} color="blue" icon="📄" />
        <StatCard label="Payment Received" value={totals.total_received} color="green" icon="✅" />
        <StatCard label="Profit / Loss" value={totals.total_profit_loss} color={totals.total_profit_loss >= 0 ? 'green' : 'red'} icon={totals.total_profit_loss >= 0 ? '📈' : '📉'} />
      </div>

      {/* Expense Breakdown Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Material" value={totals.total_material} color="blue" icon="🧱" />
        <StatCard label="Labour" value={totals.total_labour} color="yellow" icon="👷" />
        <StatCard label="Office" value={totals.total_office} color="purple" icon="🏢" />
        <StatCard label="Fuel" value={totals.total_fuel} color="orange" icon="⛽" />
        <StatCard label="Machinery" value={totals.total_machinery} color="green" icon="🚜" />
        <StatCard label="Government" value={totals.total_government} color="red" icon="🏛️" />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Expense Distribution Pie */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Expense Distribution</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-10">No expense data</p>}
        </div>

        {/* Site Progress Bar */}
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-semibold mb-4">Site Progress (%)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={siteBarData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="progress" fill="#2563eb" name="Progress %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Spending */}
      {monthlyData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">Monthly Spending</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Legend />
              <Bar dataKey="material" fill="#2563eb" name="Material" />
              <Bar dataKey="labour" fill="#eab308" name="Labour" />
              <Bar dataKey="office" fill="#9333ea" name="Office" />
              <Bar dataKey="fuel" fill="#f97316" name="Fuel" />
              <Bar dataKey="machinery" fill="#16a34a" name="Machinery" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Site Summary Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <h2 className="text-lg font-semibold p-4 border-b">All Sites Summary</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Site</th>
              <th className="text-right p-3">Progress</th>
              <th className="text-right p-3">Estimated</th>
              <th className="text-right p-3">Expenses</th>
              <th className="text-right p-3">Received</th>
              <th className="text-right p-3">P/L</th>
            </tr>
          </thead>
          <tbody>
            {sites.map(s => (
              <tr key={s.site_id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-medium">{s.site_name}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${s.progress_percentage}%` }}></div>
                    </div>
                    <span className="text-xs">{s.progress_percentage}%</span>
                  </div>
                </td>
                <td className="p-3 text-right">₹{Number(s.estimated_cost).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right">₹{Number(s.total_expenses).toLocaleString('en-IN')}</td>
                <td className="p-3 text-right">₹{Number(s.payment_received).toLocaleString('en-IN')}</td>
                <td className={`p-3 text-right font-semibold ${s.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{Number(s.profit_loss).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

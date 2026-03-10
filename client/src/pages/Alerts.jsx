import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    try {
      await api.post('/api/alerts/generate', {});
    } catch { /* ignore */ }
    api.get('/api/alerts').then(setAlerts).catch(console.error);
  };

  const markRead = async (id) => {
    await api.put(`/api/alerts/${id}/read`, {});
    loadAlerts();
  };

  const markAllRead = async () => {
    await api.put('/api/alerts/read-all', {});
    loadAlerts();
  };

  const alertIcons = {
    labour_payment: '👷',
    vendor_payment: '🤝',
    bill_approval: '📄',
    project_delay: '⏰',
    budget_overrun: '💸'
  };

  const alertColors = {
    labour_payment: 'border-yellow-400 bg-yellow-50',
    vendor_payment: 'border-orange-400 bg-orange-50',
    bill_approval: 'border-blue-400 bg-blue-50',
    project_delay: 'border-red-400 bg-red-50',
    budget_overrun: 'border-red-500 bg-red-50'
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">🔔 Alerts & Notifications</h1>
        <div className="flex gap-2">
          <button onClick={loadAlerts} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">🔄 Refresh</button>
          <button onClick={markAllRead} className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">Mark All Read</button>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.map(alert => (
          <div key={alert.id} className={`rounded-xl border-l-4 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${alert.is_read ? 'bg-gray-50 border-gray-300 opacity-60' : alertColors[alert.alert_type] || 'border-gray-400 bg-gray-50'}`}>
            <div>
              <span className="text-lg mr-2">{alertIcons[alert.alert_type] || '📢'}</span>
              <span className={`${alert.is_read ? 'text-gray-500' : 'font-medium'}`}>{alert.message}</span>
              {alert.site_name && <span className="text-xs text-gray-400 ml-2">({alert.site_name})</span>}
              <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString()}</p>
            </div>
            {!alert.is_read && (
              <button onClick={() => markRead(alert.id)} className="text-xs bg-white border px-3 py-1 rounded hover:bg-gray-100 shrink-0">
                Mark Read
              </button>
            )}
          </div>
        ))}
        {alerts.length === 0 && <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No alerts</div>}
      </div>
    </div>
  );
}

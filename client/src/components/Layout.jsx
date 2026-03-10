import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: '📊 Dashboard', roles: ['owner', 'site_manager', 'accountant', 'worker'] },
  { path: '/sites', label: '🏗️ Sites', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/materials', label: '🧱 Materials', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/labour', label: '👷 Labour', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/office-expenses', label: '🏢 Office Expenses', roles: ['owner', 'accountant'] },
  { path: '/fuel', label: '⛽ Fuel', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/machinery', label: '🚜 Machinery', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/government', label: '🏛️ Govt Payments', roles: ['owner', 'accountant'] },
  { path: '/sales', label: '💰 Sale Bills', roles: ['owner', 'accountant'] },
  { path: '/daily-reports', label: '📝 Daily Reports', roles: ['owner', 'site_manager'] },
  { path: '/documents', label: '📄 Documents', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/boq', label: '📋 BOQ Tracking', roles: ['owner', 'site_manager'] },
  { path: '/vendors', label: '🤝 Vendors', roles: ['owner', 'accountant'] },
  { path: '/alerts', label: '🔔 Alerts', roles: ['owner', 'site_manager', 'accountant'] },
  { path: '/users', label: '👥 Users', roles: ['owner'] },
  { path: '/reports', label: '📈 Reports', roles: ['owner', 'accountant'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile header */}
      <div className="md:hidden bg-blue-900 text-white p-4 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-2xl">☰</button>
        <h1 className="text-lg font-bold">Aditi Construction</h1>
        <button onClick={logout} className="text-sm bg-red-600 px-3 py-1 rounded">Logout</button>
      </div>

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-blue-900 text-white flex-shrink-0 overflow-y-auto`}
             style={{ maxHeight: '100vh', position: 'sticky', top: 0 }}>
        <div className="p-4 border-b border-blue-800 hidden md:block">
          <h1 className="text-xl font-bold">🏗️ Aditi Construction</h1>
          <p className="text-blue-300 text-sm mt-1">{user?.full_name}</p>
          <p className="text-blue-400 text-xs capitalize">{user?.role?.replace('_', ' ')}</p>
        </div>
        <nav className="p-2">
          {filteredNav.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`block px-4 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-200 hover:bg-blue-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-800 hidden md:block">
          <button onClick={logout} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm">
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto" style={{ maxHeight: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

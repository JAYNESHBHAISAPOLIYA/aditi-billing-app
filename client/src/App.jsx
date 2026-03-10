import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail';
import Materials from './pages/Materials';
import Labour from './pages/Labour';
import OfficeExpenses from './pages/OfficeExpenses';
import FuelExpenses from './pages/FuelExpenses';
import Machinery from './pages/Machinery';
import Government from './pages/Government';
import SaleBills from './pages/SaleBills';
import DailyReports from './pages/DailyReports';
import Documents from './pages/Documents';
import BOQ from './pages/BOQ';
import Vendors from './pages/Vendors';
import Alerts from './pages/Alerts';
import Users from './pages/Users';
import Reports from './pages/Reports';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-lg">Loading...</div></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="sites/:id" element={<SiteDetail />} />
        <Route path="materials" element={<Materials />} />
        <Route path="labour" element={<Labour />} />
        <Route path="office-expenses" element={<OfficeExpenses />} />
        <Route path="fuel" element={<FuelExpenses />} />
        <Route path="machinery" element={<Machinery />} />
        <Route path="government" element={<Government />} />
        <Route path="sales" element={<SaleBills />} />
        <Route path="daily-reports" element={<DailyReports />} />
        <Route path="documents" element={<Documents />} />
        <Route path="boq" element={<BOQ />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="users" element={<Users />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}

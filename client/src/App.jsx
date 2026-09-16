import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import NewSale from './pages/NewSale';
import Products from './pages/Products';
import ProductEdit from './pages/ProductEdit';
import Services from './pages/Services';
import ServiceEdit from './pages/ServiceEdit';
import ServiceJobs from './pages/ServiceJobs';
import ServiceJobForm from './pages/ServiceJobForm';
import Debts from './pages/Debts';
import DebtForm from './pages/DebtForm';
import Statements from './pages/Statements';
import StatementView from './pages/StatementView';
import ProfitLoss from './pages/ProfitLoss';
import Staff from './pages/Staff';
import Settings from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedRoute><NewSale /></ProtectedRoute>} />

      <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
      <Route path="/products/:id/edit" element={<ProtectedRoute adminOnly><ProductEdit /></ProtectedRoute>} />

      <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
      <Route path="/services/:id/edit" element={<ProtectedRoute adminOnly><ServiceEdit /></ProtectedRoute>} />

      <Route path="/service-jobs" element={<ProtectedRoute><ServiceJobs /></ProtectedRoute>} />
      <Route path="/service-jobs/new" element={<ProtectedRoute><ServiceJobForm /></ProtectedRoute>} />
      <Route path="/service-jobs/:id/edit" element={<ProtectedRoute><ServiceJobForm /></ProtectedRoute>} />

      <Route path="/debts" element={<ProtectedRoute><Debts /></ProtectedRoute>} />
      <Route path="/debts/new" element={<ProtectedRoute><DebtForm /></ProtectedRoute>} />
      <Route path="/debts/:id/edit" element={<ProtectedRoute><DebtForm /></ProtectedRoute>} />

      <Route path="/statements" element={<ProtectedRoute adminOnly><Statements /></ProtectedRoute>} />
      <Route path="/statements/:id" element={<ProtectedRoute><StatementView /></ProtectedRoute>} />

      <Route path="/profit-loss" element={<ProtectedRoute adminOnly><ProfitLoss /></ProtectedRoute>} />
      <Route path="/staff" element={<ProtectedRoute adminOnly><Staff /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
    </Routes>
  );
}

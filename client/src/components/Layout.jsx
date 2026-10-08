import { NavLink } from 'react-router-dom';
import {
  ReceiptText,
  Package,
  Wrench,
  ClipboardList,
  CreditCard,
  Calculator,
  ChartNoAxesCombined,
  Users,
  Settings,
  LogOut,
  Monitor,
  Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'New Sale', icon: ReceiptText, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/services', label: 'Services', icon: Wrench },
  { to: '/service-jobs', label: 'Service Records', icon: ClipboardList },
  { to: '/debts', label: 'Debts', icon: CreditCard },
];

const adminLinks = [
  { to: '/statements', label: 'Statements', icon: Calculator },
  { to: '/profit-loss', label: 'Profit & Loss', icon: ChartNoAxesCombined },
  { to: '/staff', label: 'Staff', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ title, children }) {
  const { user, logout, lowStockCount } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Monitor size={20} strokeWidth={1.8} />
           <span>IntelMind</span></div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="side-icon">
                <l.icon size={18} strokeWidth={1.8} />
              </span>
              {l.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <>
              <div className="sidebar-divider">Admin</div>
              {adminLinks.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <span className="side-icon">
                    <l.icon size={18} strokeWidth={1.8} />
                  </span>
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <button
          type="button"
          className="sidebar-logout"
          onClick={logout}
        >
          <LogOut size={18} strokeWidth={1.8} />
          <span>Log out</span>
        </button>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-right">
            <span className="topbar-bell" title={lowStockCount > 0 ? `${lowStockCount} product(s) running low` : 'No alerts'}>
              <Bell />{lowStockCount > 0 && <span className="bell-dot"></span>}
            </span>
            <div
              className="topbar-avatar"
              title={user ? `${user.name} (${user.role})` : ''}
            >
              {user ? user.name.slice(0, 2).toUpperCase() : ''}
            </div>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

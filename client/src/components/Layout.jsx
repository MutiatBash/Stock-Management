import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'New Sale', icon: '🧾', end: true },
  { to: '/products', label: 'Products', icon: '📦' },
  { to: '/services', label: 'Services', icon: '🛠️' },
  { to: '/service-jobs', label: 'Service Records', icon: '📋' },
  { to: '/debts', label: 'Debts', icon: '💳' },
];

const adminLinks = [
  { to: '/statements', label: 'Statements', icon: '🧮' },
  { to: '/profit-loss', label: 'Profit & Loss', icon: '📈' },
  { to: '/staff', label: 'Staff', icon: '👥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout({ title, children }) {
  const { user, logout, lowStockCount } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">💻 <span>IntelMind</span></div>
        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="side-icon">{l.icon}</span> {l.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <>
              <div className="sidebar-divider">Admin</div>
              {adminLinks.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <span className="side-icon">{l.icon}</span> {l.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-right">
            <span className="topbar-bell" title={lowStockCount > 0 ? `${lowStockCount} product(s) running low` : 'No alerts'}>
              🔔{lowStockCount > 0 && <span className="bell-dot"></span>}
            </span>
            <a
              href="#"
              className="topbar-avatar"
              title={user ? `${user.name} (${user.role}) — Log out` : ''}
              onClick={(e) => {
                e.preventDefault();
                logout();
              }}
            >
              {user ? user.name.slice(0, 2).toUpperCase() : ''}
            </a>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}

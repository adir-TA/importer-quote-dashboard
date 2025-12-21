import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  GitCompare,
  TrendingDown,
  Calculator,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../styles/sidebar.css';

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const navItems = [
    { section: 'Workflow', items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/products', icon: Package, label: 'Buying Intents' },
      { path: '/comparison', icon: GitCompare, label: 'Compare Quotes' },
    ]},
    { section: 'System', items: [
      { path: '/settings', icon: Settings, label: 'Settings' },
    ]}
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">📦</div>
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">ha tools</span>
            <span className="sidebar-brand-tagline">bro</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(section => (
          <div key={section.section} className="nav-section">
            <div className="nav-section-title">{section.section}</div>
            <div className="nav-section-divider" />
            {section.items.map(item => (
              <button
                key={item.path}
                className={`nav-item ${location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
          <div className="user-info">
            <span className="user-email">{user?.email}</span>
          </div>
        </div>
        <button className="backup-btn logout-btn" onClick={handleLogout}>
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;

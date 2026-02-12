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
  CreditCard,
  Search,
  Languages,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import logo from '../assets/logo.jpg';
import '../styles/sidebar.css';

function Sidebar({ onSearchOpen, isMobileOpen = false, onMobileClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { t, language, toggleLanguage, isRTL } = useLanguage();

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const navItems = [
    { section: t('sidebar.workflow'), items: [
      { path: '/', icon: LayoutDashboard, label: t('sidebar.dashboard') },
      { path: '/products', icon: Package, label: t('sidebar.buyingIntents') },
      { path: '/comparison', icon: GitCompare, label: t('sidebar.compareQuotes') },
      { path: '/business-cards', icon: CreditCard, label: t('sidebar.businessCards') },
    ]},
    { section: t('sidebar.system'), items: [
      { path: '/settings', icon: Settings, label: t('sidebar.settings') },
    ]}
  ];

  return (
    <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={logo} alt="HA Products" className="sidebar-logo-img" />
          <div className="sidebar-brand">
            <span className="sidebar-brand-name">HA Products</span>
            <span className="sidebar-brand-tagline">bro</span>
          </div>
        </div>
      </div>

      {/* Global Search Trigger */}
      <button
        className="sidebar-search-trigger"
        onClick={onSearchOpen}
        title="Search (F6)"
      >
        <Search size={16} />
        <span>{t('sidebar.search')}</span>
        <kbd className="search-kbd">F6</kbd>
      </button>

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
        <button className="backup-btn lang-btn" onClick={toggleLanguage}>
          <Languages size={14} />
          {language === 'en' ? 'עברית' : 'English'}
        </button>
        <button className="backup-btn logout-btn" onClick={handleLogout}>
          <LogOut size={14} />
          {t('sidebar.signOut')}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { Sidebar, GlobalSearch } from './components';
import {
  Dashboard,
  Products,
  ProductDetail,
  QuoteComparison,
  PortfolioComparison,
  Suppliers,
  Orders,
  Documents,
  AIHelpers,
  Settings,
  Login,
  Signup,
  LandedCost,
  BusinessCards,
} from './pages';

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Auth route wrapper (redirects to dashboard if already logged in)
function AuthRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppLayout() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  // Global keyboard shortcut for search (F6)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F6') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-container">
      {/* Mobile hamburger button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setIsMobileSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>

      {/* Sidebar with mobile drawer support */}
      <Sidebar
        onSearchOpen={() => setIsSearchOpen(true)}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Mobile overlay backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/comparison" element={<QuoteComparison />} />
          {/* <Route path="/portfolio" element={<PortfolioComparison />} /> */}
          <Route path="/landed-cost" element={<LandedCost />} />
          <Route path="/business-cards" element={<BusinessCards />} />
          <Route path="/settings" element={<Settings />} />
          {/* Hidden routes - not in navigation but still accessible */}
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/ai-helpers" element={<AIHelpers />} />
        </Routes>
      </main>

      {/* Global Search / Command Palette */}
      <GlobalSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthRoute>
            <Login />
          </AuthRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <AuthRoute>
            <Signup />
          </AuthRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { Sidebar, GlobalSearch } from './components';
// Auth pages load eagerly - they are the first thing an unauthenticated
// visitor needs. Everything else is split out so the initial bundle is not a
// single 1.8MB download of the whole app.
import { Login, Signup } from './pages';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const QuoteComparison = lazy(() => import('./pages/QuoteComparison'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Orders = lazy(() => import('./pages/Orders'));
const Documents = lazy(() => import('./pages/Documents'));
const AIHelpers = lazy(() => import('./pages/AIHelpers'));
const Settings = lazy(() => import('./pages/Settings'));
const LandedCost = lazy(() => import('./pages/LandedCost'));
const Containers = lazy(() => import('./pages/Containers'));
const ContainerEditor = lazy(() => import('./pages/ContainerEditor'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
        <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/comparison" element={<QuoteComparison />} />
          <Route path="/landed-cost" element={<LandedCost />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/containers/:id" element={<ContainerEditor />} />
          <Route path="/settings" element={<Settings />} />
          {/* Hidden routes - not in navigation but still accessible */}
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/ai-helpers" element={<AIHelpers />} />
          {/* Catch-all: an unknown URL used to render an empty content area */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
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
